export default function Budget({ budgets, stats, fmt, onEdit, onAdd }) {
  return (
    <>
      <div className="card" style={{ padding: '0 16px' }}>
        {budgets.length === 0
          ? <div className="empty"><p>No categories yet</p></div>
          : budgets.map(b => {
              const s = stats?.byCategory[b.id] || { spent: 0 }
              const rem = b.amount - s.spent
              const remCol = rem < 0 ? 'var(--red)' : rem < b.amount * 0.15 ? 'var(--amber)' : 'var(--muted)'
              return (
                <div key={b.id} className="bud-row" onClick={() => onEdit(b.id)}>
                  <div className="bud-icon" style={{ background: b.color + '22' }}>{b.emoji}</div>
                  <div className="bud-info">
                    <div className="bud-name">{b.name}</div>
                    <div className="bud-sub">{fmt(s.spent)} spent of {fmt(b.amount)}</div>
                  </div>
                  <div className="bud-rem" style={{ color: remCol }}>
                    {rem < 0 ? '−' : ''}{fmt(Math.abs(rem))}
                    <br />
                    <span style={{ fontSize: 11, fontWeight: 400 }}>{rem < 0 ? 'over' : 'left'}</span>
                  </div>
                </div>
              )
            })
        }
      </div>
      <button className="btn sec" style={{ marginTop: 10 }} onClick={onAdd}>+ Add category</button>
    </>
  )
}
