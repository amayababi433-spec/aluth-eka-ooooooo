const { cmd } = require('../command')
const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { writeExif } = require('../lib/exif')
const fs = require('fs')
const ff = require('fluent-ffmpeg')
const { tmpdir } = require("os")
const path = require("path")
const Crypto = require("crypto")

cmd({
    pattern: "crop",
    alias: ["scrop", "scc"],
    desc: "Square crop sticker maker",
    category: "converter",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        let target = m.quoted ? m.quoted : m
        let mime = (target.msg || target).mimetype || ''

        if (!/image|video/.test(mime)) return reply("❌ පින්තූරයකට හෝ වීඩියෝවකට Reply කරන්න.")

        reply("✂️ *DMC™ MD : Cropping & Creating Sticker...*")

        const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger: console })
        const tmpIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUInt32LE(0)}.tmp`)
        const tmpOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUInt32LE(0)}.webp`)
        fs.writeFileSync(tmpIn, buffer)

        // FFmpeg Crop Logic: මැද කොටස පමණක් ගෙන 1:1 ratio එකට සැකසීම
        await new Promise((resolve, reject) => {
            ff(tmpIn)
                .on("error", reject)
                .on("end", () => resolve(true))
                .addOutputOptions([
                    "-vcodec", "libwebp",
                    "-vf", "crop='min(iw,ih):min(iw,ih)',scale=320:320,fps=15",
                    "-loop", "0", "-preset", "default", "-an", "-vsync", "0"
                ])
                .toFormat("webp")
                .save(tmpOut)
        })

        const finalSticker = await writeExif(fs.readFileSync(tmpOut), { 
            packname: "ＤＭＣ™ MD", 
            author: "ＤＭＣ™ＫＩＮＧ✓" 
        })

        await conn.sendMessage(from, { sticker: { url: finalSticker } }, { quoted: mek })
        
        // Clean up files
        [tmpIn, tmpOut, finalSticker].forEach(f => fs.existsSync(f) && fs.unlinkSync(f))

    } catch (e) {
        reply("❌ Crop කිරීමේදී දෝෂයක් ඇති විය.");
    }
})