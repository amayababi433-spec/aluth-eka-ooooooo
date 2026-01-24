const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// 1. Server Keep Alive
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🛡️ DMC BOT - ALIVE & LOCKED');
});
server.listen(port, () => console.log(`🌐 Server Running: ${port}`));

// 2. Global Variables
let consecutive440s = 0;

// 🔥 VOICE LOCK (මතක තියාගන්නවා)
if (!global.voiceMemory) {
    global.voiceMemory = [];
    console.log("💾 Voice Memory: LOCKED & SAFE.");
}

async function startBot() {
    console.log(`🔒 FORCE MODE ACTIVE | Error Count: ${consecutive440s}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            // 🔥 FIREFOX MODE (Session ආරක්ෂාවට)
            browser: ['Ubuntu', 'Firefox', '120.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true, // දැන් Online පෙන්නනවා (Ghost නෙවෙයි)
            keepAliveIntervalMs: 60000,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 5000,
            generateHighQualityLinkPreview: true,
            emitOwnEvents: false,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const code = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                console.log(`⚠️ Connection Closed: ${code}`);

                if (code === 440 || code === 428) {
                    consecutive440s++;
                    const jitter = Math.floor(Math.random() * 5000);
                    const delayMs = (consecutive440s <= 5 ? 10000 : 30000) + jitter;

                    console.log(`🔥 440 DETECTED (#${consecutive440s}) | RECONNECTING IN ${delayMs / 1000}s...`);
                    await delay(delayMs);
                } else {
                    // සාමාන්ය Disconnect එකක් නම් ඉක්මනට එනවා
                    console.log("🔄 Quick Reconnect...");
                    await delay(3000);
                }
                startBot();

            } else if (connection === 'open') {
                consecutive440s = 0; // Error ගාණ බිංදුව කරනවා
                console.log("✅ BOT CONNECTED & ACTIVE! 🎤");

                // 🔥 මෙන්න GHOST FIX එක: බොට් ආපු ගමන් මැසේජ් එකක් දානවා
                const ownerNumber = "94717884174@s.whatsapp.net"; // උඹේ නම්බර් එක
                try {
                    await sock.sendMessage(ownerNumber, {
                        text: "👑 *DMC BOT IS ONLINE!* 👑\n\n✅ Session: LOCKED\n✅ Voice: LOADED\n✅ Mode: FIREFOX FORCE\n\n*Commands are ready!*"
                    });
                } catch (e) {
                    console.log("⚠️ Failed to send startup message (Network Issue)");
                }
            }
        });

        // 🔥 COMMAND HANDLER (මොලේ)
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                if (mek.key.fromMe) return; // තමන්ටම රිප්ලයි කරන්නේ නෑ

                // Commands වැඩද බලන්න අපි Log එකක් දාමු
                console.log(`📩 Message Received from: ${mek.key.remoteJid}`);

                const main = require('./main');
                await main(sock, mek, null);

            } catch (err) {
                console.log("❌ COMMAND ERROR:", err.message); // එරර් එකක් ආවොත් පෙන්නනවා
            }
        });

    } catch (error) {
        console.log("💥 Critical Error:", error.message);
        await delay(10000);
        startBot();
    }
}

// Crash වෙන්න දෙන්නේ නෑ
process.on('uncaughtException', (err) => {
    console.log('🛡️ Crash Blocked:', err.message);
});

startBot();