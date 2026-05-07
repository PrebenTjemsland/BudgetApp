const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const ocr = require('./ocr');
const { version: packageVersion } = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'budget.db');
const RECEIPT_DIR = path.join(DATA_DIR, 'receipts');
const OCR_PROVIDER_SETTING_KEY = 'ocr_provider';
const PAYDAY_SETTING_KEY = 'payday';
const APP_VERSION = (process.env.APP_VERSION || packageVersion || '').trim();
const APP_REVISION = (process.env.APP_REVISION || '').trim();
const APP_BUILD_DATE = (process.env.APP_BUILD_DATE || '').trim();

// Ensure dirs exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(RECEIPT_DIR, { recursive: true });

// ===== DATABASE SETUP =====
const db = new Database(DB_PATH);

function tableHasColumn(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some(col => col.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!tableHasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

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

  CREATE TABLE IF NOT EXISTS receipt_exclusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    store TEXT,
    ocr_text TEXT,
    image_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    original_filename TEXT,
    ocr_provider TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
`);

ensureColumn('transactions', 'receipt_id', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_tx_receipt ON transactions(receipt_id);');

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
  dest: RECEIPT_DIR,
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
  if (month) {
    const range = getBudgetMonthRange(month);
    if (!range) return res.status(400).json({ error: 'Invalid month' });
    query += ' AND date >= ? AND date < ?';
    params.push(range.start, range.endExclusive);
  }
  if (type)  { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY date DESC, created_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/transactions', (req, res) => {
  const { id, name, amount, date, type, category_id, notes, receipt_id } = req.body;
  const txId = id || Date.now().toString();
  const receiptId = resolveReceiptId(receipt_id);
  if (receipt_id && !receiptId) return res.status(400).json({ error: 'Unknown receipt' });
  db.prepare(`
    INSERT OR REPLACE INTO transactions (id, name, amount, date, type, category_id, notes, receipt_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(txId, name, amount, date, type || 'expense', category_id || null, notes || null, receiptId);

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

// ===== RECEIPT EXCLUSIONS =====
app.get('/api/exclusions', (req, res) => {
  res.json(db.prepare('SELECT * FROM receipt_exclusions ORDER BY created_at DESC').all());
});

app.post('/api/exclusions', (req, res) => {
  const pattern = normalizeItemName(req.body.pattern || '');
  if (pattern.length < 2) return res.status(400).json({ error: 'Pattern too short' });
  db.prepare('INSERT OR IGNORE INTO receipt_exclusions (pattern) VALUES (?)').run(pattern);
  res.json({ ok: true, pattern });
});

app.delete('/api/exclusions/:id', (req, res) => {
  db.prepare('DELETE FROM receipt_exclusions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

function createReceiptRecord(file, ocrText, store, provider) {
  const id = crypto.randomUUID();
  const relativePath = path.join('receipts', path.basename(file.path));

  db.prepare(`
    INSERT INTO receipts (id, store, ocr_text, image_path, mime_type, original_filename, ocr_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    store || null,
    ocrText,
    relativePath,
    file.mimetype,
    file.originalname || null,
    provider
  );

  return getReceiptById(id);
}

function getReceiptById(id) {
  return db.prepare('SELECT * FROM receipts WHERE id=?').get(id);
}

function resolveReceiptId(receiptId) {
  if (!receiptId) return null;
  return getReceiptById(receiptId)?.id || null;
}

function serialiseReceipt(receipt) {
  if (!receipt) return null;
  return {
    id: receipt.id,
    store: receipt.store,
    ocr_text: receipt.ocr_text,
    mime_type: receipt.mime_type,
    original_filename: receipt.original_filename,
    ocr_provider: receipt.ocr_provider,
    created_at: receipt.created_at,
    image_url: `/api/receipts/${receipt.id}/image`,
  };
}

function getReceiptImagePath(receipt) {
  const fullPath = path.resolve(DATA_DIR, receipt.image_path);
  if (!fullPath.startsWith(RECEIPT_DIR + path.sep)) return null;
  return fullPath;
}

app.get('/api/receipts/:id', (req, res) => {
  const receipt = getReceiptById(req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
  res.json(serialiseReceipt(receipt));
});

app.get('/api/receipts/:id/image', (req, res) => {
  const receipt = getReceiptById(req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

  const imagePath = getReceiptImagePath(receipt);
  if (!imagePath || !fs.existsSync(imagePath)) {
    return res.status(404).json({ error: 'Receipt image not found' });
  }

  res.type(receipt.mime_type);
  res.sendFile(imagePath);
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

function getSettingValue(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

function parsePayday(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return null;
  return parsed;
}

function getPaydaySetting() {
  return parsePayday(getSettingValue(PAYDAY_SETTING_KEY)) ?? 1;
}

function daysInMonthUtc(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function createUtcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getBudgetMonthRange(month, payday = getPaydaySetting()) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;

  const [yearPart, monthPart] = month.split('-');
  const year = Number.parseInt(yearPart, 10);
  const monthIndex = Number.parseInt(monthPart, 10) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;

  const start = createUtcDate(year, monthIndex, Math.min(payday, daysInMonthUtc(year, monthIndex)));
  const nextYear = monthIndex === 11 ? year + 1 : year;
  const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
  const endExclusive = createUtcDate(
    nextYear,
    nextMonthIndex,
    Math.min(payday, daysInMonthUtc(nextYear, nextMonthIndex))
  );

  return {
    start: formatIsoDate(start),
    endExclusive: formatIsoDate(endExclusive)
  };
}

function getCurrentOcrProvider() {
  const configured = getSettingValue(OCR_PROVIDER_SETTING_KEY) || ocr.defaultProvider;
  try {
    return ocr.normalizeProviderName(configured);
  } catch {
    return ocr.defaultProvider;
  }
}

function buildSettingsResponse() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  rows.forEach(r => out[r.key] = r.value);

  out.ocr_provider = getCurrentOcrProvider();
  out.payday = getPaydaySetting();
  out.available_ocr_providers = ocr.listProviders();
  out.google_vision_configured = Boolean(process.env.GOOGLE_VISION_API_KEY);
  out.ollama_configured = Boolean(process.env.OLLAMA_BASE_URL);
  out.app_version = APP_VERSION && APP_VERSION !== 'dev' ? APP_VERSION : packageVersion;
  out.app_revision = APP_REVISION && APP_REVISION !== 'unknown' ? APP_REVISION : null;
  out.app_build_date = APP_BUILD_DATE && APP_BUILD_DATE !== 'unknown' ? APP_BUILD_DATE : null;

  return out;
}

// ===== OCR =====
app.post('/api/ocr', upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const inputPath = req.file.path;

  try {
    const provider = getCurrentOcrProvider();
    const ocrText = await ocr.extractText(inputPath, provider);

    console.log('\n--- RAW OCR OUTPUT ---\n' + ocrText + '\n--- END OCR OUTPUT ---\n');

    const store = parseStoreName(ocrText);
    const receiptTotal = parseReceiptTotal(ocrText);
    const receipt = createReceiptRecord(req.file, ocrText, store, provider);
    const exclusions = new Set(
      db.prepare('SELECT pattern FROM receipt_exclusions').all().map(r => r.pattern)
    );

    const lines = parseReceiptLines(ocrText).filter(line =>
      !exclusions.has(normalizeItemName(line.name))
    );
    const categorised = lines.map(line => ({
      ...line,
      suggested_category: lookupCategory(line.name)
    }));

    res.json({
      receipt_id: receipt.id,
      receipt: serialiseReceipt(receipt),
      receipt_total: receiptTotal,
      lines: categorised,
      store,
      raw: ocrText
    });

  } catch (err) {
    fs.unlink(inputPath, () => {});
    console.error('OCR error:', err);
    res.status(500).json({ error: err.message });
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

function parseReceiptTotal(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const totalLabelRe = /\b(total|totalt|sum(?:me)?|sun\b|å betale|a betale|betalt|beløp|belop|to pay|amount due)\b/i;
  const blockedRe = /\b(mva|vat|grunnlag|rabatt|discount|bonus|change|cash|bank|visa|mastercard|kort|saldo|tr[uun]mf|tr[uun]nf)\b/i;
  const amountRe = /-?\d{1,6}[.,]\d{1,2}/g;
  const standaloneAmountRe = /^(?:kr|nok)?\s*(-?\d{1,6}[.,]\d{1,2})(?:\s*(?:kr|nok))?$/i;

  const parseLastAmount = (line) => {
    const matches = line.match(amountRe);
    if (!matches?.length) return null;
    const amount = parseFloat(matches[matches.length - 1].replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || amount > 50000) return null;
    return amount;
  };

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (blockedRe.test(line) || !totalLabelRe.test(line)) continue;

    const inlineAmount = parseLastAmount(line);
    if (inlineAmount !== null) return inlineAmount;

    const nextLine = lines[i + 1];
    if (!nextLine || blockedRe.test(nextLine)) continue;

    const standaloneMatch = nextLine.match(standaloneAmountRe);
    if (!standaloneMatch) continue;

    const amount = parseFloat(standaloneMatch[1].replace(',', '.'));
    if (!isNaN(amount) && amount > 0 && amount <= 50000) return amount;
  }

  return null;
}

function parseReceiptLines(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];

  // Matches a line that is purely a price (possibly negative)
  const standalonePriceRe = /^-?(\d{1,6}[.,]\d{1,2})$/;
  // Matches a VAT-rate-only line like "25%", "0%"
  const vatOnlyRe = /^\d+%$/;

  const isJunkName = (l) => {
    if (/^\d/.test(l)) return true;  // starts with digit → code/total/breakdown
    if (/^[-=*]{2,}/.test(l)) return true;
    return /^(mva|total|sum\b|sun\b|bank|betalt|kort|visa|mastercard|dato|kasserer|kvittering|foretaks|org|telefon|tlf|rabatt|bonus|discount|change|cash|thank|grunnlag|totalt|tr[uun]mf|tr[uun]nf|terminal|authorization|contactless|godkjent|salgskvittering|bax|aid|saldo|kvitt|serie|kasse|oper|id:|du er|se bes|i digital|din |for denne|hva\b|handel|varer\b)/i.test(l);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const priceMatch = line.match(standalonePriceRe);

    if (priceMatch) {
      // Price-on-its-own-line format (Google Vision, modern receipts)
      const amount = parseFloat(priceMatch[1].replace(',', '.'));
      if (isNaN(amount) || amount <= 0 || amount > 50000) continue;

      // Look back up to 3 lines for the item name, skipping VAT% lines
      let name = null;
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const candidate = lines[j];
        if (vatOnlyRe.test(candidate)) continue;
        if (standalonePriceRe.test(candidate)) break;  // hit another price
        if (isJunkName(candidate)) break;
        name = candidate
          .replace(/\s+\d+%\s*$/, '')  // strip trailing VAT% on same line
          .replace(/^\+\s*/, '')        // strip leading +
          .replace(/\.+$/, '')          // strip trailing dots
          .replace(/^\d+\.\s*/, '')     // strip leading item number "1. "
          .replace(/^\d+\s*[xX×]\s*/, '') // strip "2 x "
          .replace(/^\d+\s*stk\s*/i, '')  // strip "2 stk "
          .trim();
        break;
      }

      if (!name || name.length < 2) continue;
      results.push({ name, amount });
      continue;
    }

    // Fallback: price at end of same line (older/simple receipt format)
    const inlinePriceRe = /(\d{1,5}[.,]\d{1,2})\s*[BbKk]?\s*$/;
    const inlineMatch = line.match(inlinePriceRe);
    if (!inlineMatch) continue;
    if (isJunkName(line)) continue;

    const amount = parseFloat(inlineMatch[1].replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || amount > 50000) continue;

    let name = line.slice(0, line.lastIndexOf(inlineMatch[0])).trim();
    name = name.replace(/\s+\d+%\s*$/, '').replace(/^\d+\.\s*/, '').replace(/^\d+\s*[xX×]\s*/, '').replace(/^\d+\s*stk\s*/i, '').trim();
    if (name.length < 2) continue;
    results.push({ name, amount });
  }

  return results;
}

// ===== BATCH IMPORT =====
app.post('/api/transactions/import', (req, res) => {
  const { store, date, items, receipt_id } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items' });
  const receiptId = resolveReceiptId(receipt_id);
  if (receipt_id && !receiptId) return res.status(400).json({ error: 'Unknown receipt' });

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
    'INSERT INTO transactions (id, name, amount, date, type, category_id, receipt_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const saved = [];
  for (const group of Object.values(groups)) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const catName = group.category_id ? budgetNames[group.category_id] : null;
    const name = store && catName ? `${store} – ${catName}` : (store || catName || 'Receipt');
    const amount = Math.round(group.total * 100) / 100;
    insert.run(id, name, amount, date, 'expense', group.category_id, receiptId);
    saved.push({ id, name, amount, category_id: group.category_id, receipt_id: receiptId });
  }

  res.json({ saved });
});

// ===== SETTINGS =====
app.get('/api/settings', (req, res) => {
  res.json(buildSettingsResponse());
});

app.post('/api/settings', (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const entries = [];
  for (const [key, value] of Object.entries(req.body)) {
    if (key === OCR_PROVIDER_SETTING_KEY) {
      entries.push([key, ocr.normalizeProviderName(value)]);
      continue;
    }
    if (key === PAYDAY_SETTING_KEY) {
      const payday = parsePayday(value);
      if (payday === null) {
        return res.status(400).json({ error: 'Payday must be between 1 and 31' });
      }
      entries.push([key, String(payday)]);
      continue;
    }
    entries.push([key, value]);
  }

  entries.forEach(([key, value]) => stmt.run(key, value));
  res.json({ ok: true, settings: buildSettingsResponse() });
});

// ===== STATS =====
app.get('/api/stats/:month', (req, res) => {
  const month = req.params.month;
  const range = getBudgetMonthRange(month);
  if (!range) return res.status(400).json({ error: 'Invalid month' });

  const txs = db.prepare('SELECT * FROM transactions WHERE date >= ? AND date < ?').all(range.start, range.endExclusive);
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
