import { useEffect, useState } from 'react'

export default function Settings({ cfg, saveSetting, api, toast }) {
  const [connErr, setConnErr] = useState(false)
  const [serverSettings, setServerSettings] = useState({
    ocr_provider: 'tesseract',
    available_ocr_providers: ['tesseract', 'google', 'ollama'],
    google_vision_configured: false,
  })
  const buildLabel = [
    serverSettings.app_version ? `Version ${serverSettings.app_version}` : null,
    serverSettings.app_revision ? `build ${serverSettings.app_revision.slice(0, 7)}` : null,
  ].filter(Boolean).join(' · ')

  useEffect(() => {
    let ignore = false

    async function loadServerSettings() {
      try {
        const settings = await api('/api/settings')
        if (!ignore) setServerSettings(prev => ({ ...prev, ...settings }))
      } catch {
        if (!ignore) setConnErr(true)
      }
    }

    loadServerSettings()
    return () => { ignore = true }
  }, [api])

  async function testConn() {
    try {
      await api('/api/budgets')
      setConnErr(false)
      toast('Connected ✓')
    } catch {
      setConnErr(true)
    }
  }

  async function saveServerSetting(key, value) {
    try {
      const res = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ [key]: value })
      })
      setServerSettings(prev => ({ ...prev, ...(res.settings || {}) }))
      setConnErr(false)
      toast('Saved')
    } catch {
      setConnErr(true)
      toast('Could not save server setting')
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
        <div className="card-title" style={{ marginBottom: 12 }}>Receipt OCR</div>
        <div className="fg">
          <label>OCR provider</label>
          <select
            value={serverSettings.ocr_provider}
            onChange={e => saveServerSetting('ocr_provider', e.target.value)}
          >
            {serverSettings.available_ocr_providers.map(provider => (
              <option
                key={provider}
                value={provider}
                disabled={provider === 'google' && !serverSettings.google_vision_configured}
              >
                {provider === 'tesseract' && 'Tesseract (local)'}
                {provider === 'google' && `Google Vision${serverSettings.google_vision_configured ? '' : ' - add key on server first'}`}
                {provider === 'ollama' && 'Ollama'}
              </option>
            ))}
          </select>
        </div>
        {!serverSettings.google_vision_configured && (
          <div className="ocr-tip">
            To enable Google Vision, set <code>GOOGLE_VISION_API_KEY</code> in the server container environment and redeploy.
          </div>
        )}
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
      {buildLabel && (
        <div className="settings-version">
          {buildLabel}
        </div>
      )}
    </>
  )
}
