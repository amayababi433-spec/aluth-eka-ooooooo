const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');

// Server
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('🍪 CREDS.JSON = WHATSAPP COOKIE 🔒');
});
server.listen(port);

// COOKIE PROTECTION (READ-ONLY)
let stabilityScore = 0;

async function startBot() {
    console.log(`🍪 COOKIE MODE | Stability: ${stabilityScore}`);

    try {
        // LOAD CREDS.JSON (COOKIE)
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            // COOKIE-FRIENDLY CONFIG
            browser: Browsers.ubuntu("Chrome"),
            syncFullHistory: false,
            markOnlineOnConnect: false,  // No spam
            keepAliveIntervalMs: 90000,  // 90s (stable)
            connectTimeoutMs: 60000,
            generateHighQualityLinkPreview: false,
            retryRequestDelayMs: 12000,
        });

        // BLOCK ALL WRITES (COOKIE PROTECTION)
        sock.ev.on('creds.update', () => {
            console.log("🍪 WRITE BLOCKED - creds.json PROTECTED");
            // NO saveCreds() - pure read-only
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            const code = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                stabilityScore--;
                console.log(`⚠️ ${code} | Stability: ${stabilityScore}`);

                // Smart delays (NO file ops)
                const delayMs = stabilityScore > 0 ? 15000 :
                    stabilityScore > -3 ? 30000 : 60000;

                await delay(delayMs);
                startBot();
            } else if (connection === 'open') {
                stabilityScore++;
                console.log(`✅ COOKIE LOADED! Stability: ${stabilityScore}`);

                // Send status to owner
                setTimeout(() => {
                    sock.sendMessage("94717884174@s.whatsapp.net", {
                        text: `🍪 *SESSION STABLE* (${stabilityScore})\n🔒 No surgery detected`
                    }).catch(() => { });
                }, 5000);
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
        console.log("🍪 Safe restart - cookie untouched");
        await delay(20000);
        startBot();
    }
}

startBot();
process.on('uncaughtException', () => startBot());