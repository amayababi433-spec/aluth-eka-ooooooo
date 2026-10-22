const express = require('express');
const axios = require('axios');
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
if (global.VERIFICATION_POLL_ENABLED === undefined) global.VERIFICATION_POLL_ENABLED = false;

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
    } catch (e) { }
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
                } catch (e) { }
            }
        });
    }
    return require('../command').commands;
}

let authCollection = null;
let vipCollection = null;
let telegramCollection = null;

if (!global.vipVideoUsersCache) global.vipVideoUsersCache = new Set();
if (!global.telegramConfig) global.telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '8870659304:AAE7CJ4B02IoMHiDBxfvVOkmPmy1JNu7aw8',
    channelId: process.env.TELEGRAM_CHANNEL_ID || '',
    lastSync: 0
};
if (!global.vipVideoCatalog) global.vipVideoCatalog = [];

// Safe MongoDB helper
async function getMongoCollections() {
    if (!process.env.MONGODB_URI) return null;
    if (modeCollection && blockCollection && authCollection && vipCollection && telegramCollection) {
        return { modeCollection, blockCollection, authCollection, vipCollection, telegramCollection, dbClient };
    }
    try {
        if (!dbClient) {
            dbClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
            await dbClient.connect();
        }
        const db = dbClient.db('whatsapp_bot');
        modeCollection = db.collection('bot_settings');
        blockCollection = db.collection('blocked_numbers');
        authCollection = db.collection('auth_info');
        vipCollection = db.collection('vip_video_users');
        telegramCollection = db.collection('telegram_videos');

        // Restore download routing from DB
        modeCollection.findOne({ _id: 'download_routing' }).then(doc => {
            if (doc && doc.routing) {
                global.DOWNLOAD_ROUTING = { ...global.DOWNLOAD_ROUTING, ...doc.routing };
                console.log('📡 [Dashboard] Restored download routing from MongoDB:', global.DOWNLOAD_ROUTING);
            }
        }).catch(() => { });

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
        }).catch(() => { });

        // Restore VIP video users from DB
        vipCollection.find().toArray().then(users => {
            if (users && users.length) {
                users.forEach(u => global.vipVideoUsersCache.add(u._id));
                console.log(`👑 [Dashboard] Restored ${global.vipVideoUsersCache.size} VIP video users from MongoDB.`);
            }
        }).catch(() => { });

        // Restore Telegram config from DB
        modeCollection.findOne({ _id: 'telegram_config' }).then(doc => {
            if (doc && doc.config) {
                global.telegramConfig = { ...global.telegramConfig, ...doc.config };
                console.log('✈️ [Dashboard] Restored Telegram config from MongoDB.');
            }
        }).catch(() => { });

        // Restore video catalog
        refreshVideoCatalogFromDB();

        return { modeCollection, blockCollection, authCollection, vipCollection, telegramCollection, dbClient };
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

