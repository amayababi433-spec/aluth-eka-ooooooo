require('dotenv').config();
const { MongoClient } = require('mongodb');
const { default: makeWASocket, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers, initAuthCreds, BufferJSON } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");

async function useMongoDBAuthState(collection) {
    const writeData = (data, id) => {
        const parsed = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
        return collection.replaceOne({ _id: id }, { _id: id, data: parsed }, { upsert: true });
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

async function start() {
    const mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    const collection = mongoClient.db('whatsapp_bot').collection('auth_info');
    
    // Wipe just in case
    await collection.deleteMany({});
    
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
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) {
            fs.writeFileSync('qr.txt', qr);
            console.log('QR_READY');
        }
        if (connection === 'open') {
            console.log('CONNECTED');
            setTimeout(() => process.exit(0), 5000); // Give time to sync and then kill
        }
    });
}
start();
