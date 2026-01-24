const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, delay, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// 1. Server Keep Alive
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🛡️ DMC BOT - RAM ONLY MODE');
});
server.listen(process.env.PORT || 8000);

async function startBot() {
    console.log("🚀 STARTING BOT IN 'READ-ONLY' MODE...");

    // 1. ෆයිල් ටික ලෝඩ් කරනවා (Load Auth)
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        logger: logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            // 🔥 විශේෂ තාක්ෂණය: Keys ටික RAM එකට ගන්නවා (Disk එකට ලියන්නේ නෑ)
            // මේකෙන් Bad MAC එරර් එක ෆයිල් එකට වදින්නේ නෑ.
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: ["Ubuntu", "Linux", "20.0.04"], // Linux Server Standard
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 2000,
        generateHighQualityLinkPreview: true,
        emitOwnEvents: false,
        defaultQueryTimeoutMs: undefined,
    });

    // 🛑 STOP SAVING CORRUPTED KEYS
    // සාමාන්‍යයෙන් මෙතන saveCreds දානවා. ඒත් අපි දාන්නේ නෑ.
    // අපි 'creds' (Main ID) එක විතරක් අප්ඩේට් කරනවා. Keys අප්ඩේට් කරන්නේ නෑ.
    sock.ev.on('creds.update', (update) => {
        // උඹේ නම, නම්බර් එක වගේ දේවල් විතරක් සේව් කරනවා
        if (update.me || update.account || update.myAppStateKeyId) {
            saveCreds(update);
        }
        // Keys (Pre-Key, Session) සේව් කරන්නේ නෑ. ඒවා RAM එකේ විතරයි.
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const code = lastDisconnect?.error?.output?.statusCode;

        if (connection === 'close') {
            console.log(`⚠️ Connection Closed: ${code}`);
            
            // මොන එරර් එක ආවත් අපි රිස්ටාර්ට් කරනවා.
            // රිස්ටාර්ට් වෙද්දි ආයේ මුල ඉඳන් "පිරිසිදු ෆයිල්" ලෝඩ් වෙනවා.
            console.log("🔄 Reloading fresh files from disk...");
            await delay(3000);
            startBot();

        } else if (connection === 'open') {
            console.log("✅ BOT CONNECTED (RAM MODE) 🚀");
            console.log("🛡️ Disk Writing: DISABLED for Keys");
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const main = require('./main');
            await main(sock, mek, null);
        } catch (err) {
            // Error handling
        }
    });
}

// Crash Block
process.on('uncaughtException', (err) => {
    // console.log('Crash Prevented');
});

startBot();