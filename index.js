const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// Server Keep Alive
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('👑 DMC BOT ACTIVE 👑');
});
server.listen(port, () => console.log(`🌐 Server Running on Port: ${port}`));

async function startBot() {
    console.log("🚀 Starting DMC BOT (Stable Mode)...");

    // Auth Folder Check
    if (!fs.existsSync('./auth_info_baileys')) {
        fs.mkdirSync('./auth_info_baileys');
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.macOS("Desktop"), // Chrome වෙනුවට macOS දාන්න (Stable)
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 2000,
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection Closed: ${reason}`);

            // 440, 428, 401 ආවත් අපි බය නැතුව Reconnect වෙනවා
            console.log("🔄 Reconnecting...");
            await delay(3000);
            startBot();
        } else if (connection === 'open') {
            console.log("✅ BOT CONNECTED SUCCESSFULLY!");
            // Auto Message to Owner
            const ownerNumber = "94717884174@s.whatsapp.net";
            try {
                await sock.sendMessage(ownerNumber, { text: "👑 DMC Bot is Back Online! System Stable." });
            } catch (e) {
                console.log("⚠️ Owner msg failed (minor issue)");
            }
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            // Handle Broadcast/Status
            if (mek.key.remoteJid === 'status@broadcast') return;

            const main = require('./main');
            await main(sock, mek, null);
        } catch (err) {
            console.log("❌ Error:", err.message);
        }
    });

    process.on('uncaughtException', (err) => console.log('🛡️ Crash Prevented:', err.message));
}

startBot();
