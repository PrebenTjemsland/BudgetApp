import { useState } from 'react'
import TxRow from '../components/TxRow'

export default function Transactions({ txs, budgets, fmt, onTxClick }) {
  const [filter, setFilter] = useState('all')

  const filtered = txs
    .filter(t => filter === 'all' || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <div className="chips">
        {[['all', 'All'], ['expense', 'Expenses'], ['income', 'Income']].map(([val, label]) => (
          <div
            key={val}
            className={`chip${filter === val ? ' on' : ''}`}
            onClick={() => setFilter(val)}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: '0 16px' }}>
        {filtered.length === 0
          ? <div className="empty"><p>No transactions in this budget period</p></div>
          : filtered.map(t => <TxRow key={t.id} tx={t} budgets={budgets} fmt={fmt} onClick={() => onTxClick(t.id)} />)
        }
      </div>
    </>
  )
}
