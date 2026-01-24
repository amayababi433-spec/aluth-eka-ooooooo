
const { writeExif } = require('../lib/exif')

module.exports = {
  name: 'take',
  alias: ['wm','steal','exif'],
  async execute(m, { conn, text }) {
    if (!m.quoted || !m.quoted.mimetype || !m.quoted.mimetype.includes('webp'))
      return m.reply('Reply to a Sticker!')

    let pack = text?.split('|')[0]?.trim() || 'ＤＭＣ™ MD'
    let author = text?.split('|')[1]?.trim() || 'ＤＭＣ™ＫＩＮＧ✓'

    let buffer = await m.quoted.download()
    let out = await writeExif(buffer, { packname: pack, author: author })

    await conn.sendMessage(m.chat, { sticker: out }, { quoted: m })
  }
}
