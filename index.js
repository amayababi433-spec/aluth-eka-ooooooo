const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🛡️ DMC BOT - DESKTOP CLOUD MODE');
});
server.listen(port = process.env.PORT || 8000);

async function startBot() {
    console.log("🚀 Starting DMC BOT (Anti-Burn Edition)...");

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        // 🔥 රහස: Ubuntu Desktop එකක් විදිහට පෙනී සිටීම (මේක පිච්චෙන්නේ නෑ)
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 15000, // හැම තත්පර 15කට සැරයක් Connection Check කරනවා
        retryRequestDelayMs: 5000,
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection Closed: ${code}`);

            // 440 ආවත් අපි Reconnect වෙන්න ට්රයි කරනවා (හැබැයි අලුත් Session එකක් ඕනේ)
            if (code === DisconnectReason.loggedOut) {
                console.log("⛔ Logged Out. Please Rescan QR.");
            } else {
                console.log("🔄 Reconnecting...");
                await delay(3000);
                startBot();
            }
        } else if (connection === 'open') {
            console.log("✅ CONNECTED STABLE! (Desktop Mode Active)");
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (!chatUpdate.messages[0].message) return;
            require('./main')(sock, chatUpdate.messages[0]);
        } catch (e) { }
    });
}

startBot();
