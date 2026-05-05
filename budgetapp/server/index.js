const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const tesseract = require('node-tesseract-ocr');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'budget.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// Ensure dirs exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ===== DATABASE SETUP =====
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense',
    category_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    emoji TEXT DEFAULT '💰',
    color TEXT DEFAULT '#4caf82',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS item_category_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    category_id TEXT NOT NULL,
    match_count INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
`);

// Seed default budgets if empty
const budgetCount = db.prepare('SELECT COUNT(*) as c FROM budgets').get().c;
if (budgetCount === 0) {
  const insert = db.prepare('INSERT INTO budgets (id, name, amount, emoji, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const defaults = [
    ['1', 'Groceries',     5000, '🛒', '#4caf82', 1],
    ['2', 'Dining',        2000, '🍽️', '#f0a832', 2],
    ['3', 'Transport',     1500, '🚌', '#5b9cf6', 3],
    ['4', 'Shopping',      3000, '🛍️', '#c084fc', 4],
    ['5', 'Sport & health',1000, '🏃', '#34d399', 5],
    ['6', 'Home',          2000, '🏠', '#fb923c', 6],
    ['7', 'Entertainment', 1000, '🎮', '#f472b6', 7],
  ];
  defaults.forEach(d => insert.run(...d));
}

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/dist')));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  }
});

// ===== TRANSACTIONS =====
app.get('/api/transactions', (req, res) => {
  const { month, type } = req.query;
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params = [];
  if (month) { query += ' AND date LIKE ?'; params.push(month + '%'); }
  if (type)  { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY date DESC, created_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/transactions', (req, res) => {
  const { id, name, amount, date, type, category_id, notes } = req.body;
  const txId = id || Date.now().toString();
  db.prepare(`
    INSERT OR REPLACE INTO transactions (id, name, amount, date, type, category_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(txId, name, amount, date, type || 'expense', category_id || null, notes || null);

  // If category assigned, update the item→category map
  if (category_id && name) {
    learnMapping(name, category_id);
  }

  res.json({ id: txId });
});

app.put('/api/transactions/:id', (req, res) => {
  const { name, amount, date, type, category_id, notes } = req.body;
  db.prepare(`
    UPDATE transactions SET name=?, amount=?, date=?, type=?, category_id=?, notes=? WHERE id=?
  `).run(name, amount, date, type, category_id || null, notes || null, req.params.id);

  if (category_id && name) learnMapping(name, category_id);
  res.json({ ok: true });
});

