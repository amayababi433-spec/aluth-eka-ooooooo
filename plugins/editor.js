const { cmd } = require('../command');
const { getRandom } = require('../lib/functions');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ===========================================
//  PERFORMANCE ENGINE: THREAD LOCK & SMART SEND
// ===========================================
const locks = new Set();
const cooldown = new Map();
const CD_MS = 3000; // 3 Seconds Cooldown

function lockKey(m) {
    return m?.key?.participant || m?.key?.remoteJid;
}

function onCooldown(id) {
    const last = cooldown.get(id) || 0;
    if (Date.now() - last < CD_MS) return true;
    cooldown.set(id, Date.now());
    return false;
}

// Helper: Run FFmpeg Command
function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', ['-y', ...args]);
        ff.on('error', reject);
        ff.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with code ${code}`));
        });
    });
}

// Helper: Smart Send (Auto switch between Media & Document)
async function sendSmartMedia(conn, from, filePath, type, mek, caption = "") {
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);

    // 16MB ට වැඩි නම් Document විදිහට යවනවා (Limit Bypass Logic)
    if (fileSizeMB > 16) {
        await conn.sendMessage(from, { 
            document: { url: filePath }, 
            mimetype: type === 'video' ? 'video/mp4' : 'audio/mpeg',
            fileName: `Queen_Ria_Edit${type === 'video' ? '.mp4' : '.mp3'}`,
            caption: `${caption}\n⚠️ *File > 16MB (Sent as Document)*`
        }, { quoted: mek });
    } else {
        // පොඩි නම් සාමාන්‍ය විදිහට
        const msgParams = { caption };
        if (type === 'video') {
            msgParams.video = { url: filePath };
            msgParams.mimetype = 'video/mp4';
        } else if (type === 'audio') {
            msgParams.audio = { url: filePath };
            msgParams.mimetype = 'audio/mpeg';
            msgParams.ptt = true; // Voice Note
        } else if (type === 'image') {
            msgParams.image = { url: filePath };
        }
        await conn.sendMessage(from, msgParams, { quoted: mek });
    }
}

// ===========================================
// 1. QR CODE GENERATOR (FAST)
// ===========================================
cmd({
    pattern: "qr",
    desc: "Generate a QR code",
    category: "editor",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    if (!q) return reply("❌ Give text/url. Ex: .qr Hello");
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(q)}`;
    await conn.sendMessage(from, { image: { url }, caption: "✅ *Your QR Code*" }, { quoted: mek });
});

// ===========================================
// 2. BLACK & WHITE (Photo & Video)
// ===========================================
cmd({
    pattern: "bw",
    alias: ["black", "white"],
    desc: "Make photo/video Black & White",
    category: "editor",
    filename: __filename
}, async (conn, mek, m, { from, quoted, reply }) => {
    const lk = lockKey(mek);
    if (locks.has(lk)) return reply("⏳ Processing previous request...");
    if (onCooldown(lk)) return reply("⏳ Slow down...");
    
    locks.add(lk);
    let input, output;

    try {
        if (!quoted?.msg?.mimetype) throw new Error("Reply to media");
        const isVideo = quoted.msg.mimetype.includes("video");
        const isImage = quoted.msg.mimetype.includes("image");
        if (!isVideo && !isImage) throw new Error("Invalid Media");

        reply("🎨 *Applying Filter...*");
        input = await conn.downloadAndSaveMediaMessage(quoted);
        output = getRandom(isVideo ? ".mp4" : ".jpg");

        // FFmpeg: hue=s=0 (Desaturate)
        await runFfmpeg(['-i', input, '-vf', 'hue=s=0', '-preset', 'ultrafast', output]);

        await sendSmartMedia(conn, from, path.resolve(output), isVideo ? 'video' : 'image', mek, "✅ *Black & White Effect*");

    } catch (e) {
        reply("❌ Error processing media.");
    } finally {
        if (input && fs.existsSync(input)) fs.unlinkSync(input);
        if (output && fs.existsSync(output)) fs.unlinkSync(output);
        locks.delete(lk);
    }
});

// ===========================================
// 3. REVERSE MEDIA (Video & Audio)
// ===========================================
cmd({
    pattern: "reverse",
    desc: "Reverse video/audio",
    category: "editor",
    filename: __filename
}, async (conn, mek, m, { from, quoted, reply }) => {
    const lk = lockKey(mek);
    if (locks.has(lk)) return reply("⏳ Processing...");
    locks.add(lk);
    let input, output;

    try {
        if (!quoted?.msg?.mimetype) throw new Error("Reply to media");
        const isVideo = quoted.msg.mimetype.includes("video");
        const isAudio = quoted.msg.mimetype.includes("audio");
        if (!isVideo && !isAudio) throw new Error("Invalid Media");

        reply("🔄 *Reversing... (Wait)*");
        input = await conn.downloadAndSaveMediaMessage(quoted);
        output = getRandom(isVideo ? ".mp4" : ".mp3");

        // FFmpeg Reverse Logic
        const args = isVideo 
            ? ['-i', input, '-vf', 'reverse', '-af', 'areverse', '-preset', 'ultrafast', output]
            : ['-i', input, '-af', 'areverse', output];

        await runFfmpeg(args);
        await sendSmartMedia(conn, from, path.resolve(output), isVideo ? 'video' : 'audio', mek, "✅ *Reversed Media*");

    } catch (e) {
        reply("❌ Error reversing.");
    } finally {
        if (input && fs.existsSync(input)) fs.unlinkSync(input);
        if (output && fs.existsSync(output)) fs.unlinkSync(output);
        locks.delete(lk);
    }
});

// ===========================================
// 4. VOICE CHANGER (Squirrel Pitch)
// ===========================================
cmd({
    pattern: "pitch",
    desc: "Voice Changer (High Pitch)",
    category: "editor",
    filename: __filename
}, async (conn, mek, m, { from, quoted, reply }) => {
    const lk = lockKey(mek);
    if (locks.has(lk)) return reply("⏳ Processing...");
    locks.add(lk);
    let input, output;

    try {
        if (!quoted?.msg?.mimetype?.includes("audio")) return reply("❌ Reply to Audio.");

        reply("🐿️ *Changing Pitch...*");
        input = await conn.downloadAndSaveMediaMessage(quoted);
        output = getRandom(".mp3");

        // Pitch Effect (asetrate + atempo to fix duration)
        await runFfmpeg(['-i', input, '-af', 'asetrate=44100*1.5,atempo=1/1.5', output]);

        await sendSmartMedia(conn, from, path.resolve(output), 'audio', mek);

    } catch (e) {
        reply("❌ Error processing.");
    } finally {
        if (input && fs.existsSync(input)) fs.unlinkSync(input);
        if (output && fs.existsSync(output)) fs.unlinkSync(output);
        locks.delete(lk);
    }
});