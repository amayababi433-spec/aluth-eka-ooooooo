const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');

// Server
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🔒 DMC BOT - FINAL 440 FIX 🔒');
});
server.listen(port, () => console.log(`🌐 Server: ${port}`));

// 🛡️ ULTIMATE 440 PROTECTION
let consecutive440s = 0;
let total440s = 0;
let isInCooldown = false;

async function startBot() {
    console.log("🔒 FINAL 440 FIX MODE");

    // 10x 440 cooldown (ULTIMATE PROTECTION)
    if (total440s >= 10 && !isInCooldown) {
        console.log("🛑 10x440 HIT - 10MIN EMERGENCY COOLDOWN");
        isInCooldown = true;
        setTimeout(() => { isInCooldown = false; }, 10 * 60 * 1000);
        await delay(10000);
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '115.0.0'],
            // 440 KILLER SETTINGS
            syncFullHistory: false,
            markOnlineOnConnect: false,
            keepAliveIntervalMs: 60000,     // 1min (slow)
            connectTimeoutMs: 30000,        // Fast timeout
            defaultQueryTimeoutMs: 30000,
            generateHighQualityLinkPreview: false,
            retryRequestDelayMs: 10000,     // Slow retry
            emitOwnEvents: false,
            // MOBILE MODE (440 Prevention)
            mobile: true,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const reason = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                console.log(`⚠️ Code: ${reason} | Total440s: ${total440s}`);

                if (reason === 440) {
                    consecutive440s++;
                    total440s++;
                    console.log(`🔥 440 x${consecutive440s} | TOTAL: ${total440s}`);

                    // Progressive delay (10s → 2min)
                    const delayTime = Math.min(10000 + (consecutive440s * 10000), 120000);
                    console.log(`⏳ Smart delay: ${delayTime / 1000}s`);
                    await delay(delayTime);
                    consecutive440s = 0; // Reset burst counter
                } else {
                    consecutive440s = 0;
                    await delay(5000);
                }

                startBot();
            } else if (connection === 'open') {
                total440s = Math.max(0, total440s - 1); // Slight forgiveness
                consecutive440s = 0;
                console.log("✅ STABLE CONNECTION! Total440s:", total440s);
            }
        });

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message || mek.key.remoteJid?.endsWith('@broadcast')) return;
                require('./main')(sock, mek);
            } catch { }
        });

    } catch (error) {
        console.log("💥 Restart:", error.message);
        await delay(10000);
        startBot();
    }
}

startBot();
process.on('uncaughtException', startBot);
