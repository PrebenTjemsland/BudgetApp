export default function TxRow({ tx, budgets, fmt, onClick }) {
  const b = budgets.find(x => x.id === tx.category_id)
  const sign = tx.type === 'income' ? '+' : '−'
  const col = tx.type === 'income' ? 'var(--green)' : 'var(--text)'
  return (
    <div className="tx-row" onClick={onClick}>
      <div className="tx-icon" style={{ background: (b?.color || '#333') + '22' }}>{b?.emoji || '💸'}</div>
      <div className="tx-info">
        <div className="tx-name">{tx.name}</div>
        <div className="tx-meta">{b?.name || 'Uncategorised'} · {tx.date}</div>
      </div>
      <div className="tx-amt" style={{ color: col }}>{sign}{fmt(tx.amount)}</div>
    </div>
  )
}
