require('dotenv').config();

// 🛡️ 1000% ZERO-CRASH & ANTI-BAN PROCESS IMMUNITY
const DownloadGuard = require('./lib/downloadGuard');
DownloadGuard.installProcessCrashGuard();

global.blockedUsersCache = new Map();
if (!global.vipVideoUsersCache) global.vipVideoUsersCache = new Set();
if (global.AUTO_VOICE_ENABLED === undefined) global.AUTO_VOICE_ENABLED = (process.env.AUTO_VOICE !== 'false');
if (global.VERIFICATION_POLL_ENABLED === undefined) global.VERIFICATION_POLL_ENABLED = true;
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');
const { setupDashboard } = require('./lib/dashboard');

const n8nWebhookUrl = 'http://172.198.152.235:5678/webhook/236fbbcc-f33c-45e1-8c79-60bee0df774f';

let pluginsLoaded = false;
function loadAllPlugins() {
    if (pluginsLoaded) return;
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
        console.log("✅ Plugins Preloaded for Dashboard & Bot!");
        pluginsLoaded = true;
    }
}
loadAllPlugins();

const app = express();
setupDashboard(app);
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Web server & Admin Dashboard running on port ${PORT}`));

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
    getAggregateVotesInPollMessage
} = require("@whiskeysockets/baileys");
const { MongoClient } = require('mongodb');
const pino = require("pino");

const commands = require('./command').commands;

const getMsgContent = (m) => {
    const msg = m?.message;
    if (!msg) return "";
    return msg.conversation || 
           msg.extendedTextMessage?.text || 
           msg.imageMessage?.caption || 
           msg.videoMessage?.caption || "";
};

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
let reconnectTimeout = null;
let replaceCount = 0;
let currentSock = null;
global.sock = null;
let collection;

const voteCooldown = new Map();
setInterval(() => voteCooldown.clear(), 3600000);

// Global custom poll cache to avoid huge RAM leaks of InMemoryStore
global.activePolls = new Map();
// Clear old polls every hour to prevent memory leaks
setInterval(() => global.activePolls.clear(), 3600000);

async function connectToWA() {
    console.log("🚀 Starting Sew Queen Bot...");

    if (currentSock) {
        try {
            currentSock.ev.removeAllListeners();
            currentSock.ws?.close();
            currentSock.end?.(undefined);
        } catch (e) {}
        currentSock = null;
        global.sock = null;
    }

    if (!mongoClient) {
        if (!process.env.MONGODB_URI) {
            console.error("No MONGODB_URI found. Exiting...");
            return;
        }
        mongoClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
        await mongoClient.connect();
        collection = mongoClient.db('whatsapp_bot').collection('auth_info');
    }

    // 🛡️ Distributed Single-Leader Guard to prevent duplicate WhatsApp instances across Koyeb & Render
    const db = mongoClient.db('whatsapp_bot');
    const lockCollection = db.collection('bot_settings');
    const myInstanceId = global.MY_INSTANCE_ID || (global.MY_INSTANCE_ID = (process.env.KOYEB_INSTANCE_ID || process.env.RENDER_INSTANCE_ID || os.hostname() + '_' + Math.random().toString(36).slice(2, 8)));
    const now = Date.now();
    const LOCK_TIMEOUT = 18000; // 18 seconds

    // Initial restoration of live download routing & bot toggles from MongoDB
    lockCollection.findOne({ _id: 'download_routing' }).then(doc => {
        if (doc && doc.routing) global.DOWNLOAD_ROUTING = doc.routing;
    }).catch(() => {});
    lockCollection.findOne({ _id: 'bot_toggles' }).then(doc => {
        if (doc) {
            if (typeof doc.autoVoice === 'boolean') global.AUTO_VOICE_ENABLED = doc.autoVoice;
            if (typeof doc.antiBotVerification === 'boolean') global.VERIFICATION_POLL_ENABLED = doc.antiBotVerification;
            console.log('🛡️ [Bot Toggles Restored]:', { autoVoice: global.AUTO_VOICE_ENABLED, antiBotVerification: global.VERIFICATION_POLL_ENABLED });
        }
    }).catch(() => {});
    db.collection('vip_video_users').find().toArray().then(users => {
        if (!global.vipVideoUsersCache) global.vipVideoUsersCache = new Set();
        if (users && users.length) {
            users.forEach(u => {
                if (u._id) global.vipVideoUsersCache.add(String(u._id));
            });
            console.log(`👑 [VIP Users Restored]: ${global.vipVideoUsersCache.size} active VIP users loaded into memory.`);
        }
    }).catch(() => {});

    try {
        const currentLock = await lockCollection.findOne({ _id: 'whatsapp_leader_lock' });
        if (currentLock && currentLock.leaderId !== myInstanceId) {
            const timeSinceLastHeartbeat = now - (currentLock.lastSeen || 0);
            if (timeSinceLastHeartbeat < LOCK_TIMEOUT) {
                console.log(`🛡️ [Session Guard] වෙනත් Instance එකක් (${currentLock.host || currentLock.leaderId}) දැනට WhatsApp සමඟ සම්බන්ධ වී ඇත.`);
                console.log(`⏳ Session Conflict වැළැක්වීම සඳහා මෙම Instance එක Standby mode හි තබන ලදී. තත්පර 12කින් නැවත Check කෙරේ...`);
                if (reconnectTimeout) clearTimeout(reconnectTimeout);
                reconnectTimeout = setTimeout(connectToWA, 12000);
                return;
            }
        }

        // Claim or renew lock
        await lockCollection.updateOne(
            { _id: 'whatsapp_leader_lock' },
            {
                $set: {
                    leaderId: myInstanceId,
                    lastSeen: now,
                    host: process.env.KOYEB_APP_NAME ? `Koyeb (${process.env.KOYEB_APP_NAME})` : (process.env.RENDER_SERVICE_NAME ? `Render (${process.env.RENDER_SERVICE_NAME})` : os.hostname()),
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        if (global.leaderHeartbeatTimer) clearInterval(global.leaderHeartbeatTimer);
        global.leaderHeartbeatTimer = setInterval(async () => {
            try {
                await lockCollection.updateOne(
                    { _id: 'whatsapp_leader_lock', leaderId: myInstanceId },
                    { $set: { lastSeen: Date.now() } }
                );
            } catch(e) {}
        }, 5000);

    } catch (lockErr) {
        console.log('[Leader Lock Warning]:', lockErr.message);
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
        getMessage: async (key) => {
            if (global.activePolls && global.activePolls.has(key.id)) {
                return global.activePolls.get(key.id).message;
            }
            return undefined;
        },
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: true
    });

    currentSock = sock;
    global.sock = sock;
    global.reconnectWA = connectToWA;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("\n📷 QR Code එක පහළින් ඇත. Scan කරන්න! 👇\n");
            require('qrcode-terminal').generate(qr, { small: true });
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = (reason === DisconnectReason.loggedOut || reason === 401);
            const isReplaced = (reason === DisconnectReason.connectionReplaced || reason === 440);

            if (global.liveStatusHeartbeat) {
                clearInterval(global.liveStatusHeartbeat);
                global.liveStatusHeartbeat = null;
            }
            if (global.liveSettingsSyncTimer) {
                clearInterval(global.liveSettingsSyncTimer);
                global.liveSettingsSyncTimer = null;
            }
            lockCollection.updateOne(
                { _id: 'live_bot_status' },
                { $set: { connected: false, lastSeen: Date.now(), updatedAt: new Date() } }
            ).catch(() => {});

            if (isLoggedOut) {
                console.log('❌ Session Logged out. Rescan QR.');
            } else if (isReplaced) {
                if (global.leaderHeartbeatTimer) {
                    clearInterval(global.leaderHeartbeatTimer);
                    global.leaderHeartbeatTimer = null;
                }
                lockCollection.deleteOne({ _id: 'whatsapp_leader_lock', leaderId: myInstanceId }).catch(() => {});

                replaceCount++;
                const delayMs = Math.min(30000, 8000 * replaceCount);
                console.log(`⚠️ Connection Replaced (Reason: 440). වෙනත් ස්ථානයකින් සම්බන්ධ වී ඇත (Session Overlap).`);
                console.log(`⏳ Server එක Exit නොකර, තත්පර ${delayMs / 1000} කින් නැවත Auto-Reconnect කරනු ලැබේ (Attempt #${replaceCount})...`);
                
                if (reconnectTimeout) {
                    clearTimeout(reconnectTimeout);
                    reconnectTimeout = null;
                }
                if (currentSock) {
                    try {
                        currentSock.ev.removeAllListeners();
                        currentSock.ws?.close();
                        currentSock.end?.(undefined);
                    } catch (e) {}
                    currentSock = null;
                    global.sock = null;
                }

                reconnectTimeout = setTimeout(() => {
                    connectToWA().catch(err => console.log('Reconnection Error:', err.message));
                }, delayMs);
            } else {
                console.log(`⚠️ Connection closed (Reason: ${reason || 'unknown'}). Reconnecting in 5s...`);
                if (reconnectTimeout) clearTimeout(reconnectTimeout);
                reconnectTimeout = setTimeout(() => {
                    connectToWA().catch(err => console.log('Reconnection Error:', err));
                }, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            
            // Only reset replaceCount after 25s of stable uninterrupted connection
            if (global.stableConnectionTimer) clearTimeout(global.stableConnectionTimer);
            global.stableConnectionTimer = setTimeout(() => {
                replaceCount = 0;
            }, 25000);

            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }

            // Sync live status with MongoDB for Web Dashboard
            const myNum = sock?.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : null;
            const myName = sock?.user?.name || 'Sew Queen Bot (DMC™ MD)';
            const hostInfo = process.env.KOYEB_APP_NAME ? `Koyeb (${process.env.KOYEB_APP_NAME})` : (process.env.RENDER_SERVICE_NAME ? `Render (${process.env.RENDER_SERVICE_NAME})` : os.hostname());

            const pushLiveStatus = async (isLive = true) => {
                try {
                    await lockCollection.updateOne(
                        { _id: 'live_bot_status' },
                        {
                            $set: {
                                connected: isLive,
                                botNumber: myNum,
                                botName: myName,
                                host: hostInfo,
                                mode: global.BOT_MODE || 'public',
                                uptimeSec: Math.floor(process.uptime()),
                                lastSeen: Date.now(),
                                updatedAt: new Date()
                            }
                        },
                        { upsert: true }
                    );
                } catch (e) {}
            };

            pushLiveStatus(true).catch(() => {});

            if (global.liveStatusHeartbeat) clearInterval(global.liveStatusHeartbeat);
            global.liveStatusHeartbeat = setInterval(() => {
                if (currentSock && currentSock.user) {
                    pushLiveStatus(true).catch(() => {});
                }
            }, 5000);

            // 🔄 Real-Time Multi-Cloud Settings & Queue Sync (every 2.5 seconds)
            if (global.liveSettingsSyncTimer) clearInterval(global.liveSettingsSyncTimer);
            global.liveSettingsSyncTimer = setInterval(async () => {
                try {
                    // 1. Sync Download Routing in Real-Time from Dashboard
                    const routeDoc = await lockCollection.findOne({ _id: 'download_routing' });
                    if (routeDoc && routeDoc.routing) {
                        const newRouting = routeDoc.routing;
                        if (JSON.stringify(global.DOWNLOAD_ROUTING) !== JSON.stringify(newRouting)) {
                            console.log(`📡 [Real-time Sync] Download Routing updated from Web Dashboard:`, newRouting);
                            global.DOWNLOAD_ROUTING = newRouting;
                        }
                    }

                    // 2. Sync Bot Mode (public / private) from Dashboard
                    const mDoc = await lockCollection.findOne({ _id: 'bot_mode' });
                    if (mDoc && mDoc.mode && global.BOT_MODE !== mDoc.mode) {
                        console.log(`📡 [Real-time Sync] Bot Mode updated from Web Dashboard: ${global.BOT_MODE} -> ${mDoc.mode}`);
                        global.BOT_MODE = mDoc.mode;
                    }

                    // 3. Sync Blocked Numbers Cache from Dashboard
                    const blockCol = db.collection('blocked_numbers');
                    const dbBlocks = await blockCol.find({}).toArray();
                    if (!global.blockedUsersCache) global.blockedUsersCache = new Map();
                    const newBlockMap = new Map();
                    dbBlocks.forEach(b => newBlockMap.set(b._id, b.category || 'clz'));
                    if (newBlockMap.size !== global.blockedUsersCache.size) {
                        global.blockedUsersCache = newBlockMap;
                        console.log(`🛡️ [Real-time Sync] Blocked numbers updated from Web Dashboard (${newBlockMap.size} blocked).`);
                    }

                    // 4. Check Manual Reconnect Signal from Dashboard
                    const reconnDoc = await lockCollection.findOne({ _id: 'reconnect_signal' });
                    if (reconnDoc && reconnDoc.requestedAt) {
                        if (!global.lastHandledReconnectTime) {
                            global.lastHandledReconnectTime = reconnDoc.requestedAt;
                        } else if (reconnDoc.requestedAt > global.lastHandledReconnectTime) {
                            global.lastHandledReconnectTime = reconnDoc.requestedAt;
                            console.log(`🔄 [Dashboard Action] Reconnect Signal received from Web Dashboard! Reconnecting...`);
                            if (typeof global.reconnectWA === 'function') {
                                global.reconnectWA().catch(err => console.log('Signal Reconnect Error:', err));
                            }
                        }
                    }

                    // 5. Process Outbox Messages Queued from Web Dashboard
                    if (currentSock && currentSock.user) {
                        const outboxCol = db.collection('whatsapp_outbox');
                        const pendingMessages = await outboxCol.find({ status: 'pending' }).limit(5).toArray();
                        for (const item of pendingMessages) {
                            try {
                                await currentSock.sendMessage(item.jid, { text: item.message });
                                await outboxCol.updateOne({ _id: item._id }, { $set: { status: 'sent', sentAt: new Date() } });
                                console.log(`🚀 [Outbox] Sent message to ${item.jid}`);
                            } catch (sendErr) {
                                await outboxCol.updateOne({ _id: item._id }, { $set: { status: 'failed', error: sendErr.message } });
                            }
                        }

                        // 6. Process Broadcast Messages Queued from Web Dashboard
                        const broadcastCol = db.collection('whatsapp_broadcasts');
                        const pendingBroadcasts = await broadcastCol.find({ status: 'pending' }).limit(1).toArray();
                        for (const bCast of pendingBroadcasts) {
                            try {
                                await broadcastCol.updateOne({ _id: bCast._id }, { $set: { status: 'processing' } });
                                const participatingGroups = await currentSock.groupFetchAllParticipating();
                                const groupList = Object.values(participatingGroups);
                                const broadcastText = `📢 *DMC™ BROADCAST*\n\n${bCast.message.trim()}`;
                                let sent = 0;
                                for (const g of groupList) {
                                    try {
                                        await currentSock.sendMessage(g.id, { text: broadcastText });
                                        sent++;
                                        await new Promise(r => setTimeout(r, 400));
                                    } catch (err) {}
                                }
                                await broadcastCol.updateOne({ _id: bCast._id }, { $set: { status: 'sent', sentCount: sent, sentAt: new Date() } });
                                console.log(`📢 [Broadcast] Broadcasted to ${sent} groups from Dashboard!`);
                            } catch (bErr) {
                                await broadcastCol.updateOne({ _id: bCast._id }, { $set: { status: 'failed', error: bErr.message } });
                            }
                        }
                    }
                } catch (e) {}
            }, 2500);
            
            if (!pluginsLoaded) {
                loadAllPlugins();
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

                
                console.log("[POLL DEBUG] Received poll update for message ID:", msg.key.id);
                console.log("[POLL DEBUG] RAW Poll Update:", JSON.stringify(pollUpdate));


                try {
                    const pollMsg = global.activePolls.get(msg.key.id);
                    
                    if (!pollMsg) {
                        console.log("[POLL DEBUG] Error: pollMsg not found in activePolls cache for id", msg.key.id);
                        continue;
                    }
                    console.log("[POLL DEBUG] Found pollMsg in cache.");
 // Ignore if we didn't cache the poll

                    const vote = getAggregateVotesInPollMessage({
                        message: pollMsg.message,
                        pollUpdates: [pollUpdate]
                    });

                    
                    console.log("[POLL DEBUG] Decrypted vote aggregate:", JSON.stringify(vote));
                    const selectedOption = vote.find(v => v.voters.length > 0)?.name;
                    console.log("[POLL DEBUG] Selected option:", selectedOption);

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
            // Removed fromMe block so owner can use commands on bot number

            // ?? V7 POLL UPDATE FIX
            if (mek.message.pollUpdateMessage) {
                console.log("[POLL DEBUG] UPSERT pollUpdateMessage received!");
                const creationMsgKey = mek.message.pollUpdateMessage.pollCreationMessageKey;
                const pollMsgInfo = global.activePolls ? global.activePolls.get(creationMsgKey.id) : null;
                if (pollMsgInfo) {
                    try {
                        const { decryptPollVote } = require('@whiskeysockets/baileys/lib/Utils/process-message');
                        
                        
                        const { jidNormalizedUser } = require('@whiskeysockets/baileys/lib/WABinary/jid-utils');
                        const { getKeyAuthor } = require('@whiskeysockets/baileys/lib/Utils/generics');
                        const meIdNormalised = jidNormalizedUser(sock.user.id);
                        const pollCreatorJid = getKeyAuthor(creationMsgKey, meIdNormalised);

                        
                        const voterJid = getKeyAuthor(mek.key, meIdNormalised);

                        const pollEncKey = pollMsgInfo.message.messageContextInfo?.messageSecret;
console.log("[POLL DEBUG] DUMP:", {
    pollCreatorJid,
    pollMsgId: creationMsgKey.id,
    voterJid,
    pollEncKeyType: typeof pollEncKey,
    pollEncKeyLength: pollEncKey ? pollEncKey.length : 0,
    isBuffer: Buffer.isBuffer(pollEncKey),
    isUint8Array: pollEncKey instanceof Uint8Array
});
                        
                        let voteMsg;
                                                let realPn = null;
                        try {
                            if (voterJid && voterJid.includes('@lid') && sock.signalRepository?.lidMapping?.getPNForLID) {
                                realPn = await sock.signalRepository.lidMapping.getPNForLID(voterJid);
                                
                                console.log("[POLL DEBUG] Found Real PN for LID:", realPn);
                            } else {
                                console.log("[POLL DEBUG] getPNForLID returned null or missing for", voterJid);
                              }
                          } catch(e) {}
                        
                        const possibleVoters = [voterJid, realPn, voterJid.replace('@lid', '@s.whatsapp.net'), mek.key.remoteJid, mek.key.participant].filter(Boolean);
                        const possibleCreators = [pollCreatorJid, pollCreatorJid.replace('@s.whatsapp.net', '@lid'), pollCreatorJid.replace('@s.whatsapp.net', '@c.us')];
                        
                        let decrypted = false;
                        for (const cJid of possibleCreators) {
                            for (const vJid of possibleVoters) {
                                try {
                                    voteMsg = decryptPollVote(
                                        mek.message.pollUpdateMessage.vote,
                                        { pollEncKey, pollCreatorJid: cJid, pollMsgId: creationMsgKey.id, voterJid: vJid }
                                    );
                                    decrypted = true;
                                    console.log("[POLL DEBUG] Successfully decrypted with creator:", cJid, "voter:", vJid);
                                    break;
                                } catch(e) {}
                            }
                            if (decrypted) break;
                        }
                        
                        if (!decrypted) {
                            throw new Error("All decryption attempts failed");
                        }
                        console.log("[POLL DEBUG] Decrypted Vote:", JSON.stringify(voteMsg));
                        
                        const voteAggregate = getAggregateVotesInPollMessage({
                            message: pollMsgInfo.message,
                            pollUpdates: [{
                                pollUpdateMessageKey: mek.key,
                                vote: voteMsg
                            }]
                        });
                        console.log("[POLL DEBUG] Vote Aggregate:", JSON.stringify(voteAggregate));
                        
                        const selectedOption = voteAggregate.find(v => v.voters.length > 0)?.name;
                        console.log("[POLL DEBUG] Selected:", selectedOption);
                        
                        if (selectedOption && global.processPollVote) {
                            global.processPollVote(voterJid, selectedOption, sock).catch(console.error);
                        }
                    } catch(err) {
                        console.log("[POLL DEBUG] Error decrypting:", err);
                    }
                } else {
                    console.log("[POLL DEBUG] Poll creation message not in activePolls cache");
                }
                return;
            }

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
            const isOwner = mek.key.fromMe || config.OWNER_NUMBER.includes((mek.key.participant || mek.key.remoteJid || '').split('@')[0]);
            const sender = mek.key.participant || mek.key.remoteJid;
            const isGroup = from.endsWith('@g.us');

            const reply = (text) => {
                sock.sendMessage(from, { text: text }, { quoted: mek });
            };

            if (global.BOT_MODE === "private" && !isOwner) return;
            if (global.blockedUsersCache && global.blockedUsersCache.has(sender) && !isOwner) {
                console.log(`🚫 [Blocked User Ignored] Command from ${sender} dropped.`);
                return;
            }

            

            if (isCmd) {
                const cmd = commands.find((c) => c.pattern === command || (c.alias && c.alias.includes(command)));
                if (cmd) {
                    try {
                        await cmd.function(sock, mek, m, { from, q, reply, args, isOwner, isGroup, body, sender, command });
                    } catch (cmdErr) {
                        console.error(`❌ [Command Error: .${command}]:`, cmdErr?.message || cmdErr);
                        try {
                            reply(`❌ *විධානය ක්‍රියාත්මක කිරීමේදී දෝෂයක් සිදු විය: ${cmdErr?.message || 'අඥාත දෝෂයක්'}*`);
                        } catch (e) {}
                    }
                }
            }

            commands.map(async (command) => {
                if (command.on === "body") {
                    try {
                        if (global.BOT_MODE === "private" && !isOwner) return;
                        await command.function(sock, mek, m, { from, body, isOwner, isGroup, reply, sender });
                    } catch(err) { console.log('Plugin Body Error:', err); }
                }
            });
        } catch (e) {
            console.log('Error in messages.upsert:', e);
        }
    });
}

const isWebOnly = process.env.WEB_ONLY === 'true' || process.env.DISABLE_WHATSAPP === 'true';

if (isWebOnly) {
    console.log("🌐 [WEB_ONLY Mode]: Running Web Server & Admin Dashboard ONLY. WhatsApp connection is disabled on this instance to prevent session conflict.");
} else {
    connectToWA().catch(err => console.log('Unexpected Error:', err));
}


process.on('SIGTERM', async () => {
    console.log('SIGTERM received: Shutting down gracefully...');
    try {
        if (mongoClient && global.MY_INSTANCE_ID) {
            await mongoClient.db('whatsapp_bot').collection('bot_settings').deleteOne({
                _id: 'whatsapp_leader_lock',
                leaderId: global.MY_INSTANCE_ID
            });
        }
    } catch(e) {}
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received: Shutting down gracefully...');
    process.exit(0);
});