app.delete('/api/transactions/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===== BUDGETS =====
app.get('/api/budgets', (req, res) => {
  res.json(db.prepare('SELECT * FROM budgets ORDER BY sort_order, name').all());
});

app.post('/api/budgets', (req, res) => {
  const { id, name, amount, emoji, color } = req.body;
  const bId = id || Date.now().toString();
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM budgets').get().m || 0;
  db.prepare(`
    INSERT OR REPLACE INTO budgets (id, name, amount, emoji, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(bId, name, amount, emoji || '💰', color || '#4caf82', maxOrder + 1);
  res.json({ id: bId });
});

app.put('/api/budgets/:id', (req, res) => {
  const { name, amount, emoji, color } = req.body;
  db.prepare('UPDATE budgets SET name=?, amount=?, emoji=?, color=? WHERE id=?')
    .run(name, amount, emoji, color, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/budgets/:id', (req, res) => {
  db.prepare('UPDATE transactions SET category_id=NULL WHERE category_id=?').run(req.params.id);
  db.prepare('DELETE FROM budgets WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===== ITEM → CATEGORY MAP =====
app.get('/api/mappings', (req, res) => {
  res.json(db.prepare('SELECT * FROM item_category_map ORDER BY match_count DESC').all());
});

app.put('/api/mappings/:id', (req, res) => {
  const { category_id } = req.body;
  db.prepare('UPDATE item_category_map SET category_id=?, updated_at=datetime("now") WHERE id=?')
    .run(category_id, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/mappings/:id', (req, res) => {
  db.prepare('DELETE FROM item_category_map WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

function learnMapping(itemName, categoryId) {
  const pattern = normalizeItemName(itemName);
  if (pattern.length < 2) return;
  db.prepare(`
    INSERT INTO item_category_map (pattern, category_id, match_count)
    VALUES (?, ?, 1)
    ON CONFLICT(pattern) DO UPDATE SET
      category_id = excluded.category_id,
      match_count = match_count + 1,
      updated_at = datetime('now')
  `).run(pattern, categoryId);
}

function normalizeItemName(name) {
  return name.toLowerCase()
    .replace(/\s+\d+[\.,]\d+\s*$/, '') // strip trailing price
    .replace(/\s+\d+\s*stk.*$/i, '')   // strip "2 stk"
    .replace(/[^a-zæøå0-9\s\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function lookupCategory(itemName) {
  const pattern = normalizeItemName(itemName);
  if (!pattern) return null;

  // Exact match first
  const exact = db.prepare('SELECT category_id FROM item_category_map WHERE pattern=?').get(pattern);
  if (exact) return exact.category_id;

  // Substring match — find any learned pattern that the item name contains or vice versa
  const all = db.prepare('SELECT pattern, category_id FROM item_category_map ORDER BY match_count DESC').all();
  for (const row of all) {
    if (pattern.includes(row.pattern) || row.pattern.includes(pattern)) {
      return row.category_id;
    }
  }
  return null;
}

// ===== OCR =====
app.post('/api/ocr', upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const inputPath = req.file.path;
  const processedPath = inputPath + '_processed.png';

  try {
    // Preprocess: greyscale, increase contrast, upscale for better OCR
    await sharp(inputPath)
      .resize({ width: 1400, withoutEnlargement: false })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1.2 })
      .png()
      .toFile(processedPath);

    const ocrText = await tesseract.recognize(processedPath, {
      lang: 'nor+eng',   // Norwegian + English — covers Rema, Kiwi etc.
      oem: 1,            // LSTM engine
      psm: 6,            // Assume single uniform block of text
    });

    const lines = parseReceiptLines(ocrText);

    // Attach learned category suggestions
    const categorised = lines.map(line => ({
      ...line,
      suggested_category: lookupCategory(line.name)
    }));

    res.json({ lines: categorised, store: parseStoreName(ocrText), raw: ocrText });

  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ error: err.message, detail: 'Is tesseract-ocr installed? Run: sudo apt install tesseract-ocr tesseract-ocr-nor' });
  } finally {
    fs.unlink(inputPath, () => {});
    fs.unlink(processedPath, () => {});
  }
});

function parseStoreName(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length >= 3);
  for (const line of lines) {
    if (/^\d/.test(line)) continue;                            // starts with digit
    if (/^(mva|total|sum|betalt|dato|kvittering|org)/i.test(line)) continue;
    if (/^\W+$/.test(line)) continue;                         // only punctuation
    if (line.length > 40) continue;                           // too long for a store name
    return line.replace(/[^\w\s\-æøåÆØÅ]/g, '').trim();
  }
  return '';
}

function parseReceiptLines(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  const results = [];

  // Norwegian receipt pattern: item name followed by price
  // Handles: "Melk 1L  24,90", "BRØD  31.50 B", "2 stk Egg  59,00", "Tempor 18,2"
  const priceRe = /(\d{1,5}[.,]\d{1,2})\s*[BbKk]?\s*$/;

  for (const line of lines) {
    // Skip header/footer junk
    if (/^(mva|total|sum|betalt|kort|visa|mastercard|dato|kasserer|kvittering|org\.?nr|telefon|tlf|rabatt|bonus|discount|change|cash|receipt|thank)/i.test(line)) continue;
    if (/^\*+$/.test(line) || /^[-=]{3,}/.test(line)) continue;
    if (line.length < 3) continue;

    const priceMatch = line.match(priceRe);
    if (!priceMatch) continue;

    const rawPrice = priceMatch[1].replace(',', '.');
    const amount = parseFloat(rawPrice);
    if (isNaN(amount) || amount <= 0 || amount > 50000) continue;

    // Name is everything before the price
    let name = line.slice(0, line.lastIndexOf(priceMatch[0])).trim();
    // Clean up leading item number "1. ", quantity "2 x ", "2 stk "
    name = name.replace(/^\d+\.\s*/, '').replace(/^\d+\s*[xX×]\s*/, '').replace(/^\d+\s*stk\s*/i, '').trim();
    if (name.length < 2) continue;

    results.push({ name, amount });
  }

  return results;
}

// ===== BATCH IMPORT =====
app.post('/api/transactions/import', (req, res) => {
  const { store, date, items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items' });

  const budgetNames = {};
  db.prepare('SELECT id, name FROM budgets').all().forEach(b => { budgetNames[b.id] = b.name; });

  // Group by category_id
  const groups = {};
  for (const item of items) {
    const key = item.category_id || '__none__';
    if (!groups[key]) groups[key] = { category_id: item.category_id || null, total: 0 };
    groups[key].total += item.amount;
    if (item.category_id && item.name) learnMapping(item.name, item.category_id);
  }

  const insert = db.prepare(
    'INSERT INTO transactions (id, name, amount, date, type, category_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const saved = [];
  for (const group of Object.values(groups)) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const catName = group.category_id ? budgetNames[group.category_id] : null;
    const name = store && catName ? `${store} – ${catName}` : (store || catName || 'Receipt');
    const amount = Math.round(group.total * 100) / 100;
    insert.run(id, name, amount, date, 'expense', group.category_id);
    saved.push({ id, name, amount, category_id: group.category_id });
  }

  res.json({ saved });
});

// ===== SETTINGS =====
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  rows.forEach(r => out[r.key] = r.value);
  res.json(out);
});

app.post('/api/settings', (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(req.body).forEach(([k, v]) => stmt.run(k, v));
  res.json({ ok: true });
});

// ===== STATS =====
app.get('/api/stats/:month', (req, res) => {
  const month = req.params.month;
  const txs = db.prepare("SELECT * FROM transactions WHERE date LIKE ?").all(month + '%');
  const budgets = db.prepare('SELECT * FROM budgets ORDER BY sort_order').all();

  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const income   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);

  const byCategory = {};
  budgets.forEach(b => {
    byCategory[b.id] = {
      budget: b,
      spent: txs.filter(t => t.type === 'expense' && t.category_id === b.id).reduce((s,t) => s+t.amount, 0)
    };
  });

  res.json({ expenses, income, totalBudget, remaining: totalBudget - expenses, byCategory });
});

// ===== SERVE SPA =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Budget server running on http://localhost:${PORT}`);
  console.log(`Data stored in: ${DATA_DIR}`);
});