// Helper: Auto-sync newest videos from Telegram channel into MongoDB
async function autoSyncTelegramVideos() {
    const token = global.telegramConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN || '8870659304:AAE7CJ4B02IoMHiDBxfvVOkmPmy1JNu7aw8';
    if (!token) return;

    try {
        const cols = await getMongoCollections();
        const tCol = cols?.telegramCollection;
        if (!tCol) return;

        const updatesRes = await axios.get(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { timeout: 8000 });
        if (updatesRes.data?.ok && Array.isArray(updatesRes.data.result)) {
            let addedCount = 0;
            for (const u of updatesRes.data.result) {
                const msg = u.channel_post || u.message;
                if (!msg) continue;
                const video = msg.video || (msg.document && (msg.document.mime_type?.startsWith('video/') || /\.(mp4|mkv|ts|avi|mov|webm)$/i.test(msg.document.file_name || '')) ? msg.document : null);
                if (!video) continue;

                const caption = msg.caption || '';
                const fileName = video.file_name || '';
                const combinedText = (caption + ' ' + fileName).trim();

                let folder = (combinedText.match(/#(\w+)/) || combinedText.match(/\[(.*?)\]/))?.[1];
                if (!folder) {
                    const wordFolder = combinedText.match(/^(General|Action|Trending|Movies|Sinhala|Video|Clip)/i);
                    if (wordFolder) folder = wordFolder[1];
                }
                if (!folder) folder = 'General Videos';

                let title = caption.replace(/#\w+/g, '').replace(/\[.*?\]/g, '').trim();
                if (!title) {
                    title = fileName.replace(/\.[a-zA-Z0-9]{2,4}$/, '').replace(/#\w+/g, '').replace(/\[.*?\]/g, '').trim();
                }
                if (!title) title = `Video_${video.file_unique_id || Date.now()}`;

                const digitsMatch = combinedText.match(/\b(\d{1,4})\b/);
                let code = digitsMatch ? digitsMatch[1] : '01';
                if (code.length === 1) code = '0' + code;
                const sizeMB = (video.file_size / 1024 / 1024).toFixed(1);

                const messageId = msg.message_id || 5;
                const chatId = msg.chat?.id || -1004382943539;
                const cleanChatId = String(chatId).replace(/^-100/, '').replace(/^-/, '');
                const directLink = msg.chat?.username 
                    ? `https://t.me/${msg.chat.username}/${messageId}`
                    : `https://t.me/c/${cleanChatId}/${messageId}`;

                let thumbUrl = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80';
                if (video.thumb?.file_id || video.thumbnail?.file_id) {
                    try {
                        const thId = video.thumb?.file_id || video.thumbnail?.file_id;
                        const thRes = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${thId}`);
                        if (thRes.data?.ok && thRes.data.result?.file_path) {
                            thumbUrl = `https://api.telegram.org/file/bot${token}/${thRes.data.result.file_path}`;
                        }
                    } catch (_) {}
                }

                await tCol.updateOne(
                    { fileUniqueId: video.file_unique_id || video.file_id },
                    {
                        $set: {
                            fileId: video.file_id,
                            fileUniqueId: video.file_unique_id,
                            title,
                            folder,
                            code,
                            sizeMB,
                            sizeFmt: `${sizeMB} MB`,
                            duration: video.duration,
                            thumbnailUrl: thumbUrl,
                            quality: '1080p Full HD',
                            messageId,
                            chatId,
                            directLink,
                            url: directLink,
                            updatedAt: new Date()
                        }
                    },
                    { upsert: true }
                );
                addedCount++;
            }
            if (addedCount > 0) {
                console.log(`✈️ [Auto-Sync Telegram] Synced ${addedCount} videos into MongoDB.`);
            }
        }
    } catch (e) {}
}
global.autoSyncTelegramVideos = autoSyncTelegramVideos;
setInterval(autoSyncTelegramVideos, 30000);

// Helper: Refresh Video Catalog from MongoDB
async function refreshVideoCatalogFromDB() {
    try {
        if (!telegramCollection) {
            const cols = await getMongoCollections();
            if (cols?.telegramCollection) telegramCollection = cols.telegramCollection;
        }
        if (!telegramCollection) return;

        await autoSyncTelegramVideos();

        const allVideos = await telegramCollection.find().sort({ folder: 1, code: 1 }).toArray();
        if (allVideos && allVideos.length > 0) {
            const folderMap = {};
            allVideos.forEach(v => {
                const fName = v.folder || 'General Videos';
                if (!folderMap[fName]) folderMap[fName] = { name: fName, videos: [] };
                const directLink = v.directLink || (v.messageId ? `https://t.me/c/4382943539/${v.messageId}` : 'https://t.me/c/4382943539/5');
                folderMap[fName].videos.push({
                    id: v._id.toString(),
                    code: v.code || '01',
                    title: v.title || v.fileName || 'Untitled Video',
                    sizeFmt: v.sizeFmt || (v.sizeMB ? `${v.sizeMB} MB` : 'HD'),
                    durationFmt: v.durationFmt || (v.duration ? `${Math.round(v.duration / 60)}m` : 'HD'),
                    thumbnailUrl: v.thumbnailUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80',
                    url: v.url || v.downloadUrl || directLink,
                    directLink: directLink,
                    messageId: v.messageId || 5,
                    quality: v.quality || '1080p Full HD',
                    fileId: v.fileId
                });
            });
            global.vipVideoCatalog = Object.values(folderMap);
        } else {
            // Seed default catalog with realistic sample folders so remote displays immediately
            global.vipVideoCatalog = [
                {
                    name: '🎬 Action',
                    videos: [
                        { id: 'v1', code: '01', title: 'Fast and Furious 01 1080p Full HD', sizeFmt: '42.2 MB', durationFmt: 'HD', quality: '1080p Full HD', thumbnailUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80', directLink: 'https://t.me/c/4382943539/5', url: 'https://t.me/c/4382943539/5', messageId: 5 }
                    ]
                }
            ];
        }
    } catch (e) {
        console.log('[Catalog Warning]:', e.message);
    }
}

// Global WhatsApp Video Dispatcher
global.dispatchVipVideoToWhatsApp = async function (targetJid, videoData) {
    let jid = targetJid.trim();
    if (!jid.includes('@')) {
        let cleanNumber = jid.replace(/[^0-9]/g, '');
        if (cleanNumber.startsWith('0')) cleanNumber = '94' + cleanNumber.substring(1);
        jid = cleanNumber + '@s.whatsapp.net';
    }

    const sock = global.sock;
    const title = videoData.title || videoData.fileName || 'VIP_Video';
    const fileName = `${title.replace(/[^\w\s.-]/g, '_')}.mp4`;
    const messageId = videoData.messageId || 5;
    const cleanChatId = '4382943539';
    const defaultTgLink = `https://t.me/c/${cleanChatId}/${messageId}`;

    let videoUrl = videoData.url || videoData.downloadUrl || videoData.directLink;

    // Try resolving Telegram download URL for files <= 20 MB via official Bot API
    if (!videoUrl && videoData.fileId && global.telegramConfig?.botToken) {
        try {
            const token = global.telegramConfig.botToken;
            const tgFileRes = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${videoData.fileId}`, { timeout: 10000 });
            if (tgFileRes.data?.ok && tgFileRes.data.result?.file_path) {
                videoUrl = `https://api.telegram.org/file/bot${token}/${tgFileRes.data.result.file_path}`;
            }
        } catch (tgErr) {
            console.log('Telegram Bot API getFile note (files >20MB cannot be fetched via bot API):', tgErr.message);
        }
    }

    if (!videoUrl) {
        videoUrl = defaultTgLink;
    }

    const isDirectDownloadable = videoUrl && (
        /^https?:\/\/.*?\.(mp4|mkv|avi|mov|webm|ts)(\?.*)?$/i.test(videoUrl) ||
        videoUrl.includes('api.telegram.org/file/')
    );

    const streamMessage = 
        `🎬 *${title}*\n` +
        `💾 Size: ${videoData.sizeFmt || '42.2 MB'}\n` +
        `👑 DMC™ VIP Video Stream\n\n` +
        `✅ *Your VIP Video Stream Link:*\n` +
        `🔗 ${videoUrl}\n\n` +
        `💡 _සටහන: ඔබගේ Video එක කෙළින්ම WhatsApp වෙත එවීමට සූදානම් කරමින් පවතී. ඉහත Direct Stream Link එක මඟින්ද Full Speed එකෙන් බැලීමට හෝ Download කරගත හැක._\n` +
        `🍿 _DMC™ Video Streaming Service_`;

    if (sock && sock.user) {
        try {
            // Send quick downloading notification to WhatsApp
            await sock.sendMessage(jid, {
                text: `⏳ *"${title}"* (${videoData.sizeFmt || '42.2 MB'}) සූදානම් කරමින් පවතී... සුළු මොහොතකින් Document එකක් ලෙස ලැබෙනු ඇත. 🚀`
            });

            // 1. Direct GramJS MTProto download (Supports files up to 2 GB!)
            let localFilePath = null;
            try {
                const { downloadTelegramVideo } = require('./telegramDownloader');
                const targetChatId = videoData.chatId || -1004382943539;
                const targetMsgId = videoData.messageId || 5;
                localFilePath = await downloadTelegramVideo(targetChatId, targetMsgId, fileName);
            } catch (tgDownloadErr) {
                console.log('GramJS MTProto download note:', tgDownloadErr.message);
            }

            if (localFilePath && fs.existsSync(localFilePath)) {
                await sock.sendMessage(jid, {
                    document: fs.readFileSync(localFilePath),
                    mimetype: 'video/mp4',
                    fileName: fileName,
                    caption: `🎬 *${title}*\n💾 Size: ${videoData.sizeFmt || 'HD'}\n👑 DMC™ VIP Video Stream\n🍿 Enjoy your VIP movie!`
                });
                try { fs.unlinkSync(localFilePath); } catch (_) {}
                return { success: true };
            }

            // 2. Direct downloadable URL fallback
            if (isDirectDownloadable) {
                await sock.sendMessage(jid, {
                    document: { url: videoUrl },
                    mimetype: 'video/mp4',
                    fileName: fileName,
                    caption: `🎬 *${title}*\n💾 Size: ${videoData.sizeFmt || 'HD'}\n👑 DMC™ VIP Video Stream`
                });
            } else {
                await sock.sendMessage(jid, {
                    text: streamMessage
                });
            }
            return { success: true };
        } catch (e) {
            console.error('Dispatch WA error, falling back to stream text:', e.message);
            try {
                await sock.sendMessage(jid, { text: streamMessage });
                return { success: true };
            } catch (err2) {
                throw e;
            }
        }
    }

    // Queue into outbox if Baileys offline on this instance
    try {
        const cols = await getMongoCollections();
        if (cols?.dbClient) {
            const outboxCol = cols.dbClient.db('whatsapp_bot').collection('whatsapp_outbox');
            await outboxCol.insertOne({
                jid,
                message: streamMessage,
                status: 'pending',
                videoData,
                videoUrl: isDirectDownloadable ? videoUrl : null,
                createdAt: new Date()
            });
            return { success: true, queued: true };
        }
    } catch (err) { }

    throw new Error('WhatsApp service offline');
};

// Check VIP status with direct MongoDB fallback
async function checkIsVipNumberFromDB(number) {
    if (!number) return false;
    let clean = String(number).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '94' + clean.substring(1);

    if (clean === '94717884174') return true;
    if (global.vipVideoUsersCache && (global.vipVideoUsersCache.has(clean) || global.vipVideoUsersCache.has('+' + clean))) {
        return true;
    }

    try {
        const cols = await getMongoCollections();
        if (cols?.vipCollection) {
            const found = await cols.vipCollection.findOne({
                $or: [
                    { _id: clean },
                    { _id: '+' + clean },
                    { _id: clean.startsWith('94') ? '0' + clean.substring(2) : clean }
                ]
            });
            if (found) {
                if (!global.vipVideoUsersCache) global.vipVideoUsersCache = new Set();
                global.vipVideoUsersCache.add(clean);
                return true;
            }
        }
    } catch (e) {
        console.error('[VIP DB Check Error]:', e.message);
    }
    return false;
}
global.checkIsVipNumberFromDB = checkIsVipNumberFromDB;

// Verify VIP Remote Access Token
async function verifyVipToken(token, userNumber) {
    if (token === 'owner_preview') return true; // Direct preview from dashboard
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (signature !== expectedSig) return false;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (data.exp && Date.now() > data.exp) return false;
        let cleanUser = String(userNumber || data.user || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        if (cleanUser.startsWith('0')) cleanUser = '94' + cleanUser.substring(1);

        return await checkIsVipNumberFromDB(cleanUser);
    } catch {
        return false;
    }
}

function setupDashboard(app) {
    // Enable JSON parsing
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Capture Public URL middleware from incoming requests
    app.use((req, res, next) => {
        const rawHost = req.headers['x-forwarded-host'] || req.headers.host;
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        if (rawHost && !rawHost.includes('localhost') && !rawHost.includes('127.0.0.1')) {
            const detectedUrl = `${proto}://${rawHost}`.replace(/\/$/, '');
            if (global.CAPTURED_APP_URL !== detectedUrl) {
                global.CAPTURED_APP_URL = detectedUrl;
                getMongoCollections().then(cols => {
                    if (cols?.modeCollection) {
                        cols.modeCollection.updateOne(
                            { _id: 'app_url' },
                            { $set: { url: detectedUrl, updatedAt: new Date() } },
                            { upsert: true }
                        ).catch(() => { });
                    }
                }).catch(() => { });
            }
        }
        next();
    });

    // Public App URL sync endpoints
    app.get('/api/app-url', (req, res) => {
        const currentUrl = global.CAPTURED_APP_URL || process.env.APP_URL || (process.env.KOYEB_PUBLIC_DOMAIN ? `https://${process.env.KOYEB_PUBLIC_DOMAIN}` : '');
        res.json({ success: true, url: currentUrl });
    });

    app.post('/api/app-url', async (req, res) => {
        const { url } = req.body || {};
        if (url && typeof url === 'string' && url.startsWith('http')) {
            global.CAPTURED_APP_URL = url.trim().replace(/\/$/, '');
            try {
                const cols = await getMongoCollections();
                if (cols?.modeCollection) {
                    await cols.modeCollection.updateOne(
                        { _id: 'app_url' },
                        { $set: { url: global.CAPTURED_APP_URL, updatedAt: new Date() } },
                        { upsert: true }
                    );
                }
            } catch (e) { }
            return res.json({ success: true, url: global.CAPTURED_APP_URL });
        }
        res.status(400).json({ success: false, error: 'Valid HTTP/HTTPS URL required' });
    });

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
            } catch (e) { }
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

    // ============================================================
    // 17. VIP VIDEO REMOTE CONTROLLER & TELEGRAM STREAM ENGINE
    // ============================================================

    // Serve Interactive Real-Time Remote Popup Screen
    app.get('/remote', (req, res) => {
        const remoteHtmlPath = path.join(__dirname, 'remote.html');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        try {
            res.sendFile(remoteHtmlPath);
        } catch (err) {
            res.status(500).send(`<h2>Error loading Remote UI: ${err.message}</h2>`);
        }
    });

    // VIP Remote Catalog (Protected by VIP Token)
    app.get('/api/vip-remote/catalog', async (req, res) => {
        const { token, user } = req.query || {};
        if (!(await verifyVipToken(token, user))) {
            return res.status(403).json({
                success: false,
                error: '⛔ VIP Access Required! Please contact Bot Owner (+94717884174) to get access.'
            });
        }

        res.json({
            success: true,
            user: user,
            folders: global.vipVideoCatalog || []
        });
    });

    // VIP Remote Dispatch to WhatsApp (Center Red Button Trigger)
    app.post('/api/vip-remote/dispatch', async (req, res) => {
        const { token, user, videoId, folderName } = req.body || {};
        if (!(await verifyVipToken(token, user))) {
            return res.status(403).json({ success: false, error: 'Unauthorized VIP token' });
        }

        let targetVideo = null;
        if (global.vipVideoCatalog) {
            for (const f of global.vipVideoCatalog) {
                for (const v of (f.videos || [])) {
                    if (String(v.id) === String(videoId) || String(v.code) === String(videoId)) {
                        targetVideo = v;
                        break;
                    }
                }
                if (targetVideo) break;
            }
        }

        if (!targetVideo) {
            return res.status(404).json({ success: false, error: 'Video not found in catalog' });
        }

        try {
            await global.dispatchVipVideoToWhatsApp(user, targetVideo);
            res.json({
                success: true,
                message: `Video "${targetVideo.title}" successfully dispatched to your WhatsApp!`,
                video: targetVideo
            });
        } catch (err) {
            console.error('Dispatch API error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 18. VIP Users Management (Admin Protected)
    app.get('/api/vip-users', requireAuth, async (req, res) => {
        try {
            const cols = await getMongoCollections();
            const list = [];
            if (cols?.vipCollection) {
                const users = await cols.vipCollection.find().toArray();
                users.forEach(u => list.push({
                    number: u._id,
                    note: u.note || 'VIP User',
                    addedAt: u.addedAt || new Date().toISOString()
                }));
            }
            if (list.length === 0 && global.vipVideoUsersCache) {
                global.vipVideoUsersCache.forEach(num => {
                    list.push({ number: num, note: 'Cached VIP', addedAt: new Date().toISOString() });
                });
            }
            res.json({ success: true, list, total: list.length });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/vip-users', requireAuth, async (req, res) => {
        const { number, note } = req.body || {};
        if (!number) return res.status(400).json({ success: false, error: 'Phone number is required' });

        let cleanNumber = number.replace(/[^0-9]/g, '');
        if (cleanNumber.startsWith('0')) cleanNumber = '94' + cleanNumber.substring(1);

        if (!global.vipVideoUsersCache) global.vipVideoUsersCache = new Set();
        global.vipVideoUsersCache.add(cleanNumber);

        try {
            const cols = await getMongoCollections();
            if (cols?.vipCollection) {
                await cols.vipCollection.updateOne(
                    { _id: cleanNumber },
                    { $set: { note: note || 'VIP Access', addedAt: new Date() } },
                    { upsert: true }
                );
            }
        } catch (e) {
            console.error('VIP save DB error:', e);
        }

        res.json({
            success: true,
            number: cleanNumber,
            message: `VIP Access granted to +${cleanNumber}! They can now use .xrd`
        });
    });

    app.delete('/api/vip-users/:target', requireAuth, async (req, res) => {
        const target = req.params.target;
        if (!target) return res.status(400).json({ success: false, error: 'Target required' });

        let cleanNumber = target.replace(/[^0-9]/g, '');
        if (cleanNumber.startsWith('0')) cleanNumber = '94' + cleanNumber.substring(1);

        if (global.vipVideoUsersCache) global.vipVideoUsersCache.delete(cleanNumber);

        try {
            const cols = await getMongoCollections();
            if (cols?.vipCollection) {
                await cols.vipCollection.deleteOne({ _id: cleanNumber });
            }
        } catch (e) { }

        res.json({ success: true, message: `VIP access revoked for +${cleanNumber}` });
    });

    // 19. Telegram Settings & Video Sync (Admin Protected)
    app.get('/api/telegram-config', requireAuth, (req, res) => {
        res.json({ success: true, config: global.telegramConfig || {} });
    });

    app.post('/api/telegram-config', requireAuth, async (req, res) => {
        const { botToken, channelId } = req.body || {};
        if (!global.telegramConfig) global.telegramConfig = {};
        if (botToken !== undefined) global.telegramConfig.botToken = botToken.trim();
        if (channelId !== undefined) global.telegramConfig.channelId = channelId.trim();

        try {
            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                await cols.modeCollection.updateOne(
                    { _id: 'telegram_config' },
                    { $set: { config: global.telegramConfig, updatedAt: new Date() } },
                    { upsert: true }
                );
            }
        } catch (e) { }

        res.json({ success: true, config: global.telegramConfig, message: 'Telegram settings saved!' });
    });

    // Sync Telegram Channel Videos
    app.post('/api/telegram/sync', requireAuth, async (req, res) => {
        const { botToken, channelId } = req.body || {};
        const token = (botToken || global.telegramConfig?.botToken || '').trim();
        const channel = (channelId || global.telegramConfig?.channelId || '').trim();

        if (!token) {
            return res.status(400).json({ success: false, error: 'Telegram Bot Token is required. Get it from @BotFather' });
        }

        try {
            const meRes = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 8000 });
            if (!meRes.data?.ok) {
                return res.status(400).json({ success: false, error: 'Invalid Telegram Bot Token' });
            }

            // Save config
            global.telegramConfig.botToken = token;
            if (channel) global.telegramConfig.channelId = channel;
            global.telegramConfig.lastSync = Date.now();

            const cols = await getMongoCollections();
            if (cols?.modeCollection) {
                await cols.modeCollection.updateOne(
                    { _id: 'telegram_config' },
                    { $set: { config: global.telegramConfig, updatedAt: new Date() } },
                    { upsert: true }
                );
            }

            let newVideosCount = 0;
            // Fetch updates or channel posts
            const updatesRes = await axios.get(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { timeout: 10000 });

            // Auto-detect channel if not set
            for (const u of (updatesRes.data?.result || [])) {
                if (!channel && !global.telegramConfig.channelId) {
                    const detectedChat = u.channel_post?.chat || u.message?.chat || u.my_chat_member?.chat;
                    if (detectedChat && detectedChat.id) {
                        global.telegramConfig.channelId = String(detectedChat.id);
                        console.log(`✈️ [Telegram Sync] Auto-detected Channel/Group ID: ${global.telegramConfig.channelId} (${detectedChat.title || 'Private Group'})`);
                    }
                }
            }

            if (updatesRes.data?.ok && Array.isArray(updatesRes.data.result)) {
                const tCol = cols?.telegramCollection;

                for (const u of updatesRes.data.result) {
                    const msg = u.channel_post || u.message;
                    if (!msg) continue;
                    const video = msg.video || (msg.document && msg.document.mime_type?.startsWith('video/') ? msg.document : null);
                    if (!video) continue;

                    const caption = msg.caption || '';
                    const fileName = video.file_name || '';
                    const combinedText = (caption + ' ' + fileName).trim();

                    let folder = (combinedText.match(/#(\w+)/) || combinedText.match(/\[(.*?)\]/))?.[1];
                    if (!folder) {
                        const wordFolder = combinedText.match(/^(General|Action|Trending|Movies|Sinhala|Video|Clip)/i);
                        if (wordFolder) folder = wordFolder[1];
                    }
                    if (!folder) folder = 'General Videos';

                    let title = caption.replace(/#\w+/g, '').replace(/\[.*?\]/g, '').trim();
                    if (!title) {
                        title = fileName.replace(/\.[a-zA-Z0-9]{2,4}$/, '').replace(/#\w+/g, '').replace(/\[.*?\]/g, '').trim();
                    }
                    if (!title) title = `Video_${video.file_unique_id || Date.now()}`;

                    const digitsMatch = combinedText.match(/\b(\d{1,4})\b/);
                    let code = digitsMatch ? digitsMatch[1] : '01';
                    if (code.length === 1) code = '0' + code;
                    const sizeMB = (video.file_size / 1024 / 1024).toFixed(1);

                    let thumbUrl = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80';
                    if (video.thumb?.file_id || video.thumbnail?.file_id) {
                        try {
                            const thId = video.thumb?.file_id || video.thumbnail?.file_id;
                            const thRes = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${thId}`);
                            if (thRes.data?.ok && thRes.data.result?.file_path) {
                                thumbUrl = `https://api.telegram.org/file/bot${token}/${thRes.data.result.file_path}`;
                            }
                        } catch (_) { }
                    }

                    const messageId = msg.message_id || 5;
                    const chatId = msg.chat?.id || -1004382943539;
                    const cleanChatId = String(chatId).replace(/^-100/, '').replace(/^-/, '');
                    const directLink = msg.chat?.username 
                        ? `https://t.me/${msg.chat.username}/${messageId}`
                        : `https://t.me/c/${cleanChatId}/${messageId}`;

                    if (tCol) {
                        await tCol.updateOne(
                            { fileUniqueId: video.file_unique_id || video.file_id },
                            {
                                $set: {
                                    fileId: video.file_id,
                                    fileUniqueId: video.file_unique_id,
                                    title,
                                    folder,
                                    code,
                                    sizeMB,
                                    sizeFmt: `${sizeMB} MB`,
                                    duration: video.duration,
                                    thumbnailUrl: thumbUrl,
                                    quality: '1080p Full HD',
                                    messageId,
                                    chatId,
                                    directLink,
                                    url: directLink,
                                    updatedAt: new Date()
                                }
                            },
                            { upsert: true }
                        );
                        newVideosCount++;
                    }
                }
            }

            await refreshVideoCatalogFromDB();

            res.json({
                success: true,
                message: `Telegram sync complete! Processed ${newVideosCount} videos.`,
                botUsername: meRes.data.result.username,
                catalog: global.vipVideoCatalog
            });

        } catch (err) {
            console.error('Telegram sync error:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 20. Direct Video Catalog Management (Admin Protected)
    app.post('/api/vip-videos/add', requireAuth, async (req, res) => {
        const { title, folder, code, url, thumbnailUrl, sizeFmt, quality } = req.body || {};
        if (!title || !folder) {
            return res.status(400).json({ success: false, error: 'Title and folder are required' });
        }

        try {
            const cols = await getMongoCollections();
            if (cols?.telegramCollection) {
                await cols.telegramCollection.insertOne({
                    title: title.trim(),
                    folder: folder.trim(),
                    code: code ? code.trim() : String(Math.floor(Math.random() * 90 + 10)),
                    url: url ? url.trim() : '',
                    thumbnailUrl: thumbnailUrl ? thumbnailUrl.trim() : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80',
                    sizeFmt: sizeFmt || '500 MB',
                    quality: quality || '1080p HD',
                    createdAt: new Date()
                });
                await refreshVideoCatalogFromDB();
            }
            res.json({ success: true, message: 'Video added to VIP catalog successfully!' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/vip-videos/:id', requireAuth, async (req, res) => {
        const { id } = req.params;
        try {
            const cols = await getMongoCollections();
            if (cols?.telegramCollection) {
                const { ObjectId } = require('mongodb');
                let filter = { _id: id };
                try { filter = { _id: new ObjectId(id) }; } catch (_) { }
                await cols.telegramCollection.deleteOne(filter);
                await refreshVideoCatalogFromDB();
            }
            res.json({ success: true, message: 'Video deleted from VIP catalog' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 21. Main Web Interface (Serves the interactive single-page app)
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
