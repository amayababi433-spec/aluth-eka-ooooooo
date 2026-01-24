const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');

// Server (Koyeb alive)
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🔒 DMC BOT - ULTRA STABLE MODE 🔒');
});
server.listen(port, () => console.log(`🌐 Server: ${port}`));

// 🛡️ 440 DEFENSE SYSTEM
let consecutive440s = 0;
let last440Time = 0;
const MAX_440_BURST = 5;
const COOLDOWN_440 = 2 * 60 * 1000; // 2 minutes

async function startBot() {
    console.log("🔒 ULTRA STABLE MODE - Existing Session Only");

    // 440 Burst Protection
    const now = Date.now();
    if (consecutive440s >= MAX_440_BURST && (now - last440Time) < COOLDOWN_440) {
        console.log("🛑 440 BURST DETECTED - 2MIN COOLDOWN");
        await delay(COOLDOWN_440);
        consecutive440s = 0;
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '120.0.0'], // Stable browser
            syncFullHistory: false,
            markOnlineOnConnect: false, // 440 Prevention #1
            keepAliveIntervalMs: 30000,  // Slower keepalive
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            // 440 Prevention Configs
            generateHighQualityLinkPreview: false,
            retryRequestDelayMs: 5000,
            emitOwnEvents: false,
            shouldIgnoreJid: jid => jid?.endsWith('@broadcast'),
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const reason = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                console.log(`⚠️ Code: ${reason}`);

                if (reason === 440) {
                    consecutive440s++;
                    last440Time = Date.now();
                    console.log(`🔥 440 x${consecutive440s}/${MAX_440_BURST} - Smart Delay...`);

                    // Progressive backoff (440 killer)
                    const delayMs = Math.min(10000 + (consecutive440s * 5000), 60000);
                    await delay(delayMs);
                } else {
                    consecutive440s = 0; // Reset counter
                    await delay(5000);
                }

                startBot();
            } else if (connection === 'open') {
                consecutive440s = 0;
                console.log("✅ ULTRA STABLE CONNECTION! 🔥");
                console.log("🎯 440 Protection: ACTIVE");
            }
        });

        // Safe message handler
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message || mek.key.remoteJid?.endsWith('@broadcast')) return;
                require('./main')(sock, mek);
            } catch (err) {
                // Silent fail
            }
        });

    } catch (error) {
        console.log("💥 Restarting:", error.message);
        await delay(10000);
        startBot();
    }
}

startBot();

// Ultimate crash protection
process.on('uncaughtException', startBot);
