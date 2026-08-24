require('dotenv').config();
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 8000, () => console.log('Web server is running to bypass health check'));
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    getContentType,
    initAuthCreds,
    BufferJSON
} = require("@whiskeysockets/baileys");
const { MongoClient } = require('mongodb');
const fs = require('fs');
const pino = require("pino");
const path = require('path');
const { commands } = require('./command');
const config = require('./config');

// MongoDB Auth State Adapter
async function useMongoDBAuthState(collection) {
    const writeData = (data, id) => collection.replaceOne({ _id: id }, JSON.parse(JSON.stringify(data, BufferJSON.replacer)), { upsert: true });
    const readData = async (id) => {
        try {
            const data = await collection.findOne({ _id: id });
            return data ? JSON.parse(JSON.stringify(data), BufferJSON.reviver) : null;
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

let mongoClient;
let collection;

async function connectToWA() {
    console.log("🚀 Starting Sew Queen Bot...");

    // Connect to MongoDB only once
    if (!mongoClient) {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI environment variable is not defined!");
        }
        mongoClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
        await mongoClient.connect();
        collection = mongoClient.db('whatsapp_bot').collection('auth_info');
    }

    // Load Auth State from MongoDB
    const { state, saveCreds } = await useMongoDBAuthState(collection);
    
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        browser: Browsers.macOS("Desktop"),
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("\n📷 QR Code එක පහළින් ඇත. Scan කරන්න! 👇\n");
            require('qrcode-terminal').generate(qr, { small: true });
        }

        if (connection === 'close') {
            let reason = lastDisconnect.error?.output?.statusCode;
            let shouldReconnect = (reason !== DisconnectReason.loggedOut);
            if (shouldReconnect) {
                console.log(`⚠️ Reconnecting... (Reason: ${reason})`);
                setTimeout(() => connectToWA(), 3000);
            } else {
                console.log('❌ Session Logged out. Rescan QR.');
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            
            // Plugins Load කිරීම
            const pluginsDir = path.join(__dirname, 'plugins');
            if (fs.existsSync(pluginsDir)) {
                 const plugins = fs.readdirSync(pluginsDir);
                 plugins.forEach(file => {
                     if (path.extname(file).toLowerCase() === '.js') {
                         try {
                             require(path.join(pluginsDir, file));
                         } catch (e) {
                             console.log(`❌ Error loading ${file}: ${e.message}`);
                         }
                     }
                 });
                 console.log("✅ Plugins Loaded!");
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (mek) => {
        try {
            mek = mek.messages[0];
            if (!mek.message) return;
            if (mek.key.fromMe) return;

            const m = mek;
            const type = getContentType(mek.message);
            const from = mek.key.remoteJid;
            
            const body = (type === 'conversation') ? mek.message.conversation : 
                         (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : 
                         (type === 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : 
                         (type === 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : '';

            const isCmd = body.startsWith('.');
            const command = isCmd ? body.slice(1).trim().split(' ')[0].toLowerCase() : '';
            const args = body.trim().split(/ +/).slice(1);
            const q = args.join(' ');
            const isOwner = config.OWNER_NUMBER.includes(mek.key.participant || mek.key.remoteJid);

            const reply = (text) => {
                sock.sendMessage(from, { text: text }, { quoted: mek });
            };

            // 1. Commands ('.' තියෙන ඒවා)
            if (isCmd) {
                const cmd = commands.find((c) => c.pattern === command || (c.alias && c.alias.includes(command)));
                if (cmd) {
                    await cmd.function(sock, mek, m, { from, q, reply, args, isOwner, body });
                }
            }

            // 2. Body Listeners (Hi, Hello වගේ ඒවා අහන තැන)
            commands.map(async (command) => {
                if (command.on === "body") {
                    command.function(sock, mek, m, { from, body, isOwner, reply });
                }
            });

        } catch (e) {
            console.log(e);
        }
    });
}

connectToWA();
