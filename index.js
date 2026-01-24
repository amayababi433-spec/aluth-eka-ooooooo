const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Server Keep Alive
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🚑 DMC BOT - SURGERY MODE');
});
server.listen(process.env.PORT || 8000);

// Global Variables
let isRepairing = false;

// 🔥 SURGICAL CLEANER (යතුරු සුද්ද කිරීම)
async function surgicalClean() {
    const authPath = './auth_info_baileys';
    if (!fs.existsSync(authPath)) return;

    console.log("🩺 STARTING SURGERY: Cleaning corrupted key files...");
    const files = fs.readdirSync(authPath);

    let deletedCount = 0;
    for (const file of files) {
        // creds.json අත තියන්නේ නෑ (පණ වගේ රැකගන්නවා)
        if (file !== 'creds.json') {
            fs.unlinkSync(path.join(authPath, file));
            deletedCount++;
        }
    }
    console.log(`✅ SURGERY COMPLETE: Removed ${deletedCount} corrupted files.`);
    console.log("🧬 Only 'creds.json' remains. Forcing Key Regeneration...");
}

async function startBot() {
    console.log("🚀 STARTING BOT (REPAIR EDITION)...");

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            // 🔥 STABILITY MODE
            browser: ['Ubuntu', 'Firefox', '120.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true,
            keepAliveIntervalMs: 60000,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 2000,
            generateHighQualityLinkPreview: true,
            emitOwnEvents: false,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const code = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                // Bad MAC හෝ 440 ආවොත් Surgery එක පටන් ගන්නවා
                if ((code === 440 || code === 428) && !isRepairing) {
                    console.log(`🔥 ERROR DETECTED (${code}). INITIATING SURGERY...`);
                    isRepairing = true;

                    // 1. බොට්ව පොඩ්ඩක් නිදි කරවනවා
                    await delay(2000);
                    // 2. කුණු ෆයිල් මකනවා
                    await surgicalClean();
                    // 3. ආයේ Start කරනවා
                    isRepairing = false;
                    startBot();
                    return;
                }

                console.log(`⚠️ Connection Closed: ${code}. Reconnecting...`);
                await delay(3000);
                startBot();

            } else if (connection === 'open') {
                console.log("✅ OPERATION SUCCESSFUL! BOT CONNECTED. 🧬");

                // Test Message
                try {
                    const ownerNumber = "94717884174@s.whatsapp.net";
                    await sock.sendMessage(ownerNumber, { text: "👑 *DMC REPAIR COMPLETE!* \nNew Keys Generated." });
                } catch (e) { }
            }
        });

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                // Commands run logic
                const main = require('./main');
                await main(sock, mek, null);
            } catch (err) {
                // Bad MAC Error ආවොත් ගණන් ගන්න එපා, Surgery එකෙන් ඒක හදනවා
            }
        });
    } catch (error) {
        console.log("💥 Critical Error:", error.message);
        await delay(5000);
        startBot();
    }
}

// Handle Crashes
process.on('uncaughtException', (err) => {
    // Bad MAC errors silent කරනවා
});

startBot();