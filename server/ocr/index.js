const providers = {
  google:    require('./google'),
  tesseract: require('./tesseract'),
  ollama:    require('./ollama'),
}

const DEFAULT_PROVIDER = process.env.OCR_PROVIDER || 'tesseract'

function normalizeProviderName(provider = DEFAULT_PROVIDER) {
  if (!providers[provider]) {
    throw new Error(`Unknown OCR provider "${provider}". Valid options: google, tesseract, ollama`)
  }
  return provider
}

function getProvider(provider) {
  return providers[normalizeProviderName(provider)]
}

async function extractText(imagePath, provider) {
  return getProvider(provider).extractText(imagePath)
}

function listProviders() {
  return Object.keys(providers)
}

module.exports = {
  extractText,
  listProviders,
  normalizeProviderName,
  defaultProvider: DEFAULT_PROVIDER,
}
