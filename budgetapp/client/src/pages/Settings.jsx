import { useState } from 'react'

export default function Settings({ cfg, saveSetting, api, toast }) {
  const [connErr, setConnErr] = useState(false)

  async function testConn() {
    try {
      await api('/api/budgets')
      setConnErr(false)
      toast('Connected ✓')
    } catch {
      setConnErr(true)
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Server</div>
        <div className="fg">
          <label>Base URL</label>
          <input
            type="text"
            defaultValue={cfg.serverUrl}
            placeholder="http://192.168.1.x:3000"
            onBlur={e => saveSetting('serverUrl', e.target.value)}
          />
        </div>
        {connErr && <div className="err-banner">Cannot reach server</div>}
        <button className="btn sec" onClick={testConn}>Test connection</button>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Display</div>
        <div className="fg">
          <label>Currency symbol</label>
          <select value={cfg.currency} onChange={e => saveSetting('currency', e.target.value)}>
            <option value="kr">NOK (kr)</option>
            <option value="€">EUR (€)</option>
            <option value="$">USD ($)</option>
            <option value="£">GBP (£)</option>
          </select>
        </div>
      </div>
    </>
  )
}
