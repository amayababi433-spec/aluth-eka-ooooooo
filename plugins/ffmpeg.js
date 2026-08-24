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

// Security: Block Dangerous Inputs (Injection Attacks)
function isSafeFilter(q) {
    return !/[;&|`$<>]/.test(q);
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

    // 16MB ට වැඩි නම් Document විදිහට යවනවා (Legal Method)
    if (fileSizeMB > 16) {
        await conn.sendMessage(from, { 
            document: { url: filePath }, 
            mimetype: type === 'video' ? 'video/mp4' : (type === 'audio' ? 'audio/mpeg' : 'image/jpeg'),
            fileName: `FFmpeg_Edit${type === 'video' ? '.mp4' : (type === 'audio' ? '.mp3' : '.jpg')}`,
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
        } else if (type === 'image') {
            msgParams.image = { url: filePath };
        }
        await conn.sendMessage(from, msgParams, { quoted: mek });
    }
}

// ===========================================
// MAIN COMMAND: FFMPEG (FAST & SAFE)
// ===========================================
cmd({
    pattern: "ffmpeg",
    desc: "Apply custom FFmpeg filters",
    category: "editor",
    filename: __filename
}, async (conn, mek, m, { from, q, quoted, reply }) => {
    const lk = lockKey(mek);
    
    // 1. Safety Checks
    if (!quoted) return reply("❌ Please reply to a Video, Audio, or Photo.");
    if (!q) return reply("❌ Please give a filter code.\nExample: `.ffmpeg hue=s=0`");
    if (!isSafeFilter(q)) return reply("❌ Unsafe characters detected!");
    
    // 2. Throttling
    if (locks.has(lk)) return reply("⏳ Processing previous request...");
    if (onCooldown(lk)) return reply("⏳ Slow down...");
    
    locks.add(lk);
    let input, output;

    try {
        const mime = quoted.msg.mimetype || "";
        const isVideo = mime.includes("video");
        const isImage = mime.includes("image");
        const isAudio = mime.includes("audio");

        if (!isVideo && !isImage && !isAudio) throw new Error("Unsupported media");

        reply(`🛠️ *Applying Filter:*\n\`${q}\``);
        input = await conn.downloadAndSaveMediaMessage(quoted);

        // 3. Process Logic
        if (isVideo) {
            output = getRandom(".mp4");
            // -c:a copy (Audio වෙනස් කරන්නේ නෑ - Speed වැඩි වෙන්න)
            await runFfmpeg(['-i', input, '-vf', q, '-c:a', 'copy', '-preset', 'ultrafast', output]);
            await sendSmartMedia(conn, from, path.resolve(output), 'video', mek, "✅ *Done!*");
        
        } else if (isImage) {
            output = getRandom(".jpg");
            await runFfmpeg(['-i', input, '-vf', q, output]);
            await sendSmartMedia(conn, from, path.resolve(output), 'image', mek, "✅ *Done!*");
        
        } else if (isAudio) {
            output = getRandom(".mp3");
            await runFfmpeg(['-i', input, '-af', q, output]);
            await sendSmartMedia(conn, from, path.resolve(output), 'audio', mek, "✅ *Done!*");
        }

    } catch (e) {
        reply(`❌ FFmpeg Error.`);
        console.log(e);
    } finally {
        // 4. Cleanup
        if (input && fs.existsSync(input)) fs.unlinkSync(input);
        if (output && fs.existsSync(output)) fs.unlinkSync(output);
        locks.delete(lk);
    }
});