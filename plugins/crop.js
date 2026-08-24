const { cmd } = require('../command')
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')
const { tmpdir } = require('os')
const Crypto = require('crypto')
const ff = require('fluent-ffmpeg')
const { writeExif } = require('../lib/exif')

function tmp(ext = '') {
  return path.join(tmpdir(), `${Crypto.randomBytes(6).readUInt32LE(0)}${ext}`)
}

function safeUnlink(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p) } catch (_) {}
}

async function toSquareWebp(buffer, isVideo) {
  const inFile = tmp(isVideo ? '.mp4' : '.png')
  const outFile = tmp('.webp')
  fs.writeFileSync(inFile, buffer)

  await new Promise((resolve, reject) => {
    const proc = ff(inFile)
      .on('error', reject)
      .on('end', resolve)
      .addOutputOptions([
        '-vcodec', 'libwebp',
        '-vf', 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1',
        '-lossless', '1',
        '-loop', '0',
        '-preset', 'default',
        '-an',
        '-vsync', '0'
      ])

    if (isVideo) {
      proc.addOutputOptions(['-t', '8'])
    }

    proc.toFormat('webp').save(outFile)
  })

  const webpBuff = fs.readFileSync(outFile)
  safeUnlink(inFile)
  safeUnlink(outFile)
  return webpBuff
}

cmd({
  pattern: 'crop',
  alias: ['scrop'],
  desc: 'Square crop sticker maker (image/video)',
  category: 'converter',
  filename: __filename
}, async (conn, mek, m, { from, reply }) => {
  try {
    const msg = mek.message || {}
    let targetWebMsg = mek
    let targetType = getContentType(msg)
    let targetMsg = targetType ? msg[targetType] : null

    const quoted = msg?.extendedTextMessage?.contextInfo?.quotedMessage
    const isTextCommandMsg = targetType === 'conversation' || targetType === 'extendedTextMessage'
    if ((isTextCommandMsg || !targetMsg) && quoted) {
      const qType = getContentType(quoted)
      if (qType) {
        targetType = qType
        targetMsg = quoted[qType]
        targetWebMsg = {
          key: {
            remoteJid: from,
            fromMe: false,
            id: mek.key?.id,
            participant: mek.key?.participant
          },
          message: quoted
        }
      }
    }

    const mime = targetMsg?.mimetype || ''
    const isImage = mime.includes('image') || mime.includes('sticker') || mime.includes('webp')
    const isVideo = mime.includes('video')
    if (!isImage && !isVideo) return reply('❌ පින්තූරයකට හෝ වීඩියෝවකට Reply කරන්න.')

    reply('✂️ *DMC™ MD : Cropping...*')

    const buffer = await downloadMediaMessage(targetWebMsg, 'buffer', {}, { logger: console })
    const squareWebp = await toSquareWebp(buffer, isVideo)

    const stickerPath = await writeExif(squareWebp, { packname: 'ＤＭＣ™ MD', author: 'ＤＭＣ™ＫＩＮＧ✓' })
    await conn.sendMessage(from, { sticker: { url: stickerPath } }, { quoted: mek })
    safeUnlink(stickerPath)
  } catch (e) {
    console.error(e)
    reply('❌ දෝෂයක් ඇති විය: ' + e.message)
  }
})
