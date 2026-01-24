const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Server Keep Alive
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🛡️ DMC SESSION RECOVERY MODE');
});
server.listen(process.env.PORT || 8000);

async function cleanSessionJunk() {
    const sessionDir = './auth_info_baileys';
    try {
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            let deleted = 0;
            // creds.json ඇරෙන්න අනිත් ඔක්කොම මකනවා
            for (const file of files) {
                if (file !== 'creds.json') {
                    fs.unlinkSync(path.join(sessionDir, file));
                    deleted++;
                }
            }
            console.log(`🧹 Cleaned ${deleted} junk files. Keeping ONLY creds.json`);
        }
    } catch (e) {
        console.log("⚠️ Cleanup Error:", e.message);
    }
}

async function startBot() {
    console.log("🚑 ATTEMPTING SESSION RECOVERY (NO QR MODE)...");

    // 1. කුණු සුද්ද කිරීම (Junk Cleanup)
    await cleanSessionJunk();

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // QR එපා
        auth: state,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 5000,
        // Session පිච්චෙන එක නවත්තන්න Update Block කරනවා
        emitOwnEvents: false,
    });

    // ⚠️ Save කරද්දි පරිස්සමෙන්
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection Closed: ${code}`);

            if (code === 440 || code === 401) {
                console.log("❌ SESSION IS DEAD (Expired).");
                console.log("💡 මෙය ගොඩ දාන්න බැහැ. අනිවාර්යයෙන්ම අලුත් QR එකක් ඕනේ.");
                // Loop එක නැවැත්වීමට අපි මෙතනින් නවතින්න ඕනේ, 
                // ඒත් උඹට Try කරන්න ඕන නිසා අපි ආයේ Reconnect වෙමු.
            }

            await delay(5000);
            startBot();
        } else if (connection === 'open') {
            console.log("✅ MIRACLE! BOT CONNECTED WITH OLD SESSION! 🎉");
            console.log("🔒 Session Locked for Safety.");
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (!chatUpdate.messages[0].message) return;
            require('./main')(sock, chatUpdate.messages[0]);
        } catch { }
    });
}

startBot();
