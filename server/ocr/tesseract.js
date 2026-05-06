const fs = require('fs')
const sharp = require('sharp')
const tesseract = require('node-tesseract-ocr')

async function extractText(imagePath) {
  const processedPath = imagePath + '_processed.png'
  try {
    await sharp(imagePath)
      .resize({ width: 1400, withoutEnlargement: false })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1.2 })
      .png()
      .toFile(processedPath)

    return await tesseract.recognize(processedPath, {
      lang: 'nor+eng',
      oem: 1,
      psm: 6,
    })
  } finally {
    fs.unlink(processedPath, () => {})
  }
}

module.exports = { extractText }
