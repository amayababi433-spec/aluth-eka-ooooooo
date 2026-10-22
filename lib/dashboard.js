const express = require('express');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

// Secret key for signing session tokens
const SESSION_SECRET = process.env.ADMIN_SECRET || 'dmc_admin_secret_787898_pasindu';
const ADMIN_USERNAME = 'pasindu';
const ADMIN_PASSWORD = '787898';

let dbClient = null;
let modeCollection = null;
let blockCollection = null;

// Initialize Global Download Routing State
if (!global.DOWNLOAD_ROUTING) {
    global.DOWNLOAD_ROUTING = {
        yt: 'auto',       // 'azure' | 'github' | 'auto'
        terabox: 'auto',  // 'azure' | 'github' | 'auto'
        all: 'auto'       // 'azure' | 'github' | 'auto'
    };
}

// Initialize Global Bot Feature Toggles State (Auto Voice & Anti-Bot Verification Poll)
if (global.AUTO_VOICE_ENABLED === undefined) global.AUTO_VOICE_ENABLED = (process.env.AUTO_VOICE !== 'false');
if (global.VERIFICATION_POLL_ENABLED === undefined) global.VERIFICATION_POLL_ENABLED = true;

const PRIMARY_AZURE_BASE = 'https://copyright-handled-todd-latter.trycloudflare.com';
let cachedGithubBase = 'https://condos-server-conditional-luke.trycloudflare.com';
let lastGithubFetch = 0;

async function getLiveGithubBase() {
    if (Date.now() - lastGithubFetch < 60000 && cachedGithubBase) {
        return cachedGithubBase;
    }
    try {
        const axios = require('axios');
        const res = await axios.get('https://raw.githubusercontent.com/dimdtu0-cell/dmc-backup-api/main/api_url.txt?t=' + Date.now(), { timeout: 4000 });
        if (res.data && res.data.trim().startsWith('https://')) {
            cachedGithubBase = res.data.trim().replace(/\/$/, '');
            lastGithubFetch = Date.now();
        }
    } catch (e) {}
    return cachedGithubBase;
}

// Category emojis mapping as in menu.js
const CATEGORY_EMOJIS = {
    downloader: "⬇️",
    ai: "🤖",
    main: "ℹ️",
    group: "👥",
    owner: "👑",
    fun: "😂",
    logo: "🎨",
    editor: "🎬",
    converter: "🔄",
    search: "🔍",
    sticker: "🏷️",
    tools: "🛠️",
    misc: "🛠️",
    other: "👻"
};

// Ensure all bot plugins are loaded
function ensurePluginsLoaded() {
    const { commands } = require('../command');
    if (commands && commands.length > 0) return commands;
    const pluginsDir = path.join(__dirname, '../plugins');
    if (fs.existsSync(pluginsDir)) {
        const plugins = fs.readdirSync(pluginsDir);
        plugins.forEach(file => {
            if (path.extname(file).toLowerCase() === '.js') {
                try {
                    require(path.join(pluginsDir, file));
                } catch (e) {}
            }
        });
    }
    return require('../command').commands;
}

let authCollection = null;

// Safe MongoDB helper
async function getMongoCollections() {
    if (!process.env.MONGODB_URI) return null;
    if (modeCollection && blockCollection && authCollection) return { modeCollection, blockCollection, authCollection, dbClient };
    try {
        if (!dbClient) {
            dbClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
            await dbClient.connect();
        }
        const db = dbClient.db('whatsapp_bot');
        modeCollection = db.collection('bot_settings');
        blockCollection = db.collection('blocked_numbers');
        authCollection = db.collection('auth_info');

        // Restore download routing from DB
        modeCollection.findOne({ _id: 'download_routing' }).then(doc => {
            if (doc && doc.routing) {
                global.DOWNLOAD_ROUTING = { ...global.DOWNLOAD_ROUTING, ...doc.routing };
                console.log('📡 [Dashboard] Restored download routing from MongoDB:', global.DOWNLOAD_ROUTING);
            }
        }).catch(() => {});

        // Restore bot toggles from DB
        modeCollection.findOne({ _id: 'bot_toggles' }).then(doc => {
            if (doc) {
                if (typeof doc.autoVoice === 'boolean') global.AUTO_VOICE_ENABLED = doc.autoVoice;
                if (typeof doc.antiBotVerification === 'boolean') global.VERIFICATION_POLL_ENABLED = doc.antiBotVerification;
                console.log('🛡️ [Dashboard] Restored bot toggles from MongoDB:', {
                    autoVoice: global.AUTO_VOICE_ENABLED,
                    antiBotVerification: global.VERIFICATION_POLL_ENABLED
                });
            }
        }).catch(() => {});

        return { modeCollection, blockCollection, authCollection, dbClient };
    } catch (e) {
        console.log('[Dashboard DB Warning]:', e.message);
        return null;
    }
}

