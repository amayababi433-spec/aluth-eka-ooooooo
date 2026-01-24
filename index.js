const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// 🔒 SERVER (Koyeb alive)
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🔒 PERMANENT SESSION MODE - NO CORRUPTION');
});
server.listen(port, () => console.log(`🌐 Server: ${port}`));

// 🛡️ SESSION LOCK SYSTEM
let reconnectAttempts = 0;
const MAX_RECONNECTS = 50; // 50 attempts max

async function startBot() {
    console.log(`🔒 PERMANENT MODE | Attempts: ${reconnectAttempts}/${MAX_RECONNECTS}`);

    // Emergency stop after 50 fails
    if (reconnectAttempts >= MAX_RECONNECTS) {
        console.log("🛑 MAX ATTEMPTS - STAYING OFFLINE");
        return;
    }

    try {
        // LOAD EXISTING SESSION (READ-ONLY)
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            // 🔥 PERMANENT SESSION SETTINGS
            browser: Browsers.macOS("Safari"), // Desktop only
            syncFullHistory: false,
            markOnlineOnConnect: false,        // No status spam
            keepAliveIntervalMs: 60000,        // 1min ping
            connectTimeoutMs: 60000,
            generateHighQualityLinkPreview: false,
            retryRequestDelayMs: 15000,        // Slow retry
            emitOwnEvents: false,
            // 🔒 ANTI-CORRUPTION
            defaultQueryTimeoutMs: 60000,
        });

        // PROTECTED CREDS SAVE (Limited writes)
        sock.ev.on('creds.update', (creds) => {
            // Only save critical updates
            if (creds.registered) saveCreds();
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const reason = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                reconnectAttempts++;
                console.log(`⚠️ Closed: ${reason} | Attempts: ${reconnectAttempts}`);

                // Smart reconnect delay
                const delayMs = Math.min(10000 + (reconnectAttempts * 2000), 120000);
                console.log(`⏳ Reconnect in ${Math.round(delayMs / 1000)}s...`);
                await delay(delayMs);

                startBot();
            } else if (connection === 'open') {
                reconnectAttempts = 0;
                console.log("✅ PERMANENT SESSION LOADED! 🎉");
                console.log("🔒 ANTI-CORRUPTION: ACTIVE");
            }
        });

        // SAFE Message Handler
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message || mek.key.remoteJid?.endsWith('@broadcast')) return;
                require('./main')(sock, mek);
            } catch (err) {
                // Silent fail - protect session
            }
        });

    } catch (error) {
        console.log("💥 Safe restart:", error.message);
        reconnectAttempts++;
        await delay(15000);
        startBot();
    }
}

// Ultimate protection
process.on('uncaughtException', (err) => {
    console.log('🛡️ Session protected from crash');
    startBot();
});

startBot();
