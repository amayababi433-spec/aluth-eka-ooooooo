const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs').promises;
const TaskManager = require('./lib/task_manager');
const qrcode = require('qrcode-terminal'); // Re-added for QR

// HTTP Server (Koyeb must)
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('👑 DMC BOT STABLE 100% 🚀');
});
server.listen(port, () => console.log(`🌐 Server: ${port}`));

// 🛡️ 440 ERROR KILLER + CPU SAVER
let connectionAttempts = 0;
let last440Time = 0;
const MAX_440_ATTEMPTS = 3;
const BAN_COOLDOWN = 5 * 60 * 1000; // 5 minutes

if (global.gc) {
    setInterval(() => global.gc(), 1000 * 60 * 20); // 20min
}

async function startBot() {
    console.log(`🚀 DMC BOT Attempt #${connectionAttempts + 1}`);

    try {
        // 440 BAN Check
        const now = Date.now();
        if (last440Time && now - last440Time < BAN_COOLDOWN && connectionAttempts >= MAX_440_ATTEMPTS) {
            console.log("🛑 440 BAN DETECTED - 5min COOLDOWN");
            await delay(BAN_COOLDOWN);
            connectionAttempts = 0;
        }

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '20.0.80'],
            connectTimeoutMs: 30000,  // Reduced timeout
            keepAliveIntervalMs: 60000,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            shouldIgnoreJid: jid => jid === 'status@broadcast',
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('✨ QR CODE RECEIVED!');
                qrcode.generate(qr, { small: true });
            }

            const reasonCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = update.shouldReconnect || false;

            if (connection === 'close') {
                connectionAttempts++;
                console.log(`❌ DISCONNECTED | Code: ${reasonCode} | Reconnect: ${shouldReconnect}`);

                if (reasonCode === 440) {
                    last440Time = Date.now();
                    console.log(`🔥 440 DETECTED | Attempts: ${connectionAttempts}/${MAX_440_ATTEMPTS}`);

                    // Delete session on repeated 440
                    if (connectionAttempts >= MAX_440_ATTEMPTS) {
                        console.log("🗑️ CLEARING SESSION - FRESH START");
                        try {
                            await fs.rm('./auth_info_baileys', { recursive: true, force: true });
                        } catch (e) { }
                        connectionAttempts = 0;
                        await delay(30000); // 30s fresh start
                    } else {
                        await delay(20000 + (connectionAttempts * 5000)); // Progressive delay
                    }
                } else if (reasonCode === DisconnectReason.loggedOut) {
                    console.log("🔐 LOGGED OUT - SCAN QR AGAIN");
                    return;
                } else {
                    await delay(15000); // Normal disconnect
                }

                startBot();
            } else if (connection === 'open') {
                connectionAttempts = 0;
                last440Time = 0;
                console.log("✅ DMC BOT CONNECTED ✅ NO MORE 440 LOOP!");

                // 🔄 Task Recovery Logic
                const pendingTasks = TaskManager.getPendingTasks();
                if (pendingTasks.length > 0) {
                    console.log(`🚀 Found ${pendingTasks.length} pending tasks. Recovering...`);
                    // Logic to resume tasks will go here
                }
            }
        });

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message || mek.key.remoteJid?.endsWith('@broadcast')) return;

                require('./main')(sock, mek);
            } catch (err) {
                console.log("⚠️ Message handler error:", err.message);
            }
        });

    } catch (error) {
        console.log("💥 START ERROR:", error.message);
        connectionAttempts++;
        await delay(30000);
        startBot();
    }
}

startBot();
