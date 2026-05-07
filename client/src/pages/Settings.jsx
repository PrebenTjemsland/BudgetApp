import { useState } from 'react'
import { getBudgetMonthMeta, getCurrentBudgetMonth } from '../utils'

function formatOrdinal(value) {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return `${value}st`
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`
  return `${value}th`
}

export default function Settings({ cfg, saveSetting, serverSettings, onServerSettingsChange, api, toast }) {
  const [connErr, setConnErr] = useState(false)
  const effectiveServerSettings = {
    ocr_provider: 'tesseract',
    available_ocr_providers: ['tesseract', 'google', 'ollama'],
    google_vision_configured: false,
    payday: 1,
    ...serverSettings,
  }
  const currentBudgetMonth = getBudgetMonthMeta(
    getCurrentBudgetMonth(effectiveServerSettings.payday),
    effectiveServerSettings.payday
  )
  const buildLabel = [
    effectiveServerSettings.app_version ? `Version ${effectiveServerSettings.app_version}` : null,
    effectiveServerSettings.app_revision ? `build ${effectiveServerSettings.app_revision.slice(0, 7)}` : null,
  ].filter(Boolean).join(' · ')

  async function testConn() {
    try {
      const settings = await api('/api/settings')
      onServerSettingsChange(settings)
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
      onServerSettingsChange(res.settings || {})
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
            value={effectiveServerSettings.ocr_provider}
            onChange={e => saveServerSetting('ocr_provider', e.target.value)}
          >
            {effectiveServerSettings.available_ocr_providers.map(provider => (
              <option
                key={provider}
                value={provider}
                disabled={provider === 'google' && !effectiveServerSettings.google_vision_configured}
              >
                {provider === 'tesseract' && 'Tesseract (local)'}
                {provider === 'google' && `Google Vision${effectiveServerSettings.google_vision_configured ? '' : ' - add key on server first'}`}
                {provider === 'ollama' && 'Ollama'}
              </option>
            ))}
          </select>
        </div>
        {!effectiveServerSettings.google_vision_configured && (
          <div className="ocr-tip">
            To enable Google Vision, set <code>GOOGLE_VISION_API_KEY</code> in the server container environment and redeploy.
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Budget period</div>
        <div className="fg">
          <label>Payday</label>
          <select
            value={String(effectiveServerSettings.payday)}
            onChange={e => saveServerSetting('payday', Number(e.target.value))}
          >
            {Array.from({ length: 31 }, (_, index) => index + 1).map(day => (
              <option key={day} value={day}>{formatOrdinal(day)}</option>
            ))}
          </select>
        </div>
        <div className="ocr-tip">
          Budget months run from the selected payday until the day before the next one.
          {' '}
          <strong>{currentBudgetMonth.label}</strong> currently means <strong>{currentBudgetMonth.rangeLabel}</strong>.
        </div>
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
