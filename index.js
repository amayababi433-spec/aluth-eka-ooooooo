const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// Server Keep Alive (Koyeb Active තියන්න)
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🔒 DMC BOT - SESSION LOCKED MODE 🔒');
});
server.listen(port, () => console.log(`🌐 Server Running on Port: ${port}`));

async function startBot() {
    console.log("🔒 Starting Bot with EXISTING Session (Locked Mode)...");

    // 1. GitHub එකේ තියෙන ෆයිල් ටික ලෝඩ් කරගන්නවා
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // ලොග් ඕන නෑ
        printQRInTerminal: false, // QR එපා කිව්වනේ, ඒක ඕෆ් කළා
        auth: state, // තියෙන Session එකම පාවිච්චි කරනවා
        browser: Browsers.macOS("Desktop"),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 2000,
        generateHighQualityLinkPreview: true,
        // Session පිච්චෙන එක නවත්තන ආරක්ෂක කෑලි
        emitOwnEvents: true,
        markOnlineOnConnect: true,
    });

    // Creds Update වුණත් අපි ඒක පරිස්සමෙන් Save කරනවා (නැත්නම් Ignore කරනවා)
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection Closed Code: ${reason}`);

            // 🔥 මොන එරර් එක ආවත් (401, 440, 500) ෆයිල් මකන්නේ නෑ!
            // කෙලින්ම Reconnect වෙනවා විතරයි.
            console.log("🔒 Session Protected. Force Reconnecting...");

            await delay(3000); // තත්පර 3කින් ආයේ ට්රයි කරනවා
            startBot(); // මුල ඉඳන් ආයේ Existing File එකෙන්ම එනවා

        } else if (connection === 'open') {
            console.log("✅ BOT CONNECTED WITH GITHUB SESSION!");
            console.log("🔒 Session is SECURE.");
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

    // Crash වුණොත් නවතින්න එපා, ආයේ නැගිටපන්
    process.on('uncaughtException', (err) => {
        console.log('🛡️ Blocked Crash:', err.message);
        startBot();
    });
}

startBot();
