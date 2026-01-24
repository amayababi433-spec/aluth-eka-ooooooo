const { cmd } = require('../command');
const { getRandom } = require('../lib/functions');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const convertLocks = new Set();
function lockKey(m) {
    return m?.key?.participant || m?.key?.remoteJid;
}

// ===============================
// Robust detection + download helpers
// Many bot frameworks don't set quoted.mimetype for stickers.
// So we detect stickers via multiple fields and message shapes.
// ===============================
function getMaybeMime(t) {
    return String(
        t?.mimetype ||
        t?.msg?.mimetype ||
        t?.message?.mimetype ||
        t?.message?.stickerMessage?.mimetype ||
        t?.stickerMessage?.mimetype ||
        ''
    ).toLowerCase();
}

function isStickerTarget(t) {
    if (!t) return false;
    const mime = getMaybeMime(t);
    if (mime.includes('webp')) return true;

    // Some frameworks expose flags
    if (t?.isSticker === true) return true;
    if (t?.sticker === true) return true;

    // Common framework fields
    const mt = String(t?.mtype || t?.type || t?.messageType || '').toLowerCase();
    if (mt.includes('sticker')) return true;

    // Baileys-like shapes
    if (t?.message?.stickerMessage) return true;
    if (t?.stickerMessage) return true;
    if (t?.msg?.type === 'stickerMessage') return true;

    // Some frameworks store quoted message content in .msg directly
    if (t?.msg?.stickerMessage) return true;

    return false;
}

function isAudioOrVideoTarget(t) {
    if (!t) return false;
    const mime = getMaybeMime(t);
    if (/audio\//.test(mime) || /video\//.test(mime)) return true;
    const mt = String(t?.mtype || t?.type || t?.messageType || '').toLowerCase();
    if (mt.includes('audio') || mt.includes('video')) return true;
    if (t?.message?.audioMessage || t?.message?.videoMessage) return true;
    if (t?.audioMessage || t?.videoMessage) return true;
    if (t?.msg?.audioMessage || t?.msg?.videoMessage) return true;
    return false;
}

// Detect animated WebP by scanning for the ANIM chunk (reliable even when frameworks omit isAnimated flags)
function isAnimatedWebpBuffer(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 16) return false;
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return false;
    if (buf.toString('ascii', 8, 12) !== 'WEBP') return false;
    return buf.includes(Buffer.from('ANIM'));
  } catch (e) {
    return false;
  }
}


// Detect animated WebP by scanning for the ANIM chunk (reliable even when frameworks omit isAnimated flags)
function isAnimatedWebpBuffer(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 16) return false;
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return false;
    if (buf.toString('ascii', 8, 12) !== 'WEBP') return false;
    return buf.includes(Buffer.from('ANIM'));
  } catch (e) {
    return false;
  }
}
// Detect animated WebP by scanning for the ANIM chunk (reliable even when frameworks omit isAnimated flags)
function isAnimatedWebpBuffer(buf) {
    try {
        if (!Buffer.isBuffer(buf) || buf.length < 16) return false;
        if (buf.toString('ascii', 0, 4) !== 'RIFF') return false;
        if (buf.toString('ascii', 8, 12) !== 'WEBP') return false;
        return buf.includes(Buffer.from('ANIM'));
    } catch (_) {
        return false;
    }
}

// Detect animated WebP by scanning for the ANIM chunk (reliable even when frameworks omit isAnimated flags)
function isAnimatedWebpBuffer(buf) {
    try {
        if (!Buffer.isBuffer(buf) || buf.length < 16) return false;
        if (buf.toString("ascii", 0, 4) !== "RIFF") return false;
        if (buf.toString("ascii", 8, 12) !== "WEBP") return false;
        return buf.includes(Buffer.from("ANIM"));
    } catch (_) {
        return false;
    }
}

