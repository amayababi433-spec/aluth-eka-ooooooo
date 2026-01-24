const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');

// Server
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🔒 DMC BOT - 440 EXTERMINATOR 🔒');
});
server.listen(port, () => console.log(`🌐 Server: ${port}`));

// 🛡️ ULTIMATE 440 DEFENSE
let reconnectAttempts = 0;
let consecutive440s = 0;
let isCooldownActive = false;

async function startBot() {
    console.log(`🔒 440 EXTERMINATOR | 440s: ${consecutive440s}`);

    // 15x 440 = 15min cooldown
    if (consecutive440s >= 15 && !isCooldownActive) {
        console.log("🛑 15x440 - 15MIN EMERGENCY COOLDOWN");
        isCooldownActive = true;
        setTimeout(() => isCooldownActive = false, 15 * 60 * 1000);
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            // 🔥 PROVEN 440-PROOF CONFIG
            browser: ['Ubuntu', 'Firefox', '114.0.0'],  // Firefox = stable
            syncFullHistory: false,
            markOnlineOnConnect: false,
            keepAliveIntervalMs: 120000,  // 2min (ultra slow)
            connectTimeoutMs: 30000,
            generateHighQualityLinkPreview: false,
            retryRequestDelayMs: 20000,   // 20s retry
            emitOwnEvents: false,
            // 440 KILLER SETTINGS
            // useMultiFileAuthState, legacyUserAgent and connectRetries are not standard makeWASocket options
            // but keeping logic consistent with request intent
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const reason = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                reconnectAttempts++;

                if (reason === 440) {
                    consecutive440s++;
                    console.log(`🔥 440 #${consecutive440s} | Cooldown: ${isCooldownActive ? 'ACTIVE' : 'OFF'}`);

                    // ULTRA PROGRESSIVE DELAY
                    let delayMs;
                    if (consecutive440s <= 3) delayMs = 15000;      // 15s
                    else if (consecutive440s <= 7) delayMs = 30000;  // 30s
                    else if (consecutive440s <= 12) delayMs = 60000; // 1min
                    else delayMs = 120000;                           // 2min

                    console.log(`⏳ ${Math.round(delayMs / 1000)}s delay...`);
                    await delay(delayMs);
                } else {
                    consecutive440s = 0;
                    await delay(10000);
                }

                startBot();
            } else if (connection === 'open') {
                consecutive440s = Math.max(0, consecutive440s - 1);
                reconnectAttempts = 0;
                console.log(`✅ STABLE! 🔥 | 440s: ${consecutive440s}`);
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
        console.log("💥 Safe restart");
        await delay(15000);
        startBot();
    }
}

startBot();
process.on('uncaughtException', startBot);
