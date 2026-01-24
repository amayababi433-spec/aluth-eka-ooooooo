const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const fs = require('fs');

// 1. Server Keep Alive
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🛡️ DMC BOT - FIREFOX POWER MODE');
});
server.listen(port, () => console.log(`🌐 Server Running: ${port}`));

// 2. Global Variables
let reconnectAttempts = 0;
let consecutive440s = 0;
let isCooldownActive = false;

// 3. Memory Cleaner (RAM බේරගන්න)
if (global.gc) {
    setInterval(() => {
        global.gc();
        console.log("🧹 Memory Cleaned (Garbage Collection)");
    }, 1000 * 60 * 5); // හැම විනාඩි 5කට වරක්
}

async function startBot() {
    console.log(`🔒 FIREFOX MODE ACTIVE | 440s Count: ${consecutive440s}`);

    // 15x 440 = 15MIN EMERGENCY NAP (Cool Down)
    if (consecutive440s >= 15 && !isCooldownActive) {
        console.log("🛑 TOO MANY ERRORS - TAKING A 15 MIN SLEEP...");
        isCooldownActive = true;
        await delay(15 * 60 * 1000);
        isCooldownActive = false;
        consecutive440s = 0; // Reset counter
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            // 🔥 POWER UP: Firefox on Linux (Most Stable for Servers)
            browser: ['Ubuntu', 'Firefox', '120.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: false, // නිතරම Online පෙන්නන්නේ නෑ (Stealth)
            keepAliveIntervalMs: 60000, // විනාඩියකට සැරයක් හායි කියනවා
            connectTimeoutMs: 60000,    // කනෙක්ෂන් එකට විනාඩියක් කල් දෙනවා
            retryRequestDelayMs: 5000,
            generateHighQualityLinkPreview: true,
            emitOwnEvents: false,
            defaultQueryTimeoutMs: undefined, // Timeout එරර් අඩු කරන්න
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const code = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                console.log(`⚠️ Connection Closed: ${code}`);

                if (code === 440 || code === 428) {
                    consecutive440s++;

                    // 🔥 SMART JITTER DELAY (Random Time)
                    // කෙලින්ම 15s නෙවෙයි, 15s + (0-5s) අතර ගාණක්
                    let baseDelay;
                    if (consecutive440s <= 3) baseDelay = 15000;       // 15s
                    else if (consecutive440s <= 7) baseDelay = 30000;   // 30s
                    else if (consecutive440s <= 10) baseDelay = 60000;  // 1min
                    else baseDelay = 180000;                            // 3min (Hard Backoff)

                    const jitter = Math.floor(Math.random() * 5000); // +0-5s Random
                    const totalDelay = baseDelay + jitter;

                    console.log(`🔥 440 Detected (#${consecutive440s}) | Waiting ${totalDelay / 1000}s...`);
                    await delay(totalDelay);

                } else if (code === DisconnectReason.loggedOut) {
                    console.log("⛔ Logged Out. Session Expired completely.");
                    // මෙතනදී Reconnect වෙන්නේ නෑ, නවතින්න ඕනේ.
                    // ඒත් උඹට ඕන නිසා අපි ට්රයි එකක් දෙමු.
                    await delay(10000);
                } else {
                    // සාමාන්ය Connection Drop එකක් නම් ඉක්මනට එන්න
                    console.log("🔄 Minor Disconnect. Reconnecting quickly...");
                    await delay(5000);
                }

                startBot(); // Restart logic

            } else if (connection === 'open') {
                // සාර්ථකව Connect වුණොත් වැරදි ගාණ අඩු කරන්න
                if (consecutive440s > 0) {
                    consecutive440s = Math.max(0, consecutive440s - 1);
                    console.log(`✅ STABLE CONNECTION! (Error Count Reduced to ${consecutive440s})`);
                } else {
                    console.log("✅ FIREFOX MODE STABLE 🔥");
                }
                reconnectAttempts = 0;
            }
        });

        // Command Handler
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                const main = require('./main');
                await main(sock, mek, null);
            } catch (err) {
                // console.log("Handler Error");
            }
        });

    } catch (error) {
        console.log("💥 Critical Error:", error.message);
        await delay(20000);
        startBot();
    }
}

// Auto Error Recovery
process.on('uncaughtException', (err) => {
    console.log('🛡️ Crash Blocked:', err.message);
});

startBot();