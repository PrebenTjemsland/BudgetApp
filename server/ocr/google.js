const fs = require('fs')

async function extractText(imagePath) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY env var is not set')

  const base64 = fs.readFileSync(imagePath).toString('base64')

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
      })
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Google Vision HTTP ${res.status}`)
  }

  const data = await res.json()
  return data.responses[0]?.fullTextAnnotation?.text || ''
}

module.exports = { extractText }
