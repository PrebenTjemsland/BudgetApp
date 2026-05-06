import TxRow from '../components/TxRow'

export default function Overview({ cache, fmt, onManageBudgets, onTxClick }) {
  const { stats, txs, budgets } = cache

  if (!stats) {
    return (
      <div className="hero">
        <div className="hero-lbl">Remaining</div>
        <div className="hero-amt">—</div>
        <div className="hero-sub">Cannot reach server — check Settings</div>
      </div>
    )
  }

  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)

  return (
    <>
      <div className="hero">
        <div className="hero-lbl">Remaining</div>
        <div className="hero-amt">{fmt(stats.remaining)}</div>
        <div className="hero-sub">of {fmt(stats.totalBudget)} budget · {fmt(stats.expenses)} spent</div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-lbl">Income</div>
          <div className="stat-val g">{fmt(stats.income)}</div>
        </div>
        <div className="stat">
          <div className="stat-lbl">Spent</div>
          <div className="stat-val">{fmt(stats.expenses)}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="card-title">Categories</div>
          <button onClick={onManageBudgets} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer' }}>
            Manage
          </button>
        </div>
        {budgets.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '4px 0' }}>No categories yet</div>
        ) : (
          budgets.map(b => {
            const s = stats.byCategory[b.id] || { spent: 0 }
            const pct = b.amount > 0 ? Math.min(100, (s.spent / b.amount) * 100) : 0
            return (
              <div key={b.id} className="prog-row">
                <div className="prog-meta">
                  <span className="prog-lbl">{b.emoji} {b.name}</span>
                  <span className="prog-amts">{fmt(s.spent)} / {fmt(b.amount)}</span>
                </div>
                <div className="prog-bar">
                  <div className="prog-fill" style={{ width: pct + '%', background: b.color }} />
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="sec">Recent</div>
      <div className="card" style={{ padding: '0 16px' }}>
        {recent.length === 0
          ? <div className="empty"><p>No transactions this month</p></div>
          : recent.map(t => <TxRow key={t.id} tx={t} budgets={budgets} fmt={fmt} onClick={() => onTxClick(t.id)} />)
        }
      </div>
    </>
  )
}
