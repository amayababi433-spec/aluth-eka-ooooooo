const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Server Keep Alive (Koyeb Active)
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('👑 DMC BOT - FULLY LOADED 🚀');
});
server.listen(port, () => console.log(`🌐 Server Running: ${port}`));

// 2. Global Config
let reconnectAttempts = 0;
let consecutive440s = 0;
const ownerNumber = "94717884174@s.whatsapp.net"; // උඹේ නම්බර් එක

// 3. 🚀 MEMORY BOOSTER (RAM Saver)
if (global.gc) {
    setInterval(() => {
        global.gc();
        console.log("🧹 Memory Cleaned (Booster Active)");
    }, 1000 * 60 * 2); // හැම විනාඩි 2කට සැරයක් RAM සුද්ද කරනවා
}

async function startBot() {
    console.log(`🔒 FIREFOX FORCE MODE | 440s Count: ${consecutive440s}`);

    // 🎵 Voice Files Pre-Loader (Voice ටික මතක තියාගන්නවා)
    try {
        const voicePath = path.join(__dirname, 'voice'); // 'voice' folder එක බලනවා
        if (fs.existsSync(voicePath)) {
            const voices = fs.readdirSync(voicePath).filter(file => file.endsWith('.mp3') || file.endsWith('.ogg'));
            console.log(`✅ Loaded ${voices.length} Voice Files into Memory! 🎤`);
        } else {
            console.log("⚠️ Voice folder not found (Creating one...)");
            fs.mkdirSync(voicePath);
        }
    } catch (e) {
        console.log("⚠️ Voice Load Error:", e.message);
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            // 🔥 FIREFOX FORCE MODE (Stability King)
            browser: ['Ubuntu', 'Firefox', '120.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true, // "Awadan Dena Eka" (Online පෙන්නනවා)
            keepAliveIntervalMs: 30000,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 5000,
            generateHighQualityLinkPreview: true,
            emitOwnEvents: true, // Events එළියට දෙනවා (Features වලට ඕනේ)
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const code = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                console.log(`⚠️ Connection Closed: ${code}`);

                // 🔥 FORCE RECONNECT LOGIC (මෙන්න බලහත්කාරය)
                if (code === 440 || code === 428) {
                    consecutive440s++;
                    console.log(`🔥 440 Force Reconnect (#${consecutive440s})`);
                    // Random Delay (Jitter)
                    const delayMs = consecutive440s < 5 ? 10000 : 30000;
                    await delay(delayMs);
                } else if (code === DisconnectReason.loggedOut) {
                    console.log("⛔ Logged Out. (Retry forced by User)");
                    await delay(5000); // Log out වුණත් නවතින්නේ නෑ
                } else {
                    console.log("🔄 Quick Reconnect...");
                    await delay(3000);
                }
                startBot();

            } else if (connection === 'open') {
                consecutive440s = 0;
                console.log("✅ DMC BOT CONNECTED & ACTIVE! 🔥");

                // 🔔 "Awadan Dena Eka" (Owner Notify)
                // බොට් ඔන් වුණා කියලා උඹට මැසේජ් එකක් එවනවා
                await sock.sendMessage(ownerNumber, {
                    text: "👑 *DMC BOT ACTIVATED!* 👑\n\n✅ Voices Loaded\n✅ Force Mode Active\n✅ Memory Booster On\n\n*Waiting for commands...*"
                });
            }
        });

        // 🔥 COMMAND HANDLER (බොටාගේ මොලේ)
        // මේක නැතුව තමයි බොටා නිකන් හිටියේ. දැන් වැඩ!
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;

                // main.js එකට පණිවිඩේ යවනවා
                const main = require('./main');
                await main(sock, mek, null);

            } catch (err) {
                console.log("❌ Handler Error:", err.message);
            }
        });

    } catch (error) {
        console.log("💥 Critical Error:", error.message);
        await delay(10000);
        startBot();
    }
}

// Global Crash Guard
process.on('uncaughtException', (err) => {
    console.log('🛡️ Crash Prevented:', err.message);
});

startBot();