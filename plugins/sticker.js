const { cmd } = require('../command');
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const fs = require('fs');

const { createSticker, DMC_PACKNAME, DMC_AUTHOR } = require('../lib/sticker');
const { writeExifImg, writeExifVid } = require('../lib/exif');

const BOT_NAME = '👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑';

function isGoogleDriveUrl(url) {
    return typeof url === 'string' && (url.includes('drive.google.com') || url.includes('docs.google.com'));
}

function normalizeQuotedFromContext(mek, from) {
  const msg = mek.message || {};
  const quoted = msg?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return null;

  const qType = getContentType(quoted);
  if (!qType) return null;

  return {
    key: {
      remoteJid: from,
      fromMe: false,
      id: mek.key?.id,
      participant: mek.key?.participant,
    },
    message: quoted,
    msg: quoted[qType],
    type: qType,
  };
}

async function streamToBufferWithLimit(readable, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    readable.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        readable.destroy(new Error('File too large'));
        return;
      }
      chunks.push(chunk);
    });

    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

cmd({
  pattern: 'sticker',
  alias: ['s', 'stic'],
  desc: 'Pro Sticker Maker (Animated WebP + Metadata Lock)',
  category: 'sticker',
  filename: __filename,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    // HARD-LOCK metadata
    const meta = { packname: DMC_PACKNAME, author: DMC_AUTHOR };

    // 1.5) If user provides a text query for AI animated sticker
    if (q && !isGoogleDriveUrl(q) && !mek.message?.imageMessage && !mek.message?.videoMessage && !mek.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        reply(`${BOT_NAME}\n\n✨ AI is generating an animated sticker for: *${q}*...`);
        try {
            const axios = require('axios');
            const cheerio = require('cheerio');
            
            let searchTerm = q;
            try {
                // Use Gemini to translate Sinhala/Singlish into a short, exact 1-3 word English search term for Tenor
                const geminiKey = Buffer.from("QVEuQWI4Uk42TDNhOTVxeUd1YU5fWGpLQUk0XzRCT2hmdU9XeVB4eUpGQXotN0JjMjJuSHc=", 'base64').toString('utf8');
                const prompt = `The user is typing in Sinhala or Singlish (e.g. adana kollek = crying boy). Translate and summarize this Sinhala/Singlish request into a short 1-3 word English search term for finding a GIF. Request: "${q}". ONLY output the short English phrase.`;
                const gRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`, {
                    contents: [{ parts: [{ text: prompt }] }]
                }, { timeout: 5000 });
                const aiText = gRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (aiText) searchTerm = aiText.trim().replace(/[^a-zA-Z0-9 ]/g, '');
                console.log("Sticker Search Term:", searchTerm);
            } catch (e) { console.log("Gemini translation failed for .sticker"); }
            const res = await axios.get(`https://tenor.com/search/${encodeURIComponent(searchTerm.replace(/ /g, '-'))}-gifs`);

            const $ = cheerio.load(res.data);
            
            let foundUrl = null;
            $('div.Gif img').each((i, el) => {
                const src = $(el).attr('src');
                if (src && src.endsWith('.gif')) {
                    foundUrl = src;
                    return false; 
                }
            });

            if (!foundUrl) {
                return reply(`${BOT_NAME}\n\n⚠️ Sorry, AI couldn't find an animated sticker for that.`);
            }

            const gifRes = await axios.get(foundUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(gifRes.data);
            const stickerBuffer = await createSticker(buffer, 'video/gif', meta.packname, meta.author);
            return await conn.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });
        } catch (err) {
            console.error(err);
            return reply(`${BOT_NAME}\n\n⚠️ Error generating AI animated sticker.`);
        }
    }

    // 1) If user provides a Google Drive link: .sticker <drive_link>
    if (q && isGoogleDriveUrl(q)) {
      return reply(`${BOT_NAME}\n\n⚠️ Google Drive sticker generation is currently unsupported.`);
    }

    // 2) Otherwise: reply to image/video/gif
    const msg = mek.message || {};
    let targetWebMsg = mek;
    let targetType = getContentType(msg);
    let targetMsg = targetType ? msg[targetType] : null;

    const isTextCommandMsg = targetType === 'conversation' || targetType === 'extendedTextMessage';
    if ((isTextCommandMsg || !targetMsg)) {
      const qd = normalizeQuotedFromContext(mek, from);
      if (qd) {
        targetWebMsg = qd;
        targetType = qd.type;
        targetMsg = qd.msg;
      }
    }

    const mime = targetMsg?.mimetype || '';
    if (!mime || (!mime.includes('image') && !mime.includes('video') && !mime.includes('gif'))) {
      return reply(`${BOT_NAME}\n\n⚠️ Reply to an image / video / GIF to make a sticker.\nOr use: .sticker <name> to generate an AI sticker!`);
    }

    reply(`${BOT_NAME}\n\n⏳ Creating Pro Sticker...`);

    // NOTE: baileys downloadMediaMessage returns a buffer. Stickers are small; safe on 1GB.
    const buffer = await downloadMediaMessage(targetWebMsg, 'buffer', {}, { logger: console });

    // Primary pipeline: FFmpeg -> WebP + node-webpmux EXIF (keeps animated movement)
    try {
      const stickerBuffer = await createSticker(buffer, mime, meta.packname, meta.author);
      return await conn.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });
    } catch (primaryErr) {
      // Fallback: legacy EXIF writer (if input is already webp)
      try {
        const outPath = (mime.includes('video') || mime.includes('gif'))
          ? await writeExifVid(buffer, meta)
          : await writeExifImg(buffer, meta);

        await conn.sendMessage(from, { sticker: { url: outPath } }, { quoted: mek });
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
        return;
      } catch {}

      console.error(primaryErr);
      return reply(`${BOT_NAME}\n\n⚠️ Sticker creation failed: ${primaryErr?.message || primaryErr}`);
    }
  } catch (e) {
    console.error(e);
    reply(`${BOT_NAME}\n\n⚠️ Error: ${e.message}`);
  }
});
