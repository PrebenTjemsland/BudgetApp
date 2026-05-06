const provider = process.env.OCR_PROVIDER || 'google'

const providers = {
  google:    require('./google'),
  tesseract: require('./tesseract'),
  ollama:    require('./ollama'),
}

if (!providers[provider]) {
  throw new Error(`Unknown OCR_PROVIDER "${provider}". Valid options: google, tesseract, ollama`)
}

module.exports = providers[provider]
