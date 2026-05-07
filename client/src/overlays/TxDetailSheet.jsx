import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet'

export default function TxDetailSheet({ open, txId, txs, budgets, cfg, fmt, api, toast, onClose, onEdit, onDeleted }) {
  const tx = txs.find(x => x.id === txId)
  const b = tx ? budgets.find(x => x.id === tx.category_id) : null
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    let ignore = false
    if (!open || !tx?.receipt_id) {
      setReceipt(null)
      return
    }

    api('/api/receipts/' + tx.receipt_id)
      .then(data => {
        if (!ignore) setReceipt(data)
      })
      .catch(() => {
        if (!ignore) setReceipt(null)
      })

    return () => { ignore = true }
  }, [open, tx?.receipt_id, api])

  async function deleteTx() {
    try {
      await api('/api/transactions/' + txId, { method: 'DELETE' })
      toast('Deleted')
      onDeleted()
    } catch {
      toast('Error deleting')
    }
  }

  function openReceipt() {
    if (!tx?.receipt_id) return
    const base = (cfg.serverUrl || '').replace(/\/$/, '')
    const receiptPath = receipt?.image_url || `/api/receipts/${tx.receipt_id}/image`
    window.open(base + receiptPath, '_blank', 'noopener,noreferrer')
  }

  return (
    <Sheet open={open} title="Transaction" onClose={onClose}>
      {tx && (
        <>
          <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: (b?.color || '#333') + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 10px' }}>
              {b?.emoji || '💸'}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: -1 }}>
              {tx.type === 'income' ? '+' : '−'}{fmt(tx.amount)}
            </div>
            <div style={{ color: 'var(--muted)', marginTop: 3 }}>{tx.name}</div>
          </div>

            <div className="card">
              <div className="tx-row" style={{ cursor: 'default' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 90 }}>Category</span>
                <span>{b?.emoji || ''} {b?.name || 'Uncategorised'}</span>
              </div>
            <div className="tx-row" style={{ cursor: 'default' }}>
              <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 90 }}>Date</span>
              <span>{tx.date}</span>
            </div>
              <div className="tx-row" style={{ cursor: 'default', borderBottom: (tx.notes || tx.receipt_id) ? undefined : 'none' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 90 }}>Type</span>
                <span style={{ textTransform: 'capitalize' }}>{tx.type}</span>
              </div>
              {tx.notes && (
                <div className="tx-row" style={{ cursor: 'default', borderBottom: tx.receipt_id ? undefined : 'none' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 90 }}>Description</span>
                  <span>{tx.notes}</span>
                </div>
              )}
              {tx.receipt_id && (
                <div className="tx-row" style={{ cursor: 'default', borderBottom: 'none' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 90 }}>Receipt</span>
                  <span>{receipt?.store || receipt?.original_filename || 'Attached receipt'}</span>
                </div>
              )}
            </div>

          {tx.receipt_id && <button className="btn sec" onClick={openReceipt}>View receipt</button>}
          <button className="btn sec" onClick={() => onEdit(txId)}>Edit</button>
          <button className="btn danger" onClick={deleteTx}>Delete</button>
        </>
      )}
    </Sheet>
  )
}
