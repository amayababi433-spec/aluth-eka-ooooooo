const { cmd } = require('../command')
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys')
const fs = require('fs')
const { writeExif } = require('../lib/exif')

cmd({
  pattern: 'take',
  alias: ['wm', 'steal', 'exif'],
  desc: 'Change sticker pack & author',
  category: 'converter',
  filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
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
    if (!mime.includes('webp')) return reply('❌ ස්ටිකරයකට Reply කරන්න.')

    const parts = (q || '').split('|')
    const packname = (parts[0] || 'ＤＭＣ™ MD').trim() || 'ＤＭＣ™ MD'
    const author = (parts[1] || 'ＤＭＣ™ＫＩＮＧ✓').trim() || 'ＤＭＣ™ＫＩＮＧ✓'

    reply('🧩 *DMC™ MD : Updating metadata...*')

    const buffer = await downloadMediaMessage(targetWebMsg, 'buffer', {}, { logger: console })
    const stickerPath = await writeExif(buffer, { packname, author })

    await conn.sendMessage(from, { sticker: { url: stickerPath } }, { quoted: mek })
    try { if (fs.existsSync(stickerPath)) fs.unlinkSync(stickerPath) } catch (_) {}
  } catch (e) {
    console.error(e)
    reply('❌ Metadata වෙනස් කිරීම අසාර්ථක විය.')
  }
})
