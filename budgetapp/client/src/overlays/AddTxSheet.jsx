import { useState, useEffect, useRef } from 'react'
import { today } from '../utils'
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
  const fileRef = useRef()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    setScanPreview(null)
    setLineItems([])
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
    setMode('idle')
  }, [open, editingTxId])

  async function handleScan(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setScanPreview(ev.target.result)
    reader.readAsDataURL(file)
    setMode('scanning')
    try {
      const formData = new FormData()
      formData.append('receipt', file)
      const base = (cfg.serverUrl || '').replace(/\/$/, '')
      const res = await fetch(base + '/api/ocr', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || !data.lines?.length) {
        toast(data.error || 'No items found — try manual entry')
        setMode('manual')
        return
      }
      setLineItems(data.lines)
      setLineChecked(data.lines.map(() => true))
      setLineCats(data.lines.map(l => l.suggested_category || ''))
      setMode('lines')
    } catch {
      toast('Cannot reach server')
      setMode('manual')
    }
  }

  async function saveManual() {
    const { name, amount, date, type, category_id, notes } = form
    if (!name.trim() || !amount || !date) { toast('Fill in name, amount and date'); return }
    const payload = { name: name.trim(), amount: parseFloat(amount), date, type, category_id: category_id || null, notes: notes.trim() || null }
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
    const toSave = lineItems.filter((_, i) => lineChecked[i])
    if (!toSave.length) { toast('Select at least one item'); return }
    try {
      await Promise.all(toSave.map((item, i) =>
        api('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({ name: item.name, amount: item.amount, date: lineDate, type: 'expense', category_id: lineCats[i] || null })
        })
      ))
      toast(`Imported ${toSave.length} item${toSave.length > 1 ? 's' : ''}`)
      onSaved()
    } catch { toast('Error saving') }
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
      {scanPreview && (
        <img src={scanPreview} alt="" className="scan-preview" />
      )}

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
          <div className="ocr-tip">Tick the lines you want to import. Adjust categories — corrections are saved as rules.</div>
          {lineItems.map((item, i) => (
            <div key={i} className="li-row">
              <input
                type="checkbox"
                className="li-check"
                checked={lineChecked[i]}
                onChange={e => setLineChecked(prev => prev.map((v, j) => j === i ? e.target.checked : v))}
              />
              <span className="li-name" title={item.name}>{item.name}</span>
              <span className="li-amt">{cfg.currency} {item.amount.toFixed(2)}</span>
              <select
                className="li-cat"
                value={lineCats[i]}
                onChange={e => setLineCats(prev => prev.map((v, j) => j === i ? e.target.value : v))}
              >
                <CatOptions budgets={budgets} />
              </select>
            </div>
          ))}
          <div className="fg" style={{ marginTop: 12 }}>
            <label>Date</label>
            <input type="date" value={lineDate} onChange={e => setLineDate(e.target.value)} />
          </div>
          <button className="btn" onClick={importLines}>Import selected</button>
          <button className="btn sec" onClick={() => setMode('manual')}>Enter manually instead</button>
        </>
      )}

      {/* Manual form */}
      {(mode === 'idle' || mode === 'manual') && (
        <>
          {mode === 'idle' && <div style={{ height: 4 }} />}
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
                <CatOptions budgets={budgets} />
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
