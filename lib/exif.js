
const fs = require('fs')
const path = require('path')
const os = require('os')
const Crypto = require('crypto')
const webp = require('node-webpmux')

async function writeExif(media, metadata) {
  const tmpIn = path.join(os.tmpdir(), `${Crypto.randomBytes(6).toString('hex')}.webp`)
  const tmpOut = path.join(os.tmpdir(), `${Crypto.randomBytes(6).toString('hex')}.webp`)
  fs.writeFileSync(tmpIn, media)

  const img = new webp.Image()
  const json = {
    "sticker-pack-id": "https://github.com/DMC",
    "sticker-pack-name": metadata.packname || "ＤＭＣ™ MD",
    "sticker-pack-publisher": metadata.author || "ＤＭＣ™ＫＩＮＧ✓",
    "emojis": [""]
  }

  const exifAttr = Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00])
  const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
  const exif = Buffer.concat([exifAttr, jsonBuff])
  exif.writeUIntLE(jsonBuff.length, 14, 4)

  await img.load(tmpIn)
  img.exif = exif
  await img.save(tmpOut)

  // Clean up input temp file; caller can remove tmpOut after sending.
  try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn) } catch (_) {}

  return tmpOut
}

const writeExifImg = writeExif; const writeExifVid = writeExif;
module.exports = { writeExif, writeExifImg, writeExifVid }
