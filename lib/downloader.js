const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 🔥 GLOBAL QUEUE SYSTEM
const PROCESS_QUEUE = [];
let IS_PROCESSING = false;

// Path to yt-dlp
const YTDLP_PATH = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const COOKIES_PATH = path.join(process.cwd(), 'cookies.txt');

// 🛑 MAIN QUEUE MANAGER
async function addToQueue(data, sock, reply) {
    PROCESS_QUEUE.push(data);
    if (!IS_PROCESSING) {
        processQueue(sock, reply);
    } else {
        await reply(`🔄 *Added to Queue!* (${PROCESS_QUEUE.length} waiting...)`);
    }
}

async function processQueue(sock) {
    if (PROCESS_QUEUE.length === 0) {
        IS_PROCESSING = false;
        return;
    }

    IS_PROCESSING = true;
    const task = PROCESS_QUEUE.shift(); // පෝලිමේ මුල ඉන්න එක්කෙනා ගන්නවා

    try {
        console.log(`▶️ Processing: ${task.url}`);

        // 1. Download
        const tempName = `DMC_Song_${Date.now()}.mp3`;
        const tempPath = path.join(__dirname, '../', tempName); // Root folder එකට දානවා

        const args = [
            task.url,
            '-o', tempPath,
            '-f', 'bestaudio',
            '--no-playlist',
            '--force-ipv6',
            '--no-warnings'
        ];

        if (fs.existsSync(COOKIES_PATH)) args.push('--cookies', COOKIES_PATH);

        // Run yt-dlp
        await new Promise((resolve, reject) => {
            const process = spawn(YTDLP_PATH, args);
            process.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Download Failed Code: ${code}`));
            });
        });

        // 2. Upload to WhatsApp
        if (fs.existsSync(tempPath)) {
            await sock.sendMessage(task.from, {
                audio: fs.readFileSync(tempPath),
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `DMC_Music.mp3`
            }, { quoted: task.mek });

            // 3. 🔥 AUTO DELETE (Space Saver) 🔥
            fs.unlinkSync(tempPath);
            console.log("🗑️ File Deleted from Server.");
        }

    } catch (e) {
        console.log("❌ Task Failed:", e);
        if (task.reply) task.reply("❌ Download Failed! Try Drive Mode.");
    } finally {
        // 4. ඊළඟ වැඩේ පටන් ගන්න (Loop)
        processQueue(sock);
    }
}

module.exports = { addToQueue };
