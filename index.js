const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');
const NodeCache = require('node-cache'); // 🔥 අලුත් කෑල්ල (Install කරන්න ඕනේ නෑ, Baileys එක්ක එනවා)

// 1. Server Keep Alive
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🛡️ DMC BOT - BAD MAC FIXER');
});
server.listen(process.env.PORT || 8000);

// 🔥 RETRY CACHE (මේකෙන් තමයි Bad MAC එක ලිහන්නේ)
const msgRetryCounterCache = new NodeCache();

// Global Variables
let consecutive440s = 0;

async function startBot() {
    console.log(`🔒 HEALER MODE ACTIVE | Fix Attempt: ${consecutive440s}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            // 🔥 FIREFOX MODE
            browser: ['Ubuntu', 'Firefox', '120.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true,
            keepAliveIntervalMs: 60000,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 2000, // ඉක්මනට Retry කරනවා
            generateHighQualityLinkPreview: true,
            emitOwnEvents: false,
            // 🔥 BAD MAC FIXING SETTINGS 👇
            msgRetryCounterCache, // මැසේජ් කියවගන්න බැරි වුණාම ආයේ ඉල්ලනවා
            getMessage: async (key) => {
                return { conversation: 'hello' }; // Fake Message එකක් යවනවා (Session බේරගන්න)
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const code = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                // 440 ආවත් අපි බය නෑ, Cache එකෙන් ගොඩ දානවා
                if (code === 440 || code === 428) {
                    consecutive440s++;
                    console.log(`🔥 440 DETECTED (#${consecutive440s}) | HEALING SESSION...`);
                    await delay(5000); // 5 Seconds
                } else {
                    console.log("🔄 Reconnecting...");
                    await delay(3000);
                }
                startBot();

            } else if (connection === 'open') {
                consecutive440s = 0;
                console.log("✅ BOT CONNECTED! (Trying to decode messages...)");

                // Alive Message
                const ownerNumber = "94717884174@s.whatsapp.net";
                try {
                    await sock.sendMessage(ownerNumber, { text: "👑 *DMC Healer Active!* \nSend a command to test." });
                } catch (e) { }
            }
        });

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                if (mek.key.fromMe) return;

                // Bad MAC ආවත් අපි බලෙන් කරවන්න ට්රයි කරනවා
                const main = require('./main');
                await main(sock, mek, null);

            } catch (err) {
                // Bad MAC එරර් එක ආවොත් අපි ලොග් එකේ පෙන්නන්නේ නෑ (Clean Log)
                if (!err.message.includes('Bad MAC')) {
                    console.log("❌ Command Error:", err.message);
                }
            }
        });

    } catch (error) {
        console.log("💥 Restarting:", error.message);
        await delay(5000);
        startBot();
    }
}

// Bad MAC නිසා Crash වෙන එක නවත්තනවා
process.on('uncaughtException', (err) => {
    // මේකෙන් අපි Error එක ගිලිනවා (Ignore කරනවා)
});

startBot();