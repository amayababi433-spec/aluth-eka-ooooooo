const { cmd } = require('../command');
const axios = require('axios');
const path = require('path');

// Try load native sticker formatter (sharp based)
let NativeSticker;
try {
    ({ Sticker: NativeSticker } = require('wa-sticker-formatter'));
} catch (e) {
    // Sharp missing is expected on some hosts
    // console.log("Native sticker engine missing, using ffmpeg fallback.");
}

// Load robust FFMPEG sticker engine
const { createSticker: ffmpegSticker } = require('../lib/sticker');

// =============================================================
//  EMOJI MIXER
// =============================================================
cmd({
    pattern: "emojimix",
    alias: ["mix", "emix"],
    desc: "Mix two emojis into a sticker",
    category: "fun",
    filename: __filename
},
    async (conn, mek, m, { from, q, reply }) => {
        try {
            if (!q.includes('+')) return reply("🧩 Use format: .emojimix 😂+😭");

            const [e1, e2] = q.split('+');
            if (!e1 || !e2) return reply("❌ Please provide two emojis.");

            const targetUrl = `${global.api.alyabot}/whatsapp/emojimix?emoji1=${encodeURIComponent(e1)}&emoji2=${encodeURIComponent(e2)}&key=${global.APIKeys['emojimix']}`;

            await conn.sendMessage(from, { react: { text: "🧩", key: mek.key } });

            // Get Buffer
            const res = await axios.get(targetUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(res.data);

            let stickerBuffer;

            // Strategy 1: Try Native (Sharp) if available
            if (NativeSticker) {
                try {
                    const s = new NativeSticker(buffer, {
                        pack: 'DMC Mix',
                        author: 'DMC Bot',
                        type: 'full',
                        categories: ['🤩', '🎉'],
                        quality: 70,
                        background: 'transparent'
                    });
                    stickerBuffer = await s.toBuffer();
                } catch (e) {
                    // If sharp crashes mid-process (e.g. incompatible binary), fall through
                    stickerBuffer = null;
                }
            }

            // Strategy 2: Fallback to FFMPEG (Robust)
            if (!stickerBuffer) {
                // console.log("Using FFMPEG fallback for emojimix...");
                stickerBuffer = await ffmpegSticker(buffer, 'image/png', 'DMC Mix', 'DMC Bot');
            }

            if (stickerBuffer) {
                await conn.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });
            } else {
                reply("❌ Error creating sticker.");
            }

        } catch (e) {
            console.error(e);
            reply("❌ Cannot mix these emojis.");
        }
    });