// Detect animated WebP by scanning for the ANIM chunk (reliable even when frameworks omit isAnimated flags)
function isAnimatedWebpBuffer(buf) {
    try {
        if (!Buffer.isBuffer(buf) || buf.length < 16) return false;
        if (buf.toString("ascii", 0, 4) !== "RIFF") return false;
        if (buf.toString("ascii", 8, 12) !== "WEBP") return false;
        return buf.includes(Buffer.from("ANIM"));
    } catch (_) {
        return false;
    }
}


async function downloadToBuffer(conn, target) {
    // Try Baileys helper first.
    // Some command frameworks wrap the raw message inside `m.quoted.msg`.
    // We normalize to a { key, message } shape when possible.
    const normalized = (() => {
        if (!target) return target;
        if (target?.message) return target; // already Baileys-like

        // If framework stores the proto under `msg`, use it.
        if (target?.msg) {
            // Some frameworks store the actual proto message under msg.message
            const msgObj = target.msg?.message || target.msg;
            if (msgObj) {
                return {
                    key: target.key || target.msg?.key,
                    message: msgObj
                };
            }
        }

        return target;
    })();

    try {
        return await downloadMediaMessage(normalized, 'buffer', {}, { logger: console });
    } catch (e) {
        // fallback below
    }

    // Some bots expose download function on conn
    if (typeof conn?.downloadMediaMessage === 'function') {
        try {
            return await conn.downloadMediaMessage(normalized);
        } catch (_) {}
    }

    // Last resort: save to disk then read
    if (typeof conn?.downloadAndSaveMediaMessage === 'function') {
        const p = await conn.downloadAndSaveMediaMessage(normalized);
        const b = fs.readFileSync(p);
        try { fs.unlinkSync(p); } catch (_) {}
        return b;
    }

    throw new Error('Media download failed');
}

