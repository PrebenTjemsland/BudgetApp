import { useState, useEffect, useRef } from 'react'
import { today, COLORS } from '../utils'
import Sheet from '../components/Sheet'

function CatOptions({ budgets }) {
  return (
    <>
      <option value="">Uncategorised</option>
      {budgets.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
    </>
  )
}

export default function AddTxSheet({ open, editingTxId, budgets, txs, cfg, api, toast, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', amount: '', date: today(), type: 'expense', category_id: '', notes: '' })
  const [mode, setMode] = useState('idle') // 'idle' | 'scanning' | 'lines' | 'manual'
  const [scanPreview, setScanPreview] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [lineDate, setLineDate] = useState(today())
  const [lineChecked, setLineChecked] = useState([])
  const [lineCats, setLineCats] = useState([])
  const [store, setStore] = useState('')
  const [receiptId, setReceiptId] = useState(null)
  const [receiptTotal, setReceiptTotal] = useState(null)
  const [localBudgets, setLocalBudgets] = useState([])
  const [newCatForm, setNewCatForm] = useState(null) // null | { name, amount, emoji }
  const fileRef = useRef()
  const nextLineId = useRef(0)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const formatAmount = (amount) => `${cfg.currency} ${amount.toFixed(2)}`
  const parseLineAmount = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    const normalized = String(value || '').trim().replace(',', '.')
    if (!normalized) return null
    const amount = parseFloat(normalized)
    return Number.isFinite(amount) ? amount : null
  }
  const createLineItem = (item = {}) => ({
    id: `line-${nextLineId.current++}`,
    name: item.name || '',
    amount: typeof item.amount === 'number' ? item.amount.toFixed(2) : (item.amount || ''),
    ignorePattern: item.ignorePattern || item.name || '',
    source: item.source || 'ocr',
    status: item.status || 'active'
  })
  const isLineIncluded = (item, checked) => item.status === 'active' && checked
  const selectedTotal = Math.round(lineItems.reduce((sum, item, i) => (
    isLineIncluded(item, lineChecked[i]) ? sum + (parseLineAmount(item.amount) || 0) : sum
  ), 0) * 100) / 100
  const selectedMatchesReceipt = receiptTotal != null && Math.abs(selectedTotal - receiptTotal) < 0.01
  const removedCount = lineItems.filter(item => item.status === 'removed').length
  const ignoredCount = lineItems.filter(item => item.status === 'ignored').length

  useEffect(() => {
    if (!open) return
    setLocalBudgets(budgets)
    setScanPreview(null)
    setLineItems([])
    setLineChecked([])
    setLineCats([])
    setNewCatForm(null)
    setReceiptId(null)
    setReceiptTotal(null)
    if (editingTxId) {
      const t = txs.find(x => x.id === editingTxId)
      if (t) {
        setForm({ name: t.name, amount: String(t.amount), date: t.date, type: t.type, category_id: t.category_id || '', notes: t.notes || '' })
        setMode('manual')
        return
      }
    }
    setForm({ name: '', amount: '', date: today(), type: 'expense', category_id: '', notes: '' })
    setLineDate(today())
    setStore('')
    setMode('idle')
  }, [open, editingTxId])

  // Keep localBudgets in sync if parent updates (e.g. after refresh)
  useEffect(() => {
    if (open) setLocalBudgets(budgets)
  }, [budgets])

  function updateLineItem(index, patch) {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function setLineStatus(index, status) {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, status } : item))
  }

  function addLineItem() {
    setLineItems(prev => [...prev, createLineItem({ source: 'manual' })])
    setLineChecked(prev => [...prev, true])
    setLineCats(prev => [...prev, ''])
  }

  async function handleScan(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setScanPreview(ev.target.result)
    reader.readAsDataURL(file)
    setMode('scanning')
    setReceiptId(null)
    setReceiptTotal(null)
    try {
      const formData = new FormData()
      formData.append('receipt', file)
      const base = (cfg.serverUrl || '').replace(/\/$/, '')
      const res = await fetch(base + '/api/ocr', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setReceiptId(data.receipt_id || null)
        setReceiptTotal(typeof data.receipt_total === 'number' ? data.receipt_total : null)
        setStore(data.store || '')
        toast(data.error || 'No items found — try manual entry')
        setMode('manual')
        return
      }
      const scannedItems = (data.lines || []).map(line => createLineItem(line))
      setReceiptId(data.receipt_id || null)
      setReceiptTotal(typeof data.receipt_total === 'number' ? data.receipt_total : null)
      setLineItems(scannedItems)
      setLineChecked(scannedItems.map(() => true))
      setLineCats((data.lines || []).map(l => l.suggested_category || ''))
      setStore(data.store || '')
      if (!scannedItems.length) toast('No items found — add them manually below')
      setMode('lines')
    } catch {
      toast('Cannot reach server')
      setMode('manual')
    }
  }

  async function ignoreLineItem(index) {
    const item = lineItems[index]
    const pattern = (item?.ignorePattern || item?.name || '').trim()
    if (!pattern) {
      toast('Add a name before ignoring this OCR line')
      return
    }
    try {
      await api('/api/exclusions', { method: 'POST', body: JSON.stringify({ pattern }) })
      setLineStatus(index, 'ignored')
      toast(`Will ignore "${pattern}" in future scans`)
    } catch {
      toast('Could not save ignore rule')
    }
  }

  async function saveManual() {
    const { name, amount, date, type, category_id, notes } = form
    if (!name.trim() || !amount || !date) { toast('Fill in name, amount and date'); return }
    const payload = {
      name: name.trim(),
      amount: parseFloat(amount),
      date,
      type,
      category_id: category_id || null,
      notes: notes.trim() || null,
      receipt_id: editingTxId ? undefined : (receiptId || null)
    }
    try {
      if (editingTxId) {
        await api('/api/transactions/' + editingTxId, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await api('/api/transactions', { method: 'POST', body: JSON.stringify(payload) })
      }
      toast('Saved')
      onSaved()
    } catch { toast('Error saving — is server running?') }
  }

  async function importLines() {
    const items = lineItems
      .map((item, i) => {
        if (!isLineIncluded(item, lineChecked[i])) return null
        return {
          name: item.name.trim(),
          amount: parseLineAmount(item.amount),
          category_id: lineCats[i] || null
        }
      })
      .filter(Boolean)
    if (!items.length) { toast('Select at least one item'); return }
    if (items.some(item => !item.name || item.amount == null || item.amount <= 0)) {
      toast('Fill in name and amount for selected items')
      return
    }
    try {
      const { saved } = await api('/api/transactions/import', {
        method: 'POST',
        body: JSON.stringify({ store, date: lineDate, items, receipt_id: receiptId })
      })
      toast(`Imported ${saved.length} transaction${saved.length > 1 ? 's' : ''}`)
      onSaved()
    } catch { toast('Error saving') }
  }

  async function saveNewCat() {
    const { name, amount, emoji } = newCatForm
    if (!name.trim() || !amount) { toast('Fill in name and amount'); return }
    try {
      const { id } = await api('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), amount: parseFloat(amount), emoji: emoji || '💰', color: COLORS[localBudgets.length % COLORS.length] })
      })
      const newBudget = { id, name: name.trim(), amount: parseFloat(amount), emoji: emoji || '💰', color: COLORS[localBudgets.length % COLORS.length] }
      setLocalBudgets(prev => [...prev, newBudget])
      setNewCatForm(null)
      toast(`Created "${name.trim()}"`)
    } catch { toast('Error creating category') }
  }

  return (
    <Sheet open={open} title={editingTxId ? 'Edit transaction' : 'Add transaction'} onClose={onClose}>
      {/* Scan zone */}
      {mode === 'idle' && (
        <>
          <div className="scan-zone" onClick={() => fileRef.current?.click()}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto', stroke: 'var(--muted)' }}>
              <path d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2M16 4h2a2 2 0 012 2v2M16 20h2a2 2 0 002-2v-2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <p><strong>Scan receipt</strong></p>
            <p>Photo or image file</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleScan} />
        </>
      )}

      {/* Preview */}
      {scanPreview && <img src={scanPreview} alt="" className="scan-preview" />}

      {/* Spinner */}
      {mode === 'scanning' && (
        <div className="spinner-wrap">
          <div className="ring" />
          <p>Running OCR...</p>
        </div>
      )}

      {/* OCR line items */}
      {mode === 'lines' && (
        <>
          <div className="fg">
            <label>Store / merchant</label>
            <input type="text" value={store} placeholder="e.g. Rema 1000" onChange={e => setStore(e.target.value)} />
          </div>

          <div className="ocr-tip">Review the OCR result before saving: edit names and prices, add missing items, and keep removed rows visible so you can see what will not be imported.</div>

          <div className="card" style={{ padding: '12px 16px' }}>
            <div className="card-title" style={{ marginBottom: 6 }}>Totals</div>
            <div className="tx-row" style={{ cursor: 'default', borderBottom: receiptTotal != null ? undefined : 'none' }}>
              <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 96 }}>Selected items</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{formatAmount(selectedTotal)}</span>
            </div>
            {receiptTotal != null ? (
              <>
                <div className="tx-row" style={{ cursor: 'default', borderBottom: 'none' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 96 }}>Receipt total</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{formatAmount(receiptTotal)}</span>
                </div>
                <div style={{ color: selectedMatchesReceipt ? 'var(--green)' : 'var(--amber)', fontSize: 12, fontWeight: 500, marginTop: 8 }}>
                  {selectedMatchesReceipt
                    ? 'Selected items match the scanned receipt total.'
                    : `${formatAmount(Math.abs(receiptTotal - selectedTotal))} difference between selected items and receipt total.`}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
                Receipt total could not be read from the scan.
              </div>
            )}
            {(removedCount || ignoredCount) ? (
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
                {removedCount ? `${removedCount} removed from this import.` : null}
                {removedCount && ignoredCount ? ' ' : null}
                {ignoredCount ? `${ignoredCount} ignored now and in future scans.` : null}
              </div>
            ) : null}
          </div>

          <button className="btn sec" onClick={addLineItem}>＋ Add missing item</button>

          {!lineItems.length && (
            <div className="empty" style={{ padding: '18px 0 8px' }}>
              <p>No OCR items yet. Add the missing receipt items manually below.</p>
            </div>
          )}

          {lineItems.map((item, i) => (
            <div
              key={item.id}
              className={`li-row${item.status !== 'active' ? ' is-excluded' : ''}${item.status === 'active' && !lineChecked[i] ? ' is-unselected' : ''}`}
            >
              <input
                type="checkbox"
                className="li-check"
                checked={item.status === 'active' ? lineChecked[i] : false}
                disabled={item.status !== 'active'}
                onChange={e => setLineChecked(prev => prev.map((v, j) => j === i ? e.target.checked : v))}
              />
              <div className="li-fields">
                {item.status !== 'active' && (
                  <div className={`li-status${item.status === 'ignored' ? ' ignored' : ' removed'}`}>
                    {item.status === 'ignored' ? 'Ignored from this import and future scans' : 'Removed from this import'}
                  </div>
                )}
                {item.status === 'active' && !lineChecked[i] && (
                  <div className="li-status">Unchecked: this row will not be imported</div>
                )}
                <div className="li-edit-grid">
                  <input
                    className="li-name-input"
                    type="text"
                    value={item.name}
                    placeholder="Item name"
                    disabled={item.status !== 'active'}
                    onChange={e => updateLineItem(i, { name: e.target.value })}
                  />
                  <input
                    className="li-amt-input"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={item.amount}
                    placeholder="0.00"
                    disabled={item.status !== 'active'}
                    onChange={e => updateLineItem(i, { amount: e.target.value })}
                  />
                </div>
                <div className="li-bottom">
                  <select
                    className="li-cat"
                    value={lineCats[i]}
                    disabled={item.status !== 'active'}
                    onChange={e => setLineCats(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                  >
                    <CatOptions budgets={localBudgets} />
                  </select>
                  <div className="li-actions">
                    <button
                      type="button"
                      className="li-action"
                      title={item.status === 'removed' ? 'Restore this item' : 'Remove this item from import'}
                      disabled={item.status === 'ignored'}
                      onClick={() => setLineStatus(i, item.status === 'removed' ? 'active' : 'removed')}
                    >{item.status === 'removed' ? '↺' : '✕'}</button>
                    {item.source === 'ocr' && (
                      <button
                        type="button"
                        className="li-action"
                        title={item.status === 'ignored' ? 'Already ignored for future scans' : 'Always ignore this OCR line'}
                        disabled={item.status === 'ignored'}
                        onClick={() => ignoreLineItem(i)}
                      >🚫</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Inline new category */}
          {newCatForm ? (
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r-sm)', padding: '12px', marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginBottom: 10 }}>New category</div>
              <div className="fr">
                <div className="fg">
                  <label>Name</label>
                  <input type="text" value={newCatForm.name} placeholder="e.g. Snacks" autoFocus onChange={e => setNewCatForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="fg">
                  <label>Monthly budget</label>
                  <input type="number" value={newCatForm.amount} placeholder="0" onChange={e => setNewCatForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>
              <div className="fg">
                <label>Emoji</label>
                <input type="text" value={newCatForm.emoji} placeholder="💰" maxLength={2} onChange={e => setNewCatForm(f => ({ ...f, emoji: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={saveNewCat}>Save category</button>
                <button className="btn sec" style={{ flex: 1 }} onClick={() => setNewCatForm(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              className="btn sec"
              style={{ marginTop: 10 }}
              onClick={() => setNewCatForm({ name: '', amount: '', emoji: '' })}
            >
              ＋ New category
            </button>
          )}

          <div className="fg" style={{ marginTop: 12 }}>
            <label>Date</label>
            <input type="date" value={lineDate} onChange={e => setLineDate(e.target.value)} />
          </div>
          <button className="btn" onClick={importLines}>Import</button>
          <button className="btn sec" onClick={() => setMode('manual')}>Enter manually instead</button>
        </>
      )}

      {/* Manual form */}
      {(mode === 'idle' || mode === 'manual') && (
        <>
          {mode === 'idle' && <div style={{ height: 4 }} />}
          {receiptTotal != null && (
            <div className="card" style={{ padding: '12px 16px' }}>
              <div className="card-title" style={{ marginBottom: 6 }}>Receipt total</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 500 }}>{formatAmount(receiptTotal)}</div>
            </div>
          )}
          <div className="fr">
            <div className="fg">
              <label>Amount</label>
              <input type="number" value={form.amount} placeholder="0.00" inputMode="decimal" onChange={e => set('amount', e.target.value)} />
            </div>
            <div className="fg">
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
          </div>
          <div className="fg">
            <label>Description</label>
            <input type="text" value={form.name} placeholder="e.g. Rema 1000" onChange={e => set('name', e.target.value)} />
          </div>
          <div className="fr">
            <div className="fg">
              <label>Category</label>
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                <CatOptions budgets={localBudgets} />
              </select>
            </div>
            <div className="fg">
              <label>Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>
          <div className="fg">
            <label>Notes (optional)</label>
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <button className="btn" onClick={saveManual}>Save</button>
        </>
      )}
    </Sheet>
  )
}
