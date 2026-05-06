const fs = require('fs')

async function extractText(imagePath) {
  const model = process.env.OLLAMA_MODEL || 'qwen2-vl:7b'
  const base = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
  const base64 = fs.readFileSync(imagePath).toString('base64')

  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: 'Extract all text from this receipt image exactly as it appears. Output only the raw text, nothing else.',
      images: [base64],
      stream: false
    })
  })

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = await res.json()
  return data.response || ''
}

module.exports = { extractText }
