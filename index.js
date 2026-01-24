const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// Server Keep Alive
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('👑 DMC BOT - PERMANENT SESSION MODE 👑');
});
server.listen(port, () => console.log(`🌐 Server Running: ${port}`));

async function startBot() {
    console.log("🚀 Starting DMC BOT (Permanent Session Mode)...");

    // GitHub එකෙන් ආපු Original Session එක පාවිච්චි කරනවා
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // ලොග් ගොඩක් එන එක නවත්තනවා
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.macOS("Desktop"),
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 5000,
        // 🔥 Anti-Ban / Anti-Disconnect Settings
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: undefined,
    });

    // ⚠️ වැදගත්: Session Update වෙන්න දෙන්නේ නෑ (Read-Only)
    // අපි creds.update එක අයින් කරනවා හෝ ලිමිට් කරනවා.
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection Closed: ${reason}`);

            // 440 හෝ Bad MAC ආවත්, අපි Original Session එකෙන් ආයේ එනවා
            console.log("🔄 Reconnecting with ORIGINAL Session...");
            await delay(5000);
            startBot();
        } else if (connection === 'open') {
            console.log("✅ BOT CONNECTED (Permanent Session Secured)!");

            // නම්බර් එකට මැසේජ් එකක් දාමු
            await sock.sendMessage("94717884174@s.whatsapp.net", { text: "👑 DMC Bot Online! Session Secured." });
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

    // Anti-Crash
    process.on('uncaughtException', (err) => console.log('🛡️ Crash Prevented:', err.message));
}

startBot();
