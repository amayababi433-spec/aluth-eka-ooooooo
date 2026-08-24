const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    getContentType
} = require("@whiskeysockets/baileys");
const fs = require('fs');
const pino = require("pino");
const path = require('path');
const { commands } = require('./command');
const config = require('./config');

async function connectToWA() {
    console.log("🚀 Starting Sew Queen Bot...");

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
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
            let shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            if (shouldReconnect) {
                console.log('⚠️ Reconnecting...');
                connectToWA();
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