// 1. MP3 CONVERTER
cmd({
    pattern: "mp3",
    alias: ["audio"],
    desc: "Convert media to MP3",
    category: "converter",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    const lk = lockKey(mek);
    if (convertLocks.has(lk)) return reply("⏳ Wait! Processing...");
    
    let target = m.quoted ? m.quoted : m;
    if (!isAudioOrVideoTarget(target)) return reply("❌ Reply to a Video or Audio.");

    convertLocks.add(lk);
    try {
        reply("♻️ *Converting to MP3...*");
        const buffer = await downloadToBuffer(conn, target);
        const input = getRandom('.mp4');
        const out = getRandom('.mp3');
        fs.writeFileSync(input, buffer);

        spawn('ffmpeg', ['-y', '-i', input, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', out])
        .on('close', async (code) => {
            if (fs.existsSync(input)) fs.unlinkSync(input);
            if (code === 0) {
                await conn.sendMessage(from, { audio: { url: path.resolve(out) }, mimetype: "audio/mpeg" }, { quoted: mek });
            } else {
                reply("❌ Error converting.");
            }
            if (fs.existsSync(out)) fs.unlinkSync(out);
            convertLocks.delete(lk);
        });
    } catch (e) {
        convertLocks.delete(lk);
        reply("❌ Critical Error.");
    }
});

// 2. PHOTO CONVERTER
cmd({
    pattern: "photo",
    alias: ["img", "jpg", "toimg"],
    desc: "Convert sticker to media (static -> PNG, animated -> MP4)",
    category: "converter",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    const lk = lockKey(mek);
    if (convertLocks.has(lk)) return reply("⏳ Wait!");

    // IMPORTANT:
    // Many command frameworks pass a simplified `m` object that may NOT contain the raw
    // Baileys `message` payload when the command is sent as an image/video caption.
    // In that case, we must fall back to the raw `mek` message so downloads work.
    const target = (() => {
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
        return m;
    })();

    // If user replied to a normal image, just resend it as a photo (nice UX)
    const mime = getMaybeMime(target) || getMaybeMime(mek);
    const isImage =
        /image\//.test(mime) ||
        target?.message?.imageMessage ||
        target?.msg?.type === 'imageMessage' ||
        target?.msg?.imageMessage ||
        target?.imageMessage ||
        mek?.message?.imageMessage;

    const isSticker = isStickerTarget(target) || isStickerTarget(mek);

    if (!isSticker && !isImage) return reply("❌ Reply to a Sticker (or an Image).");

    convertLocks.add(lk);
    try {
        reply("♻️ *Converting...*");

        // If it's already an image, just re-send
        if (isImage && !isSticker) {
            const imgBuf = await downloadToBuffer(conn, target);
            await conn.sendMessage(from, { image: imgBuf, caption: "✅ *Done*" }, { quoted: mek });
            convertLocks.delete(lk);
            return;
        }

        // Sticker -> Photo/Video using ffmpeg-static (NO sharp/jsquash required)
        if (!ffmpegPath) {
            convertLocks.delete(lk);
            return reply("❌ Converter error: ffmpeg missing.");
        }

        const inPath = path.join(__dirname, "..", "tmp", getRandom(".webp"));
        const outPng = path.join(__dirname, "..", "tmp", getRandom(".png"));
        const outMp4 = path.join(__dirname, "..", "tmp", getRandom(".mp4"));
        if (!fs.existsSync(path.dirname(inPath))) fs.mkdirSync(path.dirname(inPath), { recursive: true });

        const buf = await downloadToBuffer(conn, target);
        fs.writeFileSync(inPath, buf);

        const stickerMsg = target?.message?.stickerMessage || target?.msg?.stickerMessage || target?.msg;
        const isAnimatedSticker = Boolean(
            stickerMsg?.isAnimated ||
            stickerMsg?.is_animated ||
            target?.message?.stickerMessage?.isAnimated ||
            target?.msg?.type === 'animatedStickerMessage'
        ) || isAnimatedWebpBuffer(buf);

        const runFfmpeg = (args) => new Promise((resolve, reject) => {
            const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
            let err = "";
            p.stderr.on('data', d => err += d.toString());
            p.on('error', reject);
            p.on('close', code => code === 0 ? resolve() : reject(new Error(err || ("ffmpeg exit " + code))));
        });

        try {
            if (isAnimatedSticker) {
                // webp(animated) -> mp4 (WhatsApp safe)
                const attempts = [
                    { t: "00:00:08", fps: 15 },
                    { t: "00:00:06", fps: 12 },
                    { t: "00:00:04", fps: 10 }
                ];

                let lastErr = null;
                for (const a of attempts) {
                    try {
                        await runFfmpeg([
                            "-y",
                            "-ss", "00:00:00",
                            "-t", a.t,
                            "-i", inPath,
                            "-an",
                            "-vsync", "0",
                            "-preset", "default",
                            "-movflags", "+faststart",
                            "-pix_fmt", "yuv420p",
                            "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=" + a.fps + ",pad=512:512:-1:-1:color=0x00000000",
                            "-c:v", "libx264",
                            outMp4
                        ]);
                        lastErr = null;
                        break;
                    } catch (e) {
                        lastErr = e;
                    }
                }
                if (lastErr) throw lastErr;

                const v = fs.readFileSync(outMp4);
                await conn.sendMessage(from, { video: v, mimetype: "video/mp4", caption: "✅ *Done*" }, { quoted: mek });
            } else {
                // webp(static) -> png
                await runFfmpeg([
                    "-y",
                    "-i", inPath,
                    "-frames:v", "1",
                    outPng
                ]);

                const img = fs.readFileSync(outPng);
                await conn.sendMessage(from, { image: img, mimetype: "image/png", caption: "✅ *Done*" }, { quoted: mek });
            }
        } catch (e) {
            reply("❌ Error converting.");
        } finally {
            if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
            if (fs.existsSync(outPng)) fs.unlinkSync(outPng);
            if (fs.existsSync(outMp4)) fs.unlinkSync(outMp4);
            convertLocks.delete(lk);
        }
    } catch (e) {
        convertLocks.delete(lk);
        reply("❌ Critical Error.");
    }
});
