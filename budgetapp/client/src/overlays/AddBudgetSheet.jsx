import { useState, useEffect } from 'react'
import { COLORS } from '../utils'
import Sheet from '../components/Sheet'

export default function AddBudgetSheet({ open, editingBudId, budgets, api, toast, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState(COLORS[0])

  useEffect(() => {
    if (!open) return
    if (editingBudId) {
      const b = budgets.find(x => x.id === editingBudId)
      if (b) {
        setName(b.name)
        setAmount(String(b.amount))
        setEmoji(b.emoji || '')
        setColor(b.color || COLORS[0])
      }
    } else {
      setName('')
      setAmount('')
      setEmoji('')
      setColor(COLORS[0])
    }
  }, [open, editingBudId])

  async function save() {
    if (!name.trim() || !amount) { toast('Fill in name and amount'); return }
    const payload = { name: name.trim(), amount: parseFloat(amount), emoji: emoji || '💰', color }
    try {
      if (editingBudId) {
        await api('/api/budgets/' + editingBudId, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await api('/api/budgets', { method: 'POST', body: JSON.stringify(payload) })
      }
      onSaved()
    } catch { toast('Error saving') }
  }

  async function deleteBudget() {
    if (!confirm('Delete this category? Transactions will become uncategorised.')) return
    try {
      await api('/api/budgets/' + editingBudId, { method: 'DELETE' })
      onSaved()
    } catch { toast('Error deleting') }
  }

  return (
    <Sheet open={open} title={editingBudId ? 'Edit category' : 'Add category'} onClose={onClose}>
      <div className="fg">
        <label>Name</label>
        <input type="text" value={name} placeholder="e.g. Groceries" onChange={e => setName(e.target.value)} />
      </div>
      <div className="fr">
        <div className="fg">
          <label>Monthly budget</label>
          <input type="number" value={amount} placeholder="0" onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="fg">
          <label>Emoji</label>
          <input type="text" value={emoji} placeholder="🛒" maxLength={2} onChange={e => setEmoji(e.target.value)} />
        </div>
      </div>
      <div className="fg">
        <label>Colour</label>
        <div className="color-grid">
          {COLORS.map(c => (
            <div
              key={c}
              className={`color-chip${c === color ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <button className="btn" style={{ marginTop: 8 }} onClick={save}>Save</button>
      {editingBudId && (
        <button className="btn danger" onClick={deleteBudget}>Delete category</button>
      )}
    </Sheet>
  )
}
