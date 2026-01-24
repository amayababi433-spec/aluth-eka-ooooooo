const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const ffmpegPath = require('ffmpeg-static');

const convertLocks = new Set();
function lockKey(m) {
  return m?.key?.participant || m?.key?.remoteJid;
}

function tmpFile(ext) {
  const name = crypto.randomBytes(10).toString('hex') + ext;
  const dir = path.join(os.tmpdir(), 'dmc_simage');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

async function downloadStickerToBuffer(quoted) {
  const msg = quoted?.message?.stickerMessage || quoted?.stickerMessage || quoted?.msg?.stickerMessage;
  if (!msg) return null;

  const stream = await downloadContentFromMessage(msg, 'sticker');
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
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
  pattern: "simage",
  alias: ["toimg", "img"],
  desc: "Convert Sticker to Image (static -> PNG, animated -> MP4)",
  category: "converter",
  filename: __filename
}, async (conn, mek, m, { from, quoted, reply }) => {
  const lk = lockKey(mek);
  if (convertLocks.has(lk)) return reply("⏳ Wait! Previous conversion still processing...");
  convertLocks.add(lk);

  try {
    const target = quoted || m?.quoted || m;
    const stickerExists =
      target?.message?.stickerMessage ||
      target?.stickerMessage ||
      target?.msg?.stickerMessage ||
      target?.msg?.type === 'stickerMessage';

    if (!stickerExists) {
      convertLocks.delete(lk);
      return reply("❌ Reply to a Sticker.");
    }

    if (!ffmpegPath) {
      convertLocks.delete(lk);
      return reply("❌ Converter error: ffmpeg missing.");
    }

    reply("🖼️ *Converting...*");

    const webpBuffer = await downloadStickerToBuffer(target);
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
