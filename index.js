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
    BufferJSON,
    makeInMemoryStore,
    getAggregateVotesInPollMessage
} = require("@whiskeysockets/baileys");
const { MongoClient } = require('mongodb');
const fs = require('fs');
const pino = require("pino");
const path = require('path');
const config = require('./config');

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
setInterval(() => {
    if (store && store.messages) store.messages.clear(); // Free up RAM every 30 mins
}, 1800000);

const commands = require('./command').commands;

const getMsgContent = (msg) => {
    if (!msg) return "";
    return msg.conversation || 
           msg.extendedTextMessage?.text || 
           msg.imageMessage?.caption || 
           msg.videoMessage?.caption || "";
};

// MongoDB Auth State Adapter
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

let mongoClient;
let collection;

const voteCooldown = new Map();
setInterval(() => voteCooldown.clear(), 3600000);

async function connectToWA() {
    console.log("🚀 Starting Sew Queen Bot...");

    if (!mongoClient) {
        if (!process.env.MONGODB_URI) {
            console.error("No MONGODB_URI found. Exiting...");
            return;
        }
        mongoClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
        await mongoClient.connect();
        collection = mongoClient.db('whatsapp_bot').collection('auth_info');
    }

    const { state, saveCreds } = await useMongoDBAuthState(collection);
    const { version, isLatest } = await fetchLatestBaileysVersion();

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
        markOnlineOnConnect: true
    });

    store.bind(sock.ev);

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

    // Poll listener for native WhatsApp polls
    sock.ev.on('messages.update', async (messages) => {
        for (const msg of messages) {
            if (msg.update?.pollUpdates) {
                const pollUpdate = msg.update.pollUpdates[0];
                const sender = msg.key.remoteJid;

                if (voteCooldown.has(sender) && Date.now() - voteCooldown.get(sender) < 5000) continue;
                voteCooldown.set(sender, Date.now());

                try {
                    const pollMsg = await store.loadMessage(sender, msg.key.id);
                    if (!pollMsg) continue;

                    const vote = getAggregateVotesInPollMessage({
                        message: pollMsg.message,
                        pollUpdates: [pollUpdate]
                    });

                    const selectedOption = vote.find(v => v.voters.length > 0)?.name;
                    if (!selectedOption) continue;

                    if (global.processPollVote) {
                        global.processPollVote(sender, selectedOption, sock).catch(console.error);
                    }
                } catch (e) {
                    console.error("Poll Decrypt Error:", e.message);
                }
            }
        }
    });

    sock.ev.on('messages.upsert', async (mek) => {
        try {
            mek = mek.messages[0];
            if (!mek.message) return;
            if (mek.key.fromMe) return;

            const m = mek;
            const type = getContentType(mek.message);
            const from = mek.key.remoteJid;
            
            const content = getMsgContent(mek);
            if (!content || typeof content !== 'string') return;
            const body = content;

            const isCmd = body.startsWith('.');
            const command = isCmd ? body.slice(1).trim().split(' ')[0].toLowerCase() : '';
            const args = body.trim().split(/ +/).slice(1);
            const q = args.join(' ');
            const isOwner = config.OWNER_NUMBER.includes(mek.key.participant || mek.key.remoteJid);
            const sender = mek.key.participant || mek.key.remoteJid;
            const isGroup = from.endsWith('@g.us');

            const reply = (text) => {
                sock.sendMessage(from, { text: text }, { quoted: mek });
            };

            if (isCmd) {
                const cmd = commands.find((c) => c.pattern === command || (c.alias && c.alias.includes(command)));
                if (cmd) {
                    await cmd.function(sock, mek, m, { from, q, reply, args, isOwner, isGroup, body, sender });
                }
            }

            commands.map(async (command) => {
                if (command.on === "body") {
                    try {
                        await command.function(sock, mek, m, { from, body, isOwner, isGroup, reply, sender });
                    } catch(err) { console.log('Plugin Body Error:', err); }
                }
            });
        } catch (e) {
            console.log('Error in messages.upsert:', e);
        }
    });
}

connectToWA().catch(err => console.log('Unexpected Error:', err));
