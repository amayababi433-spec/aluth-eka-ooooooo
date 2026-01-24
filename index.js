const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// Server Keep Alive
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('✅ DMC BOT ONLINE');
});
server.listen(port, () => console.log(`🌐 Server Running on Port: ${port}`));

async function startBot() {
    console.log("🚀 Starting DMC BOT (Desktop Mode)...");

    // 1. Session Handling
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        // 🔥 MOBILE FIX: Chrome/Desktop විදිහට බොරුවට පෙන්වනවා
        browser: ["DMC Bot", "Chrome", "1.0.0"],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 2000,
        generateHighQualityLinkPreview: true,
        // ❌ mobile: true කෑල්ල මෙතන නෑ (ඒකයි Error එකට හේතුව)
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection Closed: ${reason}`);

            // 440 හෝ වෙනත් ඕනෑම Error එකකදි Reconnect වෙනවා
            console.log("🔄 Reconnecting...");
            await delay(5000);
            startBot();
        } else if (connection === 'open') {
            console.log("✅ BOT CONNECTED SUCCESSFULLY!");
            console.log("🚀 No Mobile API Errors!");
        }
    });

    // Messages Handler
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const main = require('./main');
            await main(sock, mek, null);
        } catch (err) {
            console.log("❌ Error:", err.message);
        }
    });

    // Crash Handler
    process.on('uncaughtException', (err) => {
        console.log('🛡️ Crash Prevented:', err.message);
    });
}

startBot();
