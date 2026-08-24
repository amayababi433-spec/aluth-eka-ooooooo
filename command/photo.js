const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const ffmpegPath = require('ffmpeg-static');
// NOTE: do NOT use `file-type` here (v16 is ESM-only in many bot bases).
// We keep this command fully CJS-compatible.

const convertLocks = new Set();
function lockKey(m) {
  return m?.key?.participant || m?.key?.remoteJid;
}

function tmpFile(ext) {
  const name = crypto.randomBytes(10).toString('hex') + ext;
  const dir = path.join(os.tmpdir(), 'dmc_photo');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

async function downloadAnyMediaToBuffer(webMessage) {
  try {
    const buf = await downloadMediaMessage(webMessage, 'buffer', {}, { logger: console });
    if (!buf || !Buffer.isBuffer(buf) || !buf.length) return null;
    return buf;
  } catch {
    return null;
  }
}

function isAnimatedSticker(quoted) {
  const sm = quoted?.message?.stickerMessage || quoted?.stickerMessage || quoted?.msg?.stickerMessage || quoted?.msg;
  return Boolean(sm?.isAnimated || sm?.is_animated);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => (err += d.toString()));
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(err || ('ffmpeg exit ' + code)))));
  });
}

cmd({
  pattern: "photo",
  alias: ["img", "jpg"],
  desc: "Convert sticker to photo (static -> PNG, animated -> MP4)",
  category: "converter",
  filename: __filename
}, async (conn, mek, m, { from, quoted, reply }) => {
  const lk = lockKey(mek);
  if (convertLocks.has(lk)) return reply("⏳ Wait! Previous conversion still processing...");
  convertLocks.add(lk);

  try {
    // IMPORTANT:
    // Some command frameworks pass a simplified `m` object when the command is sent as
    // an image/video caption. Use raw `mek` as fallback so media downloads work.
    const target = (() => {
      if (quoted) return quoted;
      if (m?.quoted) return m.quoted;
      const hasMediaInM = Boolean(
        m?.message?.imageMessage || m?.message?.videoMessage || m?.message?.stickerMessage ||
        m?.msg?.imageMessage || m?.msg?.videoMessage || m?.msg?.stickerMessage ||
        m?.imageMessage || m?.videoMessage || m?.stickerMessage
      );
      if (hasMediaInM) return m;
      const hasMediaInMek = Boolean(
        mek?.message?.imageMessage || mek?.message?.videoMessage || mek?.message?.stickerMessage
      );
      if (hasMediaInMek) return mek;
      return m || mek;
    })();
    const stickerExists = Boolean(
      target?.message?.stickerMessage ||
      target?.stickerMessage ||
      target?.msg?.stickerMessage ||
      target?.msg?.type === 'stickerMessage'
    );

    const imageExists = Boolean(
      target?.message?.imageMessage ||
      target?.imageMessage ||
      target?.msg?.imageMessage ||
      target?.msg?.mimetype?.startsWith('image/')
    );

    const videoExists = Boolean(
      target?.message?.videoMessage ||
      target?.videoMessage ||
      target?.msg?.videoMessage ||
      target?.msg?.mimetype?.startsWith('video/')
    );

    if (!stickerExists && !imageExists && !videoExists) {
      convertLocks.delete(lk);
      return reply("❌ Reply to a Sticker (or an Image).");
    }

    if (!ffmpegPath) {
      convertLocks.delete(lk);
      return reply("❌ Converter error: ffmpeg missing.");
    }

    reply("🖼️ *Converting...*");

    // If user replied to an IMAGE: just re-send it as a proper image (no heavy conversion)
    if (imageExists && !stickerExists) {
      const imgBuf = await downloadAnyMediaToBuffer(target);
      if (!imgBuf || !imgBuf.length) {
        convertLocks.delete(lk);
        return reply("❌ Download failed.");
      }

      const mimetype =
        target?.message?.imageMessage?.mimetype ||
        target?.imageMessage?.mimetype ||
        target?.msg?.mimetype ||
        'image/jpeg';
      await conn.sendMessage(from, { image: imgBuf, mimetype, caption: "✅ Converted by ＤＭＣ™" }, { quoted: mek });
      convertLocks.delete(lk);
      return;
    }

    // If user replied to a VIDEO: re-send it as mp4
    if (videoExists && !stickerExists) {
      const vidBuf = await downloadAnyMediaToBuffer(target);
      if (!vidBuf || !vidBuf.length) {
        convertLocks.delete(lk);
        return reply("❌ Download failed.");
      }
      await conn.sendMessage(from, { video: vidBuf, mimetype: "video/mp4", caption: "✅ Converted by ＤＭＣ™" }, { quoted: mek });
      convertLocks.delete(lk);
      return;
    }

    const webpBuffer = await downloadAnyMediaToBuffer(target);
    if (!webpBuffer || !webpBuffer.length) {
      convertLocks.delete(lk);
      return reply("❌ Download failed.");
    }

    const inPath = tmpFile('.webp');
    fs.writeFileSync(inPath, webpBuffer);

    const animated = isAnimatedSticker(target);

    if (animated) {
      const outMp4 = tmpFile('.mp4');
      await runFfmpeg([
        "-y",
        "-i", inPath,
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-r", "15",
        outMp4
      ]);

      const mp4 = fs.readFileSync(outMp4);
      await conn.sendMessage(from, { video: mp4, mimetype: "video/mp4", caption: "✅ Converted by ＤＭＣ™" }, { quoted: mek });

      if (fs.existsSync(outMp4)) fs.unlinkSync(outMp4);
    } else {
      const outPng = tmpFile('.png');
      await runFfmpeg([
        "-y",
        "-i", inPath,
        "-frames:v", "1",
        outPng
      ]);

      const png = fs.readFileSync(outPng);
      await conn.sendMessage(from, { image: png, mimetype: "image/png", caption: "✅ Converted by ＤＭＣ™" }, { quoted: mek });

      if (fs.existsSync(outPng)) fs.unlinkSync(outPng);
    }

    if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
    convertLocks.delete(lk);
  } catch (e) {
    convertLocks.delete(lk);
    reply("❌ පරිවර්තනය අසාර්ථක විය.");
  }
});
