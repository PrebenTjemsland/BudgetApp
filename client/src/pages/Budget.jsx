import { getBudgetPaceStatus } from '../utils'

export default function Budget({ budgets, stats, currentMonth, payday, fmt, onEdit, onAdd }) {
  return (
    <>
      <div className="card" style={{ padding: '0 16px' }}>
        {budgets.length === 0
          ? <div className="empty"><p>No categories yet</p></div>
          : budgets.map(b => {
              const s = stats?.byCategory[b.id] || { spent: 0 }
              const rem = b.amount - s.spent
              const pace = getBudgetPaceStatus({ month: currentMonth, payday, spent: s.spent, budget: b.amount })
              return (
                <div key={b.id} className="bud-row" onClick={() => onEdit(b.id)}>
                  <div className="bud-icon" style={{ background: b.color + '22' }}>{b.emoji}</div>
                  <div className="bud-info">
                    <div className="bud-name">{b.name}</div>
                    <div className="bud-sub" style={{ color: pace.color }}>{fmt(s.spent)} spent of {fmt(b.amount)} · {pace.label}</div>
                  </div>
                  <div className="bud-rem" style={{ color: pace.color }}>
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
