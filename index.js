const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, delay, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// 1. Server Keep Alive
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🍪 DMC BOT - COOKIE MODE ACTIVE');
});
server.listen(process.env.PORT || 8000);

async function startBot() {
    console.log("🚀 STARTING BOT WITH 'COOKIE' METHOD...");

    // 1. ෆයිල් එකෙන් "Cookie" එක (creds.json) විතරක් ගන්නවා
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        logger: logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds, // මේක තමයි අපේ "Cookie" එක (Main ID)
            // 🔥 විශේෂ තාක්ෂණය: අනිත් ඔක්කොම යතුරු RAM එකේ හදන්න (Disk එකට ලියන්න එපා)
            // මේක නිසා IP මාරු වුණත්, Bad MAC එරර් එක හාඩ් එකේ සේව් වෙන්නේ නෑ.
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        // Chrome Browser එකක් වගේ පෙනී සිටීම (Cookies වැඩ කරන්න මේක ඕනේ)
        browser: Browsers.macOS("Chrome"),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 2000,
        generateHighQualityLinkPreview: true,
        emitOwnEvents: false,
    });

    // 🛑 COOKIE PROTECTION SYSTEM
    // සාමාන්‍යයෙන් බොට් හැම තත්පරේම ෆයිල් සේව් කරනවා. අපි ඒක නවත්තනවා.
    // අපි සේව් කරන්නේ "creds" (Cookie) එක අප්ඩේට් වුණොත් විතරයි.
    sock.ev.on('creds.update', (update) => {
        // ඉතාම අත්‍යවශ්‍ය දේකට විතරක් සේව් කරනවා (Login refresh වගේ)
        if (update.me || update.account || update.myAppStateKeyId) {
            saveCreds(update);
        }
        // අනිත් වෙලාවට Keys සේව් කරන්නේ නෑ. (Bad MAC එන්නේ Keys වලින්)
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const code = lastDisconnect?.error?.output?.statusCode;

        if (connection === 'close') {
            console.log(`⚠️ Connection Closed: ${code}`);

            // මොනවා වුණත් අපි ආයේ මුල ඉඳන් "Cookie" එක ලෝඩ් කරනවා
            // එතකොට පරණ ලෙඩ මැකිලා යනවා
            console.log("🔄 Reloading Cookie (creds.json)...");
            await delay(3000);
            startBot();

        } else if (connection === 'open') {
            console.log("✅ BOT CONNECTED (COOKIE MODE) 🍪");
            console.log("🛡️ Corrupted Keys will NOT be saved to disk.");

            // Test
            try {
                const ownerNumber = "94717884174@s.whatsapp.net";
                await sock.sendMessage(ownerNumber, { text: "👑 *DMC BOT* \nCookie Method: ACTIVE 🍪" });
            } catch (e) { }
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