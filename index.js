const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🛡️ DMC BOT - SESSION SECURED');
});
server.listen(process.env.PORT || 8000);

async function startBot() {
    console.log("🚀 Starting DMC BOT (Anti-Burn Mode)...");

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        // 🔥 රහස 1: හැමවෙලාවෙම Desktop එකක් වගේ ඉන්න (Mobile දැම්මොත් පිච්චෙනවා)
        browser: Browsers.macOS("Desktop"),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        // 🔥 රහස 2: Session එක Update වෙද්දි එන දෝෂ මඟහරින්න
        retryRequestDelayMs: 5000,
        generateHighQualityLinkPreview: true,
    });

    // Creds Save වෙන එක අපි හසුරුවනවා
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection Closed: ${code}`);

            // 401 (Log Out) වුණොත් විතරක් නවතින්න, අනිත් හැමදේටම Reconnect වෙන්න
            if (code === DisconnectReason.loggedOut) {
                console.log("⛔ Session Expired (Logged Out). New QR needed.");
            } else {
                console.log("🔄 Reconnecting (Session Safe)...");
                await delay(3000);
                startBot();
            }
        } else if (connection === 'open') {
            console.log("✅ SESSION SECURED! (Anti-Burn Active)");
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (!chatUpdate.messages[0].message) return;
            require('./main')(sock, chatUpdate.messages[0]);
        } catch (e) { console.log(e) }
    });
}

startBot();
