const fs = require('fs');
const path = require('path');
const os = require('os');
const Crypto = require('crypto');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const webpmux = require('node-webpmux');

// =========================================================
//  DMC™ MD Sticker Converter
//  - No sharp / no jsquash required
//  - Uses fluent-ffmpeg, but forces ffmpeg-static binary
//  - Keeps animated stickers under WhatsApp 1MB ceiling
//  - EXIF metadata hard-locked
// =========================================================

// STRICT STICKER METADATA (never change)
const DMC_PACKNAME = '👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ';
const DMC_AUTHOR = 'ＤＭＣ™ 👑';

let _ffmpegConfigured = false;
function ensureFfmpeg() {
  if (_ffmpegConfigured) return;
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static not available');
  }
  ffmpeg.setFfmpegPath(ffmpegPath);
  _ffmpegConfigured = true;
}

function tmpFile(ext) {
  const dir = path.join(os.tmpdir(), 'dmc_sticker');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `dmc_${Crypto.randomBytes(10).toString('hex')}${ext}`);
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function buildExif(packname, author) {
  const json = {
    'sticker-pack-id': `dmc-${Crypto.randomBytes(8).toString('hex')}`,
    'sticker-pack-name': packname || DMC_PACKNAME,
    'sticker-pack-publisher': author || DMC_AUTHOR,
    emojis: ['']
  };

  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ]);

  const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
  const exif = Buffer.concat([exifAttr, jsonBuff]);
  exif.writeUIntLE(jsonBuff.length, 14, 4);
  return exif;
}

async function injectExif(webpBuffer, packname, author) {
  const img = new webpmux.Image();
  await img.load(webpBuffer);
  img.exif = buildExif(packname, author);
  return await img.save(null);
}

function ffmpegToWebp(inputPath, outputPath, opts) {
  ensureFfmpeg();

  const fps = Number(opts.fps || 15);
  const seconds = Number(opts.seconds || 10);
  const qscale = Number(opts.qscale || 75);
  const lossless = opts.lossless ? '1' : '0';

  // Required: scale to 512x512 with transparent padding (no stretch)
  const scalePad =
    'scale=512:512:force_original_aspect_ratio=decrease,' +
    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';

  const vf = opts.isVideo
    ? `${scalePad},fps=${fps}`
    : scalePad;

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .on('error', reject)
      .on('end', resolve)
      .addOutputOptions([
        '-vcodec', 'libwebp',
        '-loop', '0',
        '-preset', 'default',
        '-an',
        '-vsync', '0',
        '-vf', vf,
        '-qscale', String(qscale),
        '-lossless', lossless,
        '-compression_level', '6'
      ]);

    if (opts.isVideo) {
      // Required: duration <= 10 seconds
      cmd.addOutputOptions(['-t', String(seconds)]);
    } else {
      cmd.addOutputOptions(['-frames:v', '1']);
    }

    cmd.toFormat('webp').save(outputPath);
  });
}

async function createSticker(buffer, mime, packname, author) {
  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error('Invalid buffer');

  const m = String(mime || '').toLowerCase();
  const isGif = m.includes('image/gif');
  const isVideo = m.startsWith('video/') || isGif;

  // Safe extension
  const ext = isVideo ? '.mp4' : '.png';
  const inputPath = tmpFile(ext);
  const outputPath = tmpFile('.webp');

  fs.writeFileSync(inputPath, buffer);

  try {
    if (!isVideo) {
      // Image -> WebP using ffmpeg only (no sharp)
      await ffmpegToWebp(inputPath, outputPath, { isVideo: false, qscale: 70, lossless: false });
    } else {
      // Animated/GIF/Video -> WebP with size guard under 1MB
      const attempts = [
        { fps: 15, seconds: 10, qscale: 75 },
        { fps: 15, seconds: 8, qscale: 80 },
        { fps: 12, seconds: 8, qscale: 85 },
        { fps: 10, seconds: 6, qscale: 90 },
        { fps: 8, seconds: 5, qscale: 95 }
      ];

      for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i];
        await ffmpegToWebp(inputPath, outputPath, { ...a, isVideo: true, lossless: false });

        let sz = 0;
        try { sz = fs.statSync(outputPath).size; } catch (_) { sz = 0; }
        if (sz > 0 && sz <= 1024 * 1024) break;

        // If last attempt still too large, keep it (some media cannot fit under 1MB)
      }
    }

    const webpBuffer = fs.readFileSync(outputPath);
    const finalBuffer = await injectExif(webpBuffer, packname || DMC_PACKNAME, author || DMC_AUTHOR);

    safeUnlink(inputPath);
    safeUnlink(outputPath);

    return finalBuffer;
  } catch (e) {
    safeUnlink(inputPath);
    safeUnlink(outputPath);
    throw e;
  }
}

module.exports = { createSticker, DMC_PACKNAME, DMC_AUTHOR };
