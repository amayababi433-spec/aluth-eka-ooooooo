const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 🔥 GLOBAL QUEUE SYSTEM
const PROCESS_QUEUE = [];
let IS_PROCESSING = false;

// Path to yt-dlp
// Linux (Koyeb) සඳහා කෙලින්ම 'yt-dlp' භාවිතා කරන්න
const YTDLP_PATH = path.join(process.cwd(), 'bin', 'yt-dlp');
const COOKIES_PATH = path.join(process.cwd(), 'cookies.txt');

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
    const task = PROCESS_QUEUE.shift();

    try {
        console.log(`▶️ Processing: ${task.url}`);

        // 1. Check & Fix Permissions (Koyeb Fix)
        if (fs.existsSync(YTDLP_PATH)) {
            try {
                fs.chmodSync(YTDLP_PATH, '755'); // Execute Permission දෙනවා
            } catch (e) {
                console.log("⚠️ Permission Fix Failed (Might be okay):", e.message);
            }
        }

        const tempName = `DMC_Song_${Date.now()}.mp3`;
        const tempPath = path.join(process.cwd(), tempName);

        // 🔥 BLOCK BYPASS ARGUMENTS
        const args = [
            task.url,
            '-o', tempPath,
            '-f', 'bestaudio',
            '--no-playlist',
            '--force-ipv6',
            '--no-check-certificates', // Certificate Errors මඟහරින්න
            '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', // Mobile වගේ පෙන්නනවා
            '--no-warnings'
        ];

        // Cookies තිබුණොත් විතරක් ගන්න, නැත්නම් නිකන් යන්න
        if (fs.existsSync(COOKIES_PATH)) {
            const cookieStats = fs.statSync(COOKIES_PATH);
            if (cookieStats.size > 0) {
                args.push('--cookies', COOKIES_PATH);
            }
        }

        // Run yt-dlp with Error Logging
        await new Promise((resolve, reject) => {
            const process = spawn(YTDLP_PATH, args);

            // එරර් එක මොකක්ද කියලා බලන්න
            process.stderr.on('data', (data) => {
                console.error(`🔴 YT-DLP LOG: ${data.toString()}`);
            });

            process.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Exit Code: ${code}`));
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

            // 3. Auto Delete
            fs.unlinkSync(tempPath);
            console.log("🗑️ File Deleted from Server.");
        }

    } catch (e) {
        console.log("❌ Task Failed:", e.message);

        // විශේෂ උපදෙස් User ට යවනවා
        if (e.message.includes("Code: 1")) {
            if (task.reply) task.reply("❌ **Server Blocked!**\nYouTube එකෙන් Koyeb IP එක Block කරලා වගේ.\n\n💡 *Try Option 2 (Drive Mode)* - ඒක අනිවාර්යයෙන් වැඩ!");
        } else {
            if (task.reply) task.reply("❌ Download Error. Try again.");
        }

    } finally {
        processQueue(sock);
    }
}

module.exports = { addToQueue };
