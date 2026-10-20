require('dotenv').config();
const http = require('http');
const { MongoClient } = require('mongodb');
const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    initAuthCreds,
    BufferJSON,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const QRCode = require('qrcode');

const PORT = 5050;
let currentQRDataUrl = null;
let currentPairingCode = null;
let connectionStatus = "Initializing QR Code...";
let activeSock = null;
let isConnected = false;
let mongoClient = null;
let collection = null;
let authState = null;

async function useMongoDBAuthState(coll) {
    const writeData = (data, id) => {
        const parsed = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
        const doc = { _id: id, data: parsed };
        return coll.replaceOne({ _id: id }, doc, { upsert: true });
    };
    const readData = async (id) => {
        try {
            const doc = await coll.findOne({ _id: id });
            if (!doc) return null;
            const parsed = doc.data !== undefined ? doc.data : doc;
            if (parsed._id) delete parsed._id;
            return JSON.parse(JSON.stringify(parsed), BufferJSON.reviver);
        } catch (error) { return null; }
    };
    const removeData = async (id) => {
        try { await coll.deleteOne({ _id: id }); } catch (_a) {}
    };
    const creds = await readData('creds') || initAuthCreds();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async id => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
}

// Start HTTP Server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    
    if (url.pathname === '/pair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const params = new URLSearchParams(body);
                let phone = params.get('phone') || '';
                phone = phone.replace(/[^0-9]/g, '');
                if (phone && activeSock && !activeSock.authState.creds.registered) {
                    connectionStatus = `Requesting pairing code for +${phone}...`;
                    const code = await activeSock.requestPairingCode(phone);
                    currentPairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    connectionStatus = `✅ Pairing Code: <b style="color:#25d366;font-size:20px;">${currentPairingCode}</b> (Check WhatsApp on your phone!)`;
                }
            } catch (err) {
                connectionStatus = `❌ Error: ${err.message}`;
            }
            res.writeHead(302, { Location: '/' });
            res.end();
        });
        return;
    }

    if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            qr: currentQRDataUrl,
            code: currentPairingCode,
            status: connectionStatus,
            connected: isConnected
        }));
        return;
    }

    // Main Page
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>⚡ Live DMC WhatsApp Scanner ⚡</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #0c1317; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { background: #111b21; border: 1px solid #222e35; border-radius: 20px; max-width: 500px; width: 100%; padding: 30px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
        h1 { color: #00a884; font-size: 24px; margin-bottom: 8px; }
        .live-tag { display: inline-flex; align-items: center; gap: 6px; background: #1f352c; color: #25d366; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-bottom: 16px; }
        .dot { width: 8px; height: 8px; background: #25d366; border-radius: 50%; animation: blink 1s infinite alternate; }
        @keyframes blink { 0% { opacity: 0.3; } 100% { opacity: 1; } }
        .instructions { text-align: left; background: #182229; border-radius: 12px; padding: 14px; font-size: 13px; color: #d1d7db; line-height: 1.6; margin-bottom: 20px; border-left: 4px solid #00a884; }
        .instructions b { color: #00a884; }
        .qr-wrapper { background: #fff; padding: 14px; border-radius: 16px; display: inline-block; box-shadow: 0 8px 32px rgba(0, 168, 132, 0.3); margin-bottom: 20px; min-height: 320px; min-width: 320px; display: flex; align-items: center; justify-content: center; }
        .qr-wrapper img { width: 300px; height: 300px; display: block; border-radius: 8px; }
        .status-box { background: #202c33; border-radius: 10px; padding: 12px 16px; font-size: 14px; color: #00a884; font-weight: 600; margin-bottom: 20px; word-break: break-word; }
        .pairing-box { border-top: 1px solid #222e35; padding-top: 20px; text-align: left; }
        .pairing-box h3 { font-size: 14px; color: #d1d7db; margin-bottom: 10px; }
        .form-row { display: flex; gap: 8px; }
        input[type="text"] { flex: 1; background: #202c33; border: 1px solid #2a3942; border-radius: 8px; padding: 10px 14px; color: #e9edef; font-size: 14px; outline: none; }
        input[type="text"]:focus { border-color: #00a884; }
        button { background: #00a884; color: #111b21; border: none; border-radius: 8px; padding: 10px 18px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        button:hover { background: #06cf9c; }
        .pair-code-display { font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #00a884; background: #182229; padding: 14px; border-radius: 10px; text-align: center; margin-top: 14px; border: 2px dashed #00a884; }
    </style>
</head>
<body>
    <div class="card">
        <h1>👑 DMC WhatsApp Scanner</h1>
        <div class="live-tag"><span class="dot"></span> ALWAYS FRESH • AUTO-RELOADS</div>
        
        <div class="instructions">
            📱 <b>Scan Instructions:</b><br>
            1. Open <b>WhatsApp</b> on phone &rarr; <b>Settings / Menu (⋮)</b><br>
            2. Tap <b>Linked Devices</b> &rarr; <b>Link a Device</b><br>
            3. Point your camera at this QR code!
        </div>

        <div class="qr-wrapper" id="qrContainer">
            <span style="color:#444; font-size:14px; font-weight:bold;">Loading Live QR Code...</span>
        </div>

        <div class="status-box" id="statusText">⏳ Connecting...</div>

        <div class="pairing-box">
            <h3>🔑 Camera not working? Get 8-digit Pairing Code:</h3>
            <form action="/pair" method="POST" class="form-row">
                <input type="text" name="phone" placeholder="e.g. 94771234567" required />
                <button type="submit">Get Code</button>
            </form>
            <div id="pairDisplay" style="display:none;" class="pair-code-display"></div>
        </div>
    </div>

    <script>
        async function checkStatus() {
            try {
                const res = await fetch('/status');
                const data = await res.json();
                const container = document.getElementById('qrContainer');
                const status = document.getElementById('statusText');
                const pairDisplay = document.getElementById('pairDisplay');

                if (data.qr) {
                    container.innerHTML = '<img src="' + data.qr + '" alt="WhatsApp QR Code">';
                }
                if (data.status) {
                    status.innerHTML = data.status;
                }
                if (data.code) {
                    pairDisplay.style.display = 'block';
                    pairDisplay.innerText = data.code;
                }
            } catch (e) {}
        }
        setInterval(checkStatus, 1500);
        checkStatus();
    </script>
</body>
</html>`);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🌐 QR Code Web Page is LIVE at: http://localhost:${PORT}`);
    console.log(`👉 OPEN THIS LINK IN YOUR BROWSER NOW: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});

async function startWhatsAppSession() {
    if (isConnected) return;

    try {
        if (!mongoClient) {
            console.log("📡 Connecting to MongoDB...");
            mongoClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 });
            await mongoClient.connect();
            collection = mongoClient.db('whatsapp_bot').collection('auth_info');
            console.log("🧹 Clearing old credentials for fresh start...");
            await collection.deleteMany({});
            console.log("✅ MongoDB ready for fresh session!");
        }

        authState = await useMongoDBAuthState(collection);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.macOS("Chrome"),
            auth: {
                creds: authState.state.creds,
                keys: makeCacheableSignalKeyStore(authState.state.keys, pino({ level: 'silent' }))
            },
            generateHighQualityLinkPreview: false,
            markOnlineOnConnect: false
        });

        activeSock = sock;

        sock.ev.on('creds.update', async () => {
            if (authState?.saveCreds) await authState.saveCreds();
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log("⚡ Fresh Live QR Code generated! Updated http://localhost:5050");
                currentQRDataUrl = await QRCode.toDataURL(qr, { width: 500, margin: 2 });
                connectionStatus = "⚡ Live QR Code is ready! Point your WhatsApp camera now.";
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`⚠️ Connection closed (Status: ${statusCode || 'unknown'}).`);

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log("❌ Logged out. Reconnecting...");
                    setTimeout(startWhatsAppSession, 2000);
                } else if (!isConnected) {
                    // Auto-reconnect on 408 (QR timeout) or 515 (restart required)
                    connectionStatus = "🔄 Refreshing fresh QR Code...";
                    console.log("🔄 Auto-reconnecting to generate fresh QR...");
                    setTimeout(startWhatsAppSession, 1500);
                }
            } else if (connection === 'open') {
                isConnected = true;
                console.log("\n===========================================================");
                console.log("🎉 WHATSAPP CONNECTED SUCCESSFULLY! 🎉");
                console.log("💾 Fresh Session Credentials saved to MongoDB (auth_info)!");
                console.log("🛑 Exiting local server now so Koyeb can take over cleanly!");
                console.log("===========================================================\n");
                connectionStatus = "🎉 CONNECTED SUCCESSFULLY! Saved to MongoDB. You can close this tab!";

                setTimeout(async () => {
                    try {
                        sock.ev.removeAllListeners();
                        sock.ws?.close();
                        sock.end?.(undefined);
                        if (mongoClient) await mongoClient.close();
                        server.close();
                    } catch (e) {}
                    console.log("👋 Local server shutdown. Koyeb is ready to start!");
                    process.exit(0);
                }, 3000);
            }
        });
    } catch (err) {
        console.error("Socket error:", err);
        setTimeout(startWhatsAppSession, 3000);
    }
}

startWhatsAppSession();
