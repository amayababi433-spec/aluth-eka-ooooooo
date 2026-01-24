const { cmd } = require('../command');
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const fs = require('fs');

const { createSticker, DMC_PACKNAME, DMC_AUTHOR } = require('../lib/sticker');
const { writeExifImg, writeExifVid } = require('../lib/exif');
const { isGoogleDriveUrl, streamFromGoogleDrive } = require('../lib/downloader');

const BOT_NAME = '👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑';

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

    // 1) If user provides a Google Drive link: .sticker <drive_link>
    if (q && isGoogleDriveUrl(q)) {
      reply(`${BOT_NAME}\n\n🎨 Creating sticker from Google Drive...`);

      // Sticker sources are expected to be <= 20MB
      const { stream, contentType } = await streamFromGoogleDrive(q);
      const buffer = await streamToBufferWithLimit(stream, 20 * 1024 * 1024);

      const mime = contentType || 'application/octet-stream';
      const stickerBuffer = await createSticker(buffer, mime, meta.packname, meta.author);
      return await conn.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });
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
      return reply(`${BOT_NAME}\n\n❌ Reply to an image / video / GIF to make a sticker.\nOr use: .sticker <Google Drive link>`);
    }

    reply(`${BOT_NAME}\n\n🎨 Creating Pro Sticker...`);

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
      return reply(`${BOT_NAME}\n\n❌ Sticker creation failed: ${primaryErr?.message || primaryErr}`);
    }
  } catch (e) {
    console.error(e);
    reply(`${BOT_NAME}\n\n❌ Error: ${e.message}`);
  }
});
