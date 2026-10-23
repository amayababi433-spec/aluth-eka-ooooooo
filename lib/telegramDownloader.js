const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '35476885', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '402b644a07b71ac8b3493a7cd7515c1b';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8870659304:AAE7CJ4B02IoMHiDBxfvVOkmPmy1JNu7aw8';

let clientInstance = null;
let isConnecting = false;

// Temp folder for downloaded media
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    try { fs.mkdirSync(TEMP_DIR, { recursive: true }); } catch (_) {}
}

/**
 * Get or initialize persistent GramJS Telegram client
 */
async function getTelegramClient() {
    if (clientInstance && clientInstance.connected) {
        return clientInstance;
    }
    if (isConnecting) {
        // Wait for connection in progress
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (clientInstance && clientInstance.connected) return clientInstance;
        }
    }

    try {
        isConnecting = true;
        const SESSION_FILE = path.join(__dirname, '../telegram_session.txt');
        let savedSessionStr = process.env.TELEGRAM_SESSION_STRING || '';
        if (!savedSessionStr && fs.existsSync(SESSION_FILE)) {
            try { savedSessionStr = fs.readFileSync(SESSION_FILE, 'utf8').trim(); } catch (_) {}
        }

        const stringSession = new StringSession(savedSessionStr);
        clientInstance = new TelegramClient(stringSession, API_ID, API_HASH, {
            connectionRetries: 5,
            useWSS: false
        });

        await clientInstance.start({
            botAuthToken: BOT_TOKEN
        });

        try {
            const saved = clientInstance.session.save();
            if (saved) fs.writeFileSync(SESSION_FILE, saved);
        } catch (_) {}

        console.log('✈️ [GramJS MTProto] Connected to Telegram API successfully (2GB limit unlocked)!');
        isConnecting = false;
        return clientInstance;
    } catch (err) {
        isConnecting = false;
        console.error('❌ [GramJS MTProto] Connection error:', err.message);
        throw err;
    }
}

/**
 * Download Telegram media file by Chat ID and Message ID (Supports files up to 2 GB)
 * @param {string|number} chatId - Telegram chat ID (e.g. -1004382943539)
 * @param {number} messageId - Message ID in chat (e.g. 5)
 * @param {string} customFilename - Output filename
 * @param {Function} onProgress - Progress callback (percent, downloadedBytes, totalBytes)
 * @returns {Promise<string>} - Absolute path to downloaded file
 */
async function downloadTelegramVideo(chatId, messageId, customFilename, onProgress) {
    const client = await getTelegramClient();
    const cleanChatId = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
    const msgId = parseInt(messageId, 10);

    const msgs = await client.getMessages(cleanChatId, { ids: [msgId] });
    const msg = msgs && msgs[0];

    if (!msg || !msg.media) {
        throw new Error(`No media found in chat ${chatId} at message ${messageId}`);
    }

    const safeName = (customFilename || 'VIP_Video').replace(/[^\w\s.-]/g, '_');
    const ext = path.extname(safeName) || '.mp4';
    const base = path.basename(safeName, ext);
    const uniqueFile = `${base}_${Date.now()}${ext}`;
    const outputPath = path.join(TEMP_DIR, uniqueFile);

    console.log(`✈️ [GramJS MTProto] Downloading large media (${uniqueFile})...`);

    await client.downloadMedia(msg.media, {
        outputFile: outputPath,
        workers: 4,
        progressCallback: (downloaded, total) => {
            const p = total ? Math.round((Number(downloaded) / Number(total)) * 100) : 0;
            if (typeof onProgress === 'function') {
                onProgress(p, Number(downloaded), Number(total));
            }
        }
    });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw new Error('Downloaded file is empty or missing');
    }

    const downloadedSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`✅ [GramJS MTProto] Download complete: ${outputPath} (${downloadedSizeMB} MB)`);
    return outputPath;
}

module.exports = {
    getTelegramClient,
    downloadTelegramVideo,
    API_ID,
    API_HASH,
    BOT_TOKEN
};
