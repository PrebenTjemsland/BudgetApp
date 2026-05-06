import { useState, useEffect, useCallback, useRef } from 'react'
import { fmt } from './utils'
import Overview from './pages/Overview'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'
import Mappings from './pages/Mappings'
import Settings from './pages/Settings'
import AddTxSheet from './overlays/AddTxSheet'
import AddBudgetSheet from './overlays/AddBudgetSheet'
import TxDetailSheet from './overlays/TxDetailSheet'
import MonthPickerSheet from './overlays/MonthPickerSheet'

const LS_KEY = 'budget_cfg'

function loadCfg() {
  try { return { serverUrl: '', currency: 'kr', ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') } }
  catch { return { serverUrl: '', currency: 'kr' } }
}

const NAV = [
  {
    id: 'overview', label: 'Overview',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
  },
  {
    id: 'transactions', label: 'Tx',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  },
  {
    id: 'budget', label: 'Budget',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" strokeLinecap="round"/></svg>
  },
  {
    id: 'mappings', label: 'Rules',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7M9 20l6-3M9 20V7m6 13l5.447-2.724A1 1 0 0021 16.382V5.618a1 1 0 00-1.447-.894L15 7m0 13V7M9 7l6-3" strokeLinecap="round" strokeLinejoin="round"/></svg>
  },
  {
    id: 'settings', label: 'Settings',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round"/></svg>
  },
]

export default function App() {
  const [page, setPage] = useState('overview')
  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [cfg, setCfg] = useState(loadCfg)
  const [cache, setCache] = useState({ budgets: [], stats: null, txs: [] })
  const [overlay, setOverlay] = useState(null)
  const [editingTxId, setEditingTxId] = useState(null)
  const [editingBudId, setEditingBudId] = useState(null)
  const [detailTxId, setDetailTxId] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef()

  const api = useCallback((path, opts = {}) => {
    const base = (cfg.serverUrl || '').replace(/\/$/, '')
    return fetch(base + path, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts
    }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
  }, [cfg.serverUrl])

  const toast = useCallback((msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2200)
  }, [])

  const saveSetting = useCallback((k, v) => {
    setCfg(prev => {
      const next = { ...prev, [k]: v }
      localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [budgets, stats, txs] = await Promise.all([
        api('/api/budgets'),
        api('/api/stats/' + currentMonth),
        api('/api/transactions?month=' + currentMonth)
      ])
      setCache({ budgets, stats, txs })
    } catch {}
  }, [api, currentMonth])

  useEffect(() => { refresh() }, [refresh])

  const monthLabel = (() => {
    const [y, m] = currentMonth.split('-')
    return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  })()

  const fmtC = (n) => fmt(n, cfg.currency)

  function closeOverlay() {
    setOverlay(null)
    setEditingTxId(null)
    setEditingBudId(null)
    setDetailTxId(null)
  }

  function openTxDetail(id) {
    setDetailTxId(id)
    setOverlay('txDetail')
  }

  function openEditTx(id) {
    setEditingTxId(id)
    setOverlay('addTx')
  }

  function openAddBudget(id = null) {
    setEditingBudId(id)
    setOverlay('addBudget')
  }

  return (
    <div className="app">
      <nav className="top-nav">
        <div className="nav-title">Budget</div>
        <button className="month-btn" onClick={() => setOverlay('month')}>
          {monthLabel} ▾
        </button>
      </nav>

      <main className="main">
        {page === 'overview' && (
          <Overview cache={cache} fmt={fmtC} onManageBudgets={() => setPage('budget')} onTxClick={openTxDetail} />
        )}
        {page === 'transactions' && (
          <Transactions txs={cache.txs} budgets={cache.budgets} fmt={fmtC} onTxClick={openTxDetail} />
        )}
        {page === 'budget' && (
          <Budget budgets={cache.budgets} stats={cache.stats} fmt={fmtC} onEdit={openAddBudget} onAdd={() => openAddBudget(null)} />
        )}
        {page === 'mappings' && (
          <Mappings budgets={cache.budgets} api={api} />
        )}
        {page === 'settings' && (
          <Settings cfg={cfg} saveSetting={saveSetting} api={api} toast={toast} />
        )}
      </main>

      <button className="fab" onClick={() => setOverlay('addTx')}>
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>

      <nav className="bottom-nav">
        {NAV.map(({ id, label, icon }) => (
          <button key={id} className={`nb${page === id ? ' active' : ''}`} onClick={() => setPage(id)}>
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <AddTxSheet
        open={overlay === 'addTx'}
        editingTxId={editingTxId}
        budgets={cache.budgets}
        txs={cache.txs}
        cfg={cfg}
        api={api}
        toast={toast}
        onClose={closeOverlay}
        onSaved={() => { closeOverlay(); refresh() }}
      />

      <AddBudgetSheet
        open={overlay === 'addBudget'}
        editingBudId={editingBudId}
        budgets={cache.budgets}
        api={api}
        toast={toast}
        onClose={closeOverlay}
        onSaved={() => { closeOverlay(); refresh() }}
      />

      <TxDetailSheet
        open={overlay === 'txDetail'}
        txId={detailTxId}
        txs={cache.txs}
        budgets={cache.budgets}
        cfg={cfg}
        fmt={fmtC}
        api={api}
        toast={toast}
        onClose={closeOverlay}
        onEdit={openEditTx}
        onDeleted={() => { closeOverlay(); refresh() }}
      />

      <MonthPickerSheet
        open={overlay === 'month'}
        currentMonth={currentMonth}
        onSelect={m => { setCurrentMonth(m); setOverlay(null) }}
        onClose={() => setOverlay(null)}
      />

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  )
}