// Format uptime helper
function fmtUptime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const d = Math.floor(sec / 86400); sec %= 86400;
    const h = Math.floor(sec / 3600); sec %= 3600;
    const m = Math.floor(sec / 60); const s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
}

// Token creation (30-day valid signed token)
function generateToken(user) {
    const payload = Buffer.from(JSON.stringify({
        user: user,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

// Token verification
function verifyToken(token) {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (signature !== expectedSig) return false;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (data.exp && Date.now() > data.exp) return false;
        if (data.user !== ADMIN_USERNAME) return false;
        return data;
    } catch {
        return false;
    }
}

// Auth middleware for protected APIs
function requireAuth(req, res, next) {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else if (req.headers['x-admin-token']) {
        token = req.headers['x-admin-token'];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    const verified = verifyToken(token);
    if (!verified) {
        return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
    }
    req.adminUser = verified.user;
    next();
}

function setupDashboard(app) {
    // Enable JSON parsing
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Koyeb & ping service health checks
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
    });

    // 1. Verify token endpoint
    app.get('/api/verify', (req, res) => {
        const authHeader = req.headers['authorization'];
        let token = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else if (req.headers['x-admin-token']) {
            token = req.headers['x-admin-token'];
        }
        const verified = verifyToken(token);
        if (verified) {
            return res.json({ success: true, user: verified.user });
        }
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
    });

    // 2. Login endpoint
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body || {};
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            const token = generateToken(ADMIN_USERNAME);
            return res.json({
                success: true,
                token,
                user: ADMIN_USERNAME,
                message: 'Login successful'
            });
        }
        return res.status(401).json({
            success: false,
            error: 'වැරදි පරිශීලක නාමයක් හෝ මුරපදයක් (Invalid Username or Password)'
        });
    });

    // 3. Status endpoint (Public/Lightweight for header counters)
    app.get('/api/status', async (req, res) => {
        const mem = process.memoryUsage();
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
        const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
        const totalMemMB = (os.totalmem() / 1024 / 1024).toFixed(1);

        const sock = global.sock;
        let isConnected = Boolean(sock && sock.user && sock.user.id);
        let botNumber = sock?.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : null;
        let botName = sock?.user?.name || 'Sew Queen Bot (DMC™ MD)';
        let botHost = process.env.KOYEB_APP_NAME ? `Koyeb (${process.env.KOYEB_APP_NAME})` : (process.env.RENDER_SERVICE_NAME ? `Render (${process.env.RENDER_SERVICE_NAME})` : os.hostname());
        let currentMode = global.BOT_MODE || 'public';
        let botUptimeSec = Math.floor(process.uptime());

        // Multi-cloud sync: If local socket is not active (e.g. Render dashboard while Koyeb runs WhatsApp worker)
        try {
            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                // 1. Sync Bot Mode
                const modeDoc = await cols.modeCollection.findOne({ _id: 'bot_mode' }).catch(() => null);
                if (modeDoc && modeDoc.mode) {
                    currentMode = modeDoc.mode;
                    global.BOT_MODE = modeDoc.mode;
                }

                // 2. Check Live Bot Status if local socket is null/offline
                if (!isConnected) {
                    const liveDoc = await cols.modeCollection.findOne({ _id: 'live_bot_status' }).catch(() => null);
                    if (liveDoc && liveDoc.connected && (Date.now() - (liveDoc.lastSeen || 0) < 30000)) {
                        isConnected = true;
                        botNumber = liveDoc.botNumber || botNumber;
                        botName = liveDoc.botName || botName;
                        if (liveDoc.host) botHost = liveDoc.host;
                        if (liveDoc.uptimeSec) botUptimeSec = liveDoc.uptimeSec;
                    } else {
                        // Fallback: Check active whatsapp_leader_lock + auth_info creds
                        const lockDoc = await cols.modeCollection.findOne({ _id: 'whatsapp_leader_lock' }).catch(() => null);
                        if (lockDoc && (Date.now() - (lockDoc.lastSeen || 0) < 25000)) {
                            isConnected = true;
                            if (lockDoc.host) botHost = lockDoc.host;
                            const authCol = cols.authCollection;
                            if (authCol) {
                                const credsDoc = await authCol.findOne({ _id: 'creds' }).catch(() => null);
                                const me = credsDoc?.data?.me || credsDoc?.me;
                                if (me?.id) {
                                    botNumber = me.id.split(':')[0].replace(/[^0-9]/g, '');
                                    if (me.name) botName = me.name;
                                }
                            }
                        }
                    }
                }
            }
        } catch (dbErr) {
            console.log('[Dashboard DB Sync Warning]:', dbErr.message);
        }

        const commands = ensurePluginsLoaded();
        const totalCommands = commands ? commands.length : 0;
        let blockedCount = global.blockedUsersCache ? global.blockedUsersCache.size : 0;

        if (blockedCount === 0) {
            try {
                const cols = await getMongoCollections();
                if (cols?.blockCollection) {
                    blockedCount = await cols.blockCollection.countDocuments().catch(() => 0);
                }
            } catch (e) {}
        }

        res.json({
            success: true,
            botName,
            connected: isConnected,
            botNumber,
            botHost,
            mode: currentMode,
            uptimeSec: botUptimeSec,
            uptimeFmt: fmtUptime(botUptimeSec),
            ram: {
                heapUsedMB,
                heapTotalMB,
                rssMB,
                totalMemMB,
                percent: Math.min(100, Math.round((mem.heapUsed / os.totalmem()) * 100))
            },
            totalCommands,
            blockedUsersCount: blockedCount,
            platform: `${os.platform()} (${os.arch()})`,
            nodeVersion: process.version,
            toggles: {
                autoVoice: global.AUTO_VOICE_ENABLED !== false,
                antiBotVerification: global.VERIFICATION_POLL_ENABLED !== false
            }
        });
    });

    // 4. Commands list endpoint (Categorized & Filtered)
    app.get('/api/commands', (req, res) => {
        try {
            const commands = ensurePluginsLoaded();
            const categoryMap = {};

            (commands || []).forEach(cmdObj => {
                const pattern = cmdObj.pattern || cmdObj.command || cmdObj.name || '';
                if (!pattern) return;

                let category = (cmdObj.category || 'other').toLowerCase();
                if (category === 'conventer') category = 'converter';
                if (category === 'stickers') category = 'sticker';
                if (category === 'download') category = 'downloader';
                if (category === 'misc') category = 'tools';

                if (!categoryMap[category]) {
                    categoryMap[category] = {
                        name: category,
                        emoji: CATEGORY_EMOJIS[category] || '🔹',
                        commands: []
                    };
                }

                categoryMap[category].commands.push({
                    pattern: String(pattern),
                    alias: Array.isArray(cmdObj.alias) ? cmdObj.alias : (cmdObj.alias ? [cmdObj.alias] : []),
                    desc: cmdObj.desc || '',
                    category: category,
                    emoji: CATEGORY_EMOJIS[category] || '🔹',
                    fromMe: Boolean(cmdObj.fromMe),
                    isOwner: category === 'owner' || Boolean(cmdObj.fromMe)
                });
            });

            // Sort categories and commands alphabetically
            const categories = Object.keys(categoryMap).sort().map(k => {
                categoryMap[k].commands.sort((a, b) => a.pattern.localeCompare(b.pattern));
                return categoryMap[k];
            });

            const total = categories.reduce((sum, c) => sum + c.commands.length, 0);

            res.json({
                success: true,
                total,
                categories
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 5. Blocked users list endpoint (Protected)
    app.get('/api/owner/blocks', requireAuth, async (req, res) => {
        try {
            const list = [];
            const cols = await getMongoCollections();
            if (cols?.blockCollection) {
                const dbBlocks = await cols.blockCollection.find().toArray().catch(() => []);
                if (dbBlocks && dbBlocks.length > 0) {
                    if (!global.blockedUsersCache) global.blockedUsersCache = new Map();
                    dbBlocks.forEach(b => {
                        const jid = b._id;
                        const cat = b.category || 'BLOCKED';
                        global.blockedUsersCache.set(jid, cat);
                        list.push({
                            jid,
                            number: jid.split('@')[0],
                            category: cat.toUpperCase()
                        });
                    });
                }
            }
            if (list.length === 0 && global.blockedUsersCache) {
                global.blockedUsersCache.forEach((cat, jid) => {
                    list.push({
                        jid,
                        number: jid.split('@')[0],
                        category: (cat || 'BLOCKED').toUpperCase()
                    });
                });
            }
            res.json({ success: true, list, total: list.length });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 6. Change Bot Mode (Protected)
    app.post('/api/owner/mode', requireAuth, async (req, res) => {
        const { mode } = req.body || {};
        if (mode !== 'public' && mode !== 'private') {
            return res.status(400).json({ success: false, error: 'Invalid mode. Use "public" or "private".' });
        }

        global.BOT_MODE = mode;

        try {
            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                await cols.modeCollection.updateOne(
                    { _id: 'bot_mode' },
                    { $set: { mode } },
                    { upsert: true }
                );
            }
        } catch (e) {
            console.log('[Dashboard Mode DB Error]:', e.message);
        }

        res.json({
            success: true,
            mode: global.BOT_MODE,
            message: `Bot mode successfully set to ${mode.toUpperCase()}!`
        });
    });

    // 7. Send Direct WhatsApp Message (Protected)
    app.post('/api/owner/send', requireAuth, async (req, res) => {
        const { target, message } = req.body || {};
        if (!target || !message) {
            return res.status(400).json({ success: false, error: 'Target number and message are required.' });
        }

        let jid = target.trim();
        if (!jid.includes('@')) {
            let cleanNumber = jid.replace(/[^0-9]/g, '');
            if (cleanNumber.startsWith('0')) cleanNumber = '94' + cleanNumber.substring(1);
            jid = cleanNumber + '@s.whatsapp.net';
        }

        const sock = global.sock;
        if (sock && sock.user) {
            try {
                await sock.sendMessage(jid, { text: message.trim() });
                return res.json({ success: true, target: jid, message: 'Message sent successfully!' });
            } catch (e) {
                return res.status(500).json({ success: false, error: e.message });
            }
        }

        // Multi-cloud fallback: If Render web dashboard doesn't have local socket, queue into MongoDB outbox
        try {
            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                const liveDoc = await cols.modeCollection.findOne({ _id: 'live_bot_status' }).catch(() => null);
                const lockDoc = await cols.modeCollection.findOne({ _id: 'whatsapp_leader_lock' }).catch(() => null);
                const isOnline = Boolean((liveDoc && liveDoc.connected && Date.now() - (liveDoc.lastSeen || 0) < 30000) ||
                                         (lockDoc && Date.now() - (lockDoc.lastSeen || 0) < 25000));

                if (!isOnline) {
                    return res.status(503).json({ success: false, error: 'WhatsApp bot is currently offline on all workers.' });
                }

                const outboxCol = cols.dbClient.db('whatsapp_bot').collection('whatsapp_outbox');
                await outboxCol.insertOne({
                    jid,
                    message: message.trim(),
                    status: 'pending',
                    createdAt: new Date()
                });
                return res.json({ success: true, target: jid, message: 'Message queued and dispatched to active bot worker!' });
            }
        } catch (outboxErr) {
            return res.status(500).json({ success: false, error: outboxErr.message });
        }

        return res.status(503).json({ success: false, error: 'WhatsApp bot is currently offline/connecting.' });
    });

    // 8. Broadcast to Groups (Protected)
    app.post('/api/owner/broadcast', requireAuth, async (req, res) => {
        const { message } = req.body || {};
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, error: 'Broadcast message cannot be empty.' });
        }

        const sock = global.sock;
        if (sock && sock.user) {
            try {
                const participatingGroups = await sock.groupFetchAllParticipating();
                const groupList = Object.values(participatingGroups);

                if (groupList.length === 0) {
                    return res.json({ success: true, count: 0, message: 'Bot is not in any groups.' });
                }

                // Run async batching with 400ms delay to prevent rate limit
                let sentCount = 0;
                const broadcastText = `📢 *DMC™ BROADCAST*\n\n${message.trim()}`;

                for (const g of groupList) {
                    try {
                        await sock.sendMessage(g.id, { text: broadcastText });
                        sentCount++;
                        await new Promise(r => setTimeout(r, 400));
                    } catch (err) {
                        console.log(`Failed broadcast to ${g.id}:`, err.message);
                    }
                }

                return res.json({
                    success: true,
                    count: sentCount,
                    totalGroups: groupList.length,
                    message: `Broadcast successfully sent to ${sentCount} groups!`
                });
            } catch (e) {
                return res.status(500).json({ success: false, error: e.message });
            }
        }

        // Multi-cloud fallback: Queue into MongoDB whatsapp_broadcasts for active Koyeb worker
        try {
            const cols = await getMongoCollections();
            if (cols?.dbClient) {
                const liveDoc = await cols.modeCollection.findOne({ _id: 'live_bot_status' }).catch(() => null);
                const lockDoc = await cols.modeCollection.findOne({ _id: 'whatsapp_leader_lock' }).catch(() => null);
                const isOnline = Boolean((liveDoc && liveDoc.connected && Date.now() - (liveDoc.lastSeen || 0) < 30000) ||
                                         (lockDoc && Date.now() - (lockDoc.lastSeen || 0) < 25000));
                if (!isOnline) {
                    return res.status(503).json({ success: false, error: 'WhatsApp bot is currently offline on all workers.' });
                }

                const bCol = cols.dbClient.db('whatsapp_bot').collection('whatsapp_broadcasts');
                await bCol.insertOne({
                    message: message.trim(),
                    status: 'pending',
                    createdAt: new Date()
                });
                return res.json({ success: true, message: 'Broadcast queued and dispatched to active bot worker!' });
            }
        } catch (bErr) {
            return res.status(500).json({ success: false, error: bErr.message });
        }

        return res.status(503).json({ success: false, error: 'WhatsApp bot is currently offline/connecting.' });
    });

    // 9. Block number (Protected)
    app.post('/api/owner/block', requireAuth, async (req, res) => {
        let { number, category } = req.body || {};
        if (!number) return res.status(400).json({ success: false, error: 'Phone number is required.' });

        category = (category || 'clz').toLowerCase();
        let cleanNumber = number.replace(/[^0-9]/g, '');
        if (cleanNumber.startsWith('0')) cleanNumber = '94' + cleanNumber.substring(1);
        const jid = cleanNumber + '@s.whatsapp.net';

        if (!global.blockedUsersCache) global.blockedUsersCache = new Map();
        global.blockedUsersCache.set(jid, category);

        try {
            const cols = await getMongoCollections();
            if (cols?.blockCollection) {
                await cols.blockCollection.updateOne(
                    { _id: jid },
                    { $set: { category } },
                    { upsert: true }
                );
            }
        } catch (e) {
            console.log('[Dashboard Block DB Error]:', e.message);
        }

        res.json({ success: true, number: cleanNumber, category, message: `Number ${cleanNumber} blocked as ${category.toUpperCase()}!` });
    });

    // 10. Unblock number (Protected)
    app.post('/api/owner/unblock', requireAuth, async (req, res) => {
        const { target } = req.body || {};
        if (!target) return res.status(400).json({ success: false, error: 'Target number or "all" is required.' });

        try {
            const cols = await getMongoCollections();

            if (target.toLowerCase() === 'all') {
                if (global.blockedUsersCache) global.blockedUsersCache.clear();
                if (cols?.blockCollection) {
                    await cols.blockCollection.deleteMany({});
                }
                return res.json({ success: true, message: 'All blocked numbers removed!' });
            }

            let cleanNumber = target.replace(/[^0-9]/g, '');
            if (cleanNumber.startsWith('0')) cleanNumber = '94' + cleanNumber.substring(1);
            const jid = cleanNumber + '@s.whatsapp.net';

            if (global.blockedUsersCache) global.blockedUsersCache.delete(jid);
            if (cols?.blockCollection) {
                await cols.blockCollection.deleteOne({ _id: jid });
            }

            res.json({ success: true, number: cleanNumber, message: `Number ${cleanNumber} unblocked successfully!` });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 11. Reconnect WhatsApp (Protected)
    app.post('/api/owner/reconnect', requireAuth, async (req, res) => {
        try {
            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                await cols.modeCollection.updateOne(
                    { _id: 'reconnect_signal' },
                    { $set: { requestedAt: Date.now() } },
                    { upsert: true }
                );
            }
        } catch (e) {
            console.log('[Reconnect DB Signal Warning]:', e.message);
        }

        if (typeof global.reconnectWA === 'function') {
            global.reconnectWA().catch(err => console.log('Manual Reconnect Error:', err));
            return res.json({ success: true, message: 'Reconnection triggered! Checking connection...' });
        }
        res.json({ success: true, message: 'Reconnect signal dispatched to active WhatsApp worker!' });
    });

    // 12. Get Download Server Routing & Live Server Status
    app.get('/api/download-server', async (req, res) => {
        try {
            const githubUrl = await getLiveGithubBase();
            res.json({
                success: true,
                routing: global.DOWNLOAD_ROUTING || { yt: 'auto', terabox: 'auto', all: 'auto' },
                servers: {
                    azure: {
                        name: "Azure Cloud Server",
                        url: PRIMARY_AZURE_BASE,
                        speed: "6.9s",
                        status: "online"
                    },
                    github: {
                        name: "GitHub Actions Backup",
                        url: githubUrl,
                        speed: "10.2s",
                        status: "online"
                    }
                }
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 13. Update Download Server Routing (Protected)
    app.post('/api/download-server', requireAuth, async (req, res) => {
        const { category, server } = req.body || {};
        if (!category || !server) {
            return res.status(400).json({ success: false, error: 'Category and server are required' });
        }
        if (!['yt', 'terabox', 'all'].includes(category)) {
            return res.status(400).json({ success: false, error: 'Invalid category: use yt, terabox, or all' });
        }
        if (!['azure', 'github', 'auto'].includes(server)) {
            return res.status(400).json({ success: false, error: 'Invalid server: use azure, github, or auto' });
        }

        if (!global.DOWNLOAD_ROUTING) {
            global.DOWNLOAD_ROUTING = { yt: 'auto', terabox: 'auto', all: 'auto' };
        }
        global.DOWNLOAD_ROUTING[category] = server;

        if (category === 'all') {
            global.DOWNLOAD_ROUTING.all = server;
            global.DOWNLOAD_ROUTING.yt = server;
            global.DOWNLOAD_ROUTING.terabox = server;
        }

        try {
            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                await cols.modeCollection.updateOne(
                    { _id: 'download_routing' },
                    { $set: { routing: global.DOWNLOAD_ROUTING, updatedAt: new Date() } },
                    { upsert: true }
                );
            }
        } catch (dbErr) {
            console.log('[Routing DB Save Error]:', dbErr.message);
        }

        console.log(`📡 [Download Server Routing Updated] Category: ${category} ──► Server: ${server.toUpperCase()}`);
        res.json({
            success: true,
            routing: global.DOWNLOAD_ROUTING,
            message: `Successfully set ${category.toUpperCase()} downloads to ${server.toUpperCase()} mode!`
        });
    });

    // 14. Live Latency Ping Test
    app.post('/api/download-server/ping', async (req, res) => {
        const axios = require('axios');
        const results = { azure: null, github: null };

        try {
            const t0 = Date.now();
            await axios.get(PRIMARY_AZURE_BASE + '/api/info?url=https://www.youtube.com/watch?v=kJQP7kiw5Fk&type=video', { timeout: 15000 });
            results.azure = { status: 'online', latency: ((Date.now() - t0) / 1000).toFixed(2) + 's' };
        } catch (e) {
            results.azure = { status: 'offline', error: e.message };
        }

        try {
            const ghBase = await getLiveGithubBase();
            const t0 = Date.now();
            await axios.get(ghBase + '/api/info?url=https://www.youtube.com/watch?v=kJQP7kiw5Fk&type=video', { timeout: 20000 });
            results.github = { status: 'online', latency: ((Date.now() - t0) / 1000).toFixed(2) + 's' };
        } catch (e) {
            results.github = { status: 'offline', error: e.message };
        }

        res.json({ success: true, results });
    });

    // 15. Get Bot Feature Toggles (Auto Voice & Anti-Bot Verification Poll)
    app.get('/api/bot-toggles', async (req, res) => {
        try {
            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                const doc = await cols.modeCollection.findOne({ _id: 'bot_toggles' }).catch(() => null);
                if (doc) {
                    if (typeof doc.autoVoice === 'boolean') global.AUTO_VOICE_ENABLED = doc.autoVoice;
                    if (typeof doc.antiBotVerification === 'boolean') global.VERIFICATION_POLL_ENABLED = doc.antiBotVerification;
                }
            }
        } catch (e) {
            console.log('[Get Bot Toggles Warning]:', e.message);
        }

        res.json({
            success: true,
            autoVoice: global.AUTO_VOICE_ENABLED !== false,
            antiBotVerification: global.VERIFICATION_POLL_ENABLED !== false
        });
    });

    // 16. Update Bot Feature Toggles (Protected)
    app.post('/api/bot-toggles', requireAuth, async (req, res) => {
        const { feature, enabled, autoVoice, antiBotVerification } = req.body || {};

        if (feature === 'autoVoice' && typeof enabled === 'boolean') {
            global.AUTO_VOICE_ENABLED = enabled;
        } else if (feature === 'antiBotVerification' && typeof enabled === 'boolean') {
            global.VERIFICATION_POLL_ENABLED = enabled;
        } else {
            if (typeof autoVoice === 'boolean') global.AUTO_VOICE_ENABLED = autoVoice;
            if (typeof antiBotVerification === 'boolean') global.VERIFICATION_POLL_ENABLED = antiBotVerification;
        }

        const currentToggles = {
            autoVoice: global.AUTO_VOICE_ENABLED !== false,
            antiBotVerification: global.VERIFICATION_POLL_ENABLED !== false
        };

        try {
            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                await cols.modeCollection.updateOne(
                    { _id: 'bot_toggles' },
                    {
                        $set: {
                            ...currentToggles,
                            updatedAt: new Date()
                        }
                    },
                    { upsert: true }
                );
            }
        } catch (dbErr) {
            console.log('[Bot Toggles Save Error]:', dbErr.message);
        }

        console.log(`🛡️ [Bot Toggles Updated] Auto Voice: ${currentToggles.autoVoice} | Anti-Bot Verification: ${currentToggles.antiBotVerification}`);

        res.json({
            success: true,
            ...currentToggles,
            message: 'Bot feature switches updated and saved successfully!'
        });
    });

    // 17. Main Web Interface (Serves the interactive single-page app)
    const htmlFilePath = path.join(__dirname, 'dashboard.html');
    let cachedHtml = null;

    app.get(['/', '/dashboard', '/admin'], (req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        try {
            if (!cachedHtml || process.env.NODE_ENV === 'development') {
                cachedHtml = fs.readFileSync(htmlFilePath, 'utf8');
            }
            res.status(200).send(cachedHtml);
        } catch (err) {
            res.status(200).send(`<!DOCTYPE html><html><body><h2>Sew Queen Bot Running</h2><p>${err.message}</p></body></html>`);
        }
    });
}

module.exports = {
    setupDashboard,
    ADMIN_USERNAME,
    ADMIN_PASSWORD
};
