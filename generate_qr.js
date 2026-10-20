require('dotenv').config();
const { MongoClient } = require('mongodb');
const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    initAuthCreds,
    BufferJSON
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

async function useMongoDBAuthState(collection) {
    const writeData = (data, id) => {
        const parsed = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
        const doc = { _id: id, data: parsed };
        return collection.replaceOne({ _id: id }, doc, { upsert: true });
    };
    const readData = async (id) => {
        try {
            const doc = await collection.findOne({ _id: id });
            if (!doc) return null;
            const parsed = doc.data !== undefined ? doc.data : doc;
            if (parsed._id) delete parsed._id;
            return JSON.parse(JSON.stringify(parsed), BufferJSON.reviver);
        } catch (error) { return null; }
    };
    const removeData = async (id) => {
        try { await collection.deleteOne({ _id: id }); } catch (_a) {}
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

let browserOpened = false;

async function startQRGenerator() {
    console.log("=================================================");
    console.log("🚀 DMC WHATSAPP ULTRA HD BROWSER QR GENERATOR 🚀");
    console.log("=================================================\n");

    if (!process.env.MONGODB_URI) {
        console.error("❌ No MONGODB_URI found in .env. Exiting...");
        process.exit(1);
    }

    console.log("📡 Connecting to MongoDB...");
    const mongoClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 });
    await mongoClient.connect();
    const collection = mongoClient.db('whatsapp_bot').collection('auth_info');
    console.log("✅ MongoDB Connected!");

    // Clear old conflict-prone sessions from MongoDB
    console.log("🧹 Clearing old/burned session credentials from MongoDB...");
    await collection.deleteMany({});
    console.log("✨ MongoDB auth_info collection is clean and ready for a FRESH session!\n");

    const { state, saveCreds } = await useMongoDBAuthState(collection);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Chrome"),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n⚡ Generating Ultra HD Clean QR Code for Browser...");
            try {
                const dataUrl = await QRCode.toDataURL(qr, { width: 520, margin: 2 });
                const pngPath = path.join(__dirname, 'qr.png');
                await QRCode.toFile(pngPath, qr, { width: 520, margin: 2 });
                
                const htmlPath = path.join(__dirname, 'qr.html');
                const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>⚡ Scan DMC WhatsApp QR Code ⚡</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; }
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #0c1317;
            color: #e9edef;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
        }
        .container {
            background: #111b21;
            border: 1px solid #222e35;
            padding: 35px 30px;
            border-radius: 20px;
            box-shadow: 0 16px 40px rgba(0,0,0,0.7);
            text-align: center;
            max-width: 500px;
            width: 100%;
            animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        h1 { margin-top: 0; font-size: 24px; color: #00a884; }
        .instructions {
            background: #202c33;
            border-radius: 12px;
            padding: 14px 18px;
            text-align: left;
            margin: 18px 0 24px 0;
            font-size: 14px;
            line-height: 1.6;
            color: #d1d7db;
        }
        .instructions b { color: #00a884; }
        .qr-card {
            background: #ffffff;
            padding: 16px;
            border-radius: 16px;
            display: inline-block;
            box-shadow: 0 8px 30px rgba(0, 168, 132, 0.25);
        }
        img { width: 100%; max-width: 420px; height: auto; display: block; border-radius: 8px; }
        .footer {
            margin-top: 20px;
            font-size: 14px;
            color: #25d366;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .pulse { width: 10px; height: 10px; background: #25d366; border-radius: 50%; box-shadow: 0 0 10px #25d366; animation: blink 1.2s infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    </style>
</head>
<body>
    <div class="container">
        <h1>👑 DMC WhatsApp Scanner</h1>
        <div class="instructions">
            1. Open <b>WhatsApp</b> on your phone.<br>
            2. Tap <b>Menu (⋮)</b> or <b>Settings</b> &rarr; <b>Linked Devices</b>.<br>
            3. Tap <b>Link a Device</b> and point your camera at this QR Code!
        </div>
        <div class="qr-card">
            <img src="${dataUrl}" alt="WhatsApp QR Code">
        </div>
        <div class="footer">
            <span class="pulse"></span>
            <span>Ultra Clear QR Code Ready - Scan Now!</span>
        </div>
    </div>
</body>
</html>`;
                fs.writeFileSync(htmlPath, htmlContent);
                console.log("✅ Ultra HD QR Code saved to: " + htmlPath);

                if (!browserOpened) {
                    browserOpened = true;
                    exec(`start "" "${htmlPath}"`);
                    console.log("🌐 Successfully opened Ultra HD QR Code in your Browser tab!");
                }
            } catch (err) {
                console.error("QR Render Error:", err);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection closed (Status: ${statusCode || 'unknown'}).`);
        } else if (connection === 'open') {
            console.log("\n===========================================================");
            console.log("🎉 WHATSAPP CONNECTED SUCCESSFULLY! 🎉");
            console.log("💾 Fresh Session Credentials saved to MongoDB (auth_info)!");
            console.log("🛑 Exiting local process NOW so Koyeb can take over without conflict!");
            console.log("===========================================================\n");
            
            // Allow 2 seconds for creds write to settle in MongoDB
            setTimeout(async () => {
                try {
                    sock.ev.removeAllListeners();
                    sock.ws?.close();
                    sock.end?.(undefined);
                    await mongoClient.close();
                } catch (e) {}
                console.log("👋 Local process exited cleanly. Ready for Koyeb!");
                process.exit(0);
            }, 2500);
        }
    });
}

startQRGenerator().catch(err => {
    console.error("❌ Fatal Error:", err);
    process.exit(1);
});
