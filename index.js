const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');
const qrcode = require('qrcode-terminal'); // 🔥 QR පෙන්නන අලුත් කෑල්ල

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🛡️ DMC BOT - QR GENERATOR MODE');
});
server.listen(process.env.PORT || 8000);

async function startBot() {
    console.log("🚀 Starting DMC BOT (Waiting for QR)...");

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // බොරු QR එපා, අපි ඇත්ත එක යටින් දානවා
        auth: state,
        // 🔥 Desktop Mode (Session පිච්චෙන එක නවත්තන්න)
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        retryRequestDelayMs: 5000,
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 🔥 QR එක ආවොත් කෙලින්ම Print කරන්න (Force Print)
        if (qr) {
            console.log("\n✨ QR CODE RECEIVED! SCAN NOW: 👇\n");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection Closed: ${code}`);

            if (code === DisconnectReason.loggedOut) {
                console.log("⛔ Logged Out. Please Rescan QR.");
            } else {
                console.log("🔄 Reconnecting...");
                await delay(3000);
                startBot();
            }
        } else if (connection === 'open') {
            console.log("\n✅ CONNECTED SUCCESSFULLY! (Session Saved)");
            console.log("🛑 NOW PRESS 'Ctrl + C' TO STOP PC BOT!");
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (!chatUpdate.messages[0].message) return;
            // require('./main')(sock, chatUpdate.messages[0]); // Session හදද්දි මේක ඕන නෑ
        } catch (e) {}
    });
}

startBot();