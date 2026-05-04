import { useState, useEffect } from 'react'

export default function Mappings({ budgets, api }) {
  const [maps, setMaps] = useState([])
  const [error, setError] = useState(false)

  useEffect(() => {
    api('/api/mappings')
      .then(setMaps)
      .catch(() => setError(true))
  }, [api])

  async function updateMapping(id, categoryId) {
    await api('/api/mappings/' + id, { method: 'PUT', body: JSON.stringify({ category_id: categoryId }) })
  }

  async function deleteMapping(id) {
    await api('/api/mappings/' + id, { method: 'DELETE' })
    setMaps(prev => prev.filter(m => m.id !== id))
  }

  if (error) return <div className="empty"><p>Could not load rules</p></div>

  return (
    <>
      <div className="card-title" style={{ marginBottom: 10 }}>Item → category rules (learned from your corrections)</div>
      <div className="card" style={{ padding: '0 16px' }}>
        {maps.length === 0
          ? <div className="empty"><p>No rules yet — they build up as you categorise items</p></div>
          : maps.map(m => (
              <div key={m.id} className="map-row">
                <div className="map-pattern">{m.pattern}</div>
                <select
                  style={{ maxWidth: 120, fontSize: 12, padding: '5px 8px' }}
                  defaultValue={m.category_id}
                  onChange={e => updateMapping(m.id, e.target.value)}
                >
                  <option value="">Uncategorised</option>
                  {budgets.map(b => (
                    <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>
                  ))}
                </select>
                <span className="map-count">×{m.match_count}</span>
                <button
                  onClick={() => deleteMapping(m.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                >×</button>
              </div>
            ))
        }
      </div>
    </>
  )
}
