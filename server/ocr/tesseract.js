const fs = require('fs')
const { execFile } = require('child_process')
const { promisify } = require('util')
const sharp = require('sharp')

const execFileP = promisify(execFile)

// Local wrapper around the `tesseract` CLI. Replaces the `node-tesseract-ocr`
// package, which built a shell command via string concatenation and passed
// it to child_process.exec — vulnerable to OS command injection
// (CVE-2026-26832 / GHSA-8j44-735h-w4w2, CVSS 9.8).
//
// We use execFile with an argv array instead, so there is no shell involved
// and no path or argument can break out of its own slot.
async function tesseractRecognize(imagePath, { lang, oem, psm, binary = 'tesseract' } = {}) {
  const args = [imagePath, 'stdout']
  if (lang) args.push('-l', lang)
  if (oem !== undefined && oem !== null) args.push('--oem', String(oem))
  if (psm !== undefined && psm !== null) args.push('--psm', String(psm))

  const { stdout } = await execFileP(binary, args, {
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout
}

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

    return await tesseractRecognize(processedPath, {
      lang: 'nor+eng',
      oem: 1,
      psm: 6,
    })
  } finally {
    fs.unlink(processedPath, () => {})
  }
}

module.exports = { extractText }
