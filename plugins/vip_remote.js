/**
 * 👑 DMC VIP VIDEO CONTROLLER & TELEGRAM STREAM ENGINE (.xrd) 👑
 * Exclusive VIP Access: Only numbers added via Dashboard can access .xrd
 * Works 100% inside WhatsApp for WhatsApp Data Package users (0% external data needed)
 */

const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');

const SESSION_SECRET = process.env.ADMIN_SECRET || 'dmc_admin_secret_787898_pasindu';

// In-Memory Remote Sessions: cleanNumber -> { folderIndex, videoIndex, lastActionTime }
if (!global.vipUserRemoteSessions) {
    global.vipUserRemoteSessions = new Map();
}

// Helper: Safely extract clean international phone number without multi-device colon suffixes
function extractCleanNumber(jid) {
    if (!jid) return '';
    let raw = String(jid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (raw.startsWith('0')) raw = '94' + raw.substring(1);
    return raw;
}

// Helper: Check if sender is VIP or Owner (with Multi-Device, LID, Cache & MongoDB Direct Verification)
async function isVipUser(senderJid, isOwner, conn, mek) {
    if (isOwner) return { isVip: true, cleanNumber: '94717884174' };

    const candidates = [
        senderJid,
        mek?.key?.participant,
        mek?.key?.remoteJid,
        mek?.participant
    ].filter(Boolean);

    let lastClean = '';

    for (const jid of candidates) {
        let clean = extractCleanNumber(jid);
        if (clean) lastClean = clean;

        // 1. Owner check
        if (clean === '94717884174' || clean === (config.OWNER_NUMBER || '').replace(/[^0-9]/g, '')) {
            return { isVip: true, cleanNumber: clean };
        }

        // 2. In-Memory Cache check
        if (global.vipVideoUsersCache) {
            if (global.vipVideoUsersCache.has(clean) || global.vipVideoUsersCache.has('+' + clean) || global.vipVideoUsersCache.has('0' + clean.substring(2))) {
                return { isVip: true, cleanNumber: clean };
            }
        }

        // 3. Resolve LID to Real Phone Number if applicable
        if (jid.includes('@lid') && conn?.signalRepository?.lidMapping?.getPNForLID) {
            try {
                const pn = await conn.signalRepository.lidMapping.getPNForLID(jid);
                if (pn) {
                    const pnClean = extractCleanNumber(pn);
                    if (pnClean) {
                        lastClean = pnClean;
                        if (global.vipVideoUsersCache && (global.vipVideoUsersCache.has(pnClean) || global.vipVideoUsersCache.has('+' + pnClean))) {
                            return { isVip: true, cleanNumber: pnClean };
                        }
                        if (typeof global.checkIsVipNumberFromDB === 'function' && await global.checkIsVipNumberFromDB(pnClean)) {
                            return { isVip: true, cleanNumber: pnClean };
                        }
                    }
                }
            } catch (_) {}
        }

        // 4. Direct MongoDB lookup fallback (100% real-time cross-instance reliability)
        if (typeof global.checkIsVipNumberFromDB === 'function' && clean) {
            const isVipDb = await global.checkIsVipNumberFromDB(clean);
            if (isVipDb) {
                return { isVip: true, cleanNumber: clean };
            }
        }
    }

    return { isVip: false, cleanNumber: lastClean || extractCleanNumber(senderJid) };
}

// Generate Secure VIP Remote Token
function generateVipToken(userNumber) {
    const payload = Buffer.from(JSON.stringify({
        user: userNumber,
        exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

// Helper: Get base URL for Remote Link
function getRemoteBaseUrl() {
    if (global.CAPTURED_APP_URL) return global.CAPTURED_APP_URL.replace(/\/$/, '');
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    if (process.env.KOYEB_PUBLIC_DOMAIN) {
        let domain = process.env.KOYEB_PUBLIC_DOMAIN.trim().replace(/\/$/, '');
        if (!domain.startsWith('http')) domain = 'https://' + domain;
        return domain;
    }
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
    return `http://localhost:${process.env.PORT || 8000}`;
}

// Helper: Detect and load local 4,1 (# General) videos & Collage Photo
function getLocalSection41Videos() {
    const targetDir = 'C:\\Users\\MYPC\\Downloads\\Video\\2026\\4,1\\New Folder';
    if (!fs.existsSync(targetDir)) return null;

    try {
        const files = fs.readdirSync(targetDir);
        const videoFiles = files.filter(f => f.startsWith('#General') && !f.endsWith('.png')).sort();

        const videos = [];
        for (const f of videoFiles) {
            const fullPath = path.join(targetDir, f);
            const match = f.match(/#General\s*(\d+)/i);
            const code = match ? match[1] : '';
            const stat = fs.statSync(fullPath);
            const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);

            let title = f.replace(/^#General\s*\d+\s*/i, '').replace(/\.[^/.]+$/, '').trim();
            if (!title) title = `Clip ${code}`;

            videos.push({
                id: `local_${code}`,
                code: code,
                title: title,
                fileName: f,
                filePath: fullPath,
                sizeFmt: `${sizeMB} MB`,
                durationFmt: 'HD',
                quality: '1080p Full HD',
                isLocal: true
            });
        }

        const collagePath = path.join(targetDir, '#General_Collage_10_16.png');
        return {
            name: '📁 4,1 (# General)',
            videos,
            collagePath: fs.existsSync(collagePath) ? collagePath : null
        };
    } catch (e) {
        console.error("Local 4,1 load error:", e.message);
        return null;
    }
}

// Helper: Get all Collages from MongoDB & Local Cache
async function getCollagesCatalog() {
    let collages = [];

    try {
        const { MongoClient } = require('mongodb');
        if (process.env.MONGODB_URI) {
            const client = new MongoClient(process.env.MONGODB_URI);
            await client.connect();
            const db = client.db('whatsapp_bot');
            const cList = await db.collection('telegram_collages').find().sort({ collageNum: 1 }).toArray();
            const vList = await db.collection('telegram_videos').find().sort({ code: 1 }).toArray();
            await client.close();

            if (cList && cList.length > 0) {
                collages = cList.map(c => {
                    const cVideos = vList.filter(v => v.collageNum === c.collageNum || (c.collageNum === 1 && parseInt(v.code, 10) < 10) || (c.collageNum === 2 && parseInt(v.code, 10) >= 10));
                    return {
                        collageNum: c.collageNum,
                        caption: c.caption || `#General #Collage${c.collageNum}`,
                        photoBase64: c.photoBase64,
                        localPath: c.localPath,
                        videos: cVideos
                    };
                });
            }
        }
    } catch (e) {
        console.error("Collage catalog load error:", e.message);
    }

    // Fallback if DB empty
    if (collages.length === 0) {
        const local41 = getLocalSection41Videos();
        if (local41 && local41.collagePath) {
            collages.push({
                collageNum: 2,
                caption: '#General #Collage2',
                localPath: local41.collagePath,
                videos: local41.videos
            });
        }
    }

    const cacheDir = path.join(__dirname, '../cache_collages');
    if (!fs.existsSync(cacheDir)) {
        try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
    }

    collages.forEach(c => {
        if (!c.localPath || !fs.existsSync(c.localPath)) {
            const targetFile = path.join(cacheDir, `collage_${c.collageNum}.jpg`);
            if (c.photoBase64 && !fs.existsSync(targetFile)) {
                try {
                    fs.writeFileSync(targetFile, Buffer.from(c.photoBase64, 'base64'));
                    c.localPath = targetFile;
                } catch (_) {}
            } else if (fs.existsSync(targetFile)) {
                c.localPath = targetFile;
            }
        }
    });

    return collages;
}

// Send WhatsApp Collage Remote Card (Collage-Centric Navigation)
async function sendWhatsAppCollageRemoteCard(conn, toJid, cleanNumber, isOwner) {
    const collages = await getCollagesCatalog();
    if (!collages || collages.length === 0) {
        return await conn.sendMessage(toJid, { text: "⚠️ Collages හමුනොවීය. කරුණාකර .sync මඟින් Telegram Collages Sync කරන්න." });
    }

    let session = global.vipUserRemoteSessions.get(cleanNumber);
    if (!session) {
        session = { collageIndex: 0, lastActionTime: 0 };
        global.vipUserRemoteSessions.set(cleanNumber, session);
    }

    if (session.collageIndex === undefined) session.collageIndex = 0;
    session.collageIndex = (session.collageIndex + collages.length) % collages.length;

    const currentCollage = collages[session.collageIndex];
    const videos = currentCollage.videos || [];
    const minCode = videos[0]?.code || '01';
    const maxCode = videos[videos.length - 1]?.code || '09';

    const botNum = conn?.user?.id ? conn.user.id.split(':')[0].replace(/[^0-9]/g, '') : (config.OWNER_NUMBER || '94717884174').replace(/[^0-9]/g, '');

    // Dynamic 1-Tap Links
    let tapLinksText = `👇 *1-TAP VIDEO DOWNLOAD LINKS (Auto Mind):*\n_වීඩියෝව සෘජුවම ලබා ගැනීමට අදාළ Link එක ඔබන්න:_\n\n`;
    videos.forEach(v => {
        const tapUrl = `https://wa.me/${botNum}?text=.v+${encodeURIComponent(v.code)}`;
        tapLinksText += `👉 🎬 *[${v.code}] ලබාගන්න:* ${tapUrl}\n`;
    });

    const captionText = 
        `👑 *DMC™ VIP TV REMOTE CONTROLLER* 📺\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🖼️ *COLLAGE [${session.collageIndex + 1}/${collages.length}]:* #Collage${currentCollage.collageNum}\n` +
        `📁 *SECTION:* # General  (4,1 Videos)\n` +
        `🎬 *VIDEOS IN THIS COLLAGE:* [${minCode}] - [${maxCode}] (${videos.length} Videos)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        tapLinksText +
        `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎮 *COLLAGE NAVIGATION COMMANDS:*\n` +
        `_WhatsApp Package අයට Data කැපෙන්නේ නැත. පහත Commands chat එකට එවන්න:_\n\n` +
        `▶️ *.vn*  ➜  ඊළඟ Collage එක (Next Collage)\n` +
        `◀️ *.vp*  ➜  කලින් Collage එක (Prev Collage)\n` +
        `🔢 *.v <Code>* ➜  අංකයෙන් Video එක කෙළින්ම ගන්න (උදා: \`.v ${minCode}\`)\n` +
        `📑 *.vlist* ➜ සියලුම Videos Catalog එක බලන්න`;

    // Collage Photo Buffer
    let imgBuffer = null;
    if (currentCollage.localPath && fs.existsSync(currentCollage.localPath)) {
        imgBuffer = fs.readFileSync(currentCollage.localPath);
    } else if (currentCollage.photoBase64) {
        imgBuffer = Buffer.from(currentCollage.photoBase64, 'base64');
    }

    if (imgBuffer) {
        await conn.sendMessage(toJid, {
            image: imgBuffer,
            caption: captionText,
            mimetype: 'image/jpeg'
        });
    } else {
        await conn.sendMessage(toJid, { text: captionText });
    }
}

// 1. Main Command: .xrd (VIP Video Remote Controller)
cmd({
    pattern: "xrd",
    alias: ["xrdremote", "vipremote", "tvremote", "collage", "general", "41"],
    desc: "Open VIP Live Video Remote Controller (Collage-Centric)",
    category: "vip",
    react: "🎮"
}, async (conn, mek, m, { from, sender, isOwner, reply }) => {
    try {
        const senderJid = sender || mek.key.participant || from;
        const vipAuth = await isVipUser(senderJid, isOwner, conn, mek);
        const cleanNumber = vipAuth.cleanNumber;

        console.log(`👑 [VIP Remote] .xrd triggered by ${senderJid} => VIP: ${vipAuth.isVip}`);

        if (!vipAuth.isVip) {
            return await reply(
                "⛔ *ACCESS DENIED (VIP ONLY)* ⛔\n\n" +
                "මෙම විශේෂිත Video Remote Controller එක ලබාගැනීමට ඔබට අවසර (VIP Access) නොමැත.\n\n" +
                "💡 _අවසර ලබාගැනීම සඳහා කරුණාකර Bot Owner (+94717884174) සම්බන්ධ කරගන්න._"
            );
        }

        await sendWhatsAppCollageRemoteCard(conn, from, cleanNumber, isOwner);

    } catch (e) {
        console.error("VIP Remote Error:", e);
        await reply("⚠️ Controller එක open කිරීමේදී දෝෂයක් සිදුවිය.");
    }
});

// 2. Next Collage Navigation: .vn / .next
cmd({
    pattern: "vn",
    alias: ["vnext", "next", "nextcollage"],
    desc: "Switch to Next Collage Photo",
    category: "vip",
    react: "▶️"
}, async (conn, mek, m, { from, sender, isOwner }) => {
    const vipAuth = await isVipUser(sender || from, isOwner, conn, mek);
    if (!vipAuth.isVip) return;
    const collages = await getCollagesCatalog();
    if (!collages || collages.length === 0) return;

    let s = global.vipUserRemoteSessions.get(vipAuth.cleanNumber) || { collageIndex: 0 };
    s.collageIndex = ((s.collageIndex || 0) + 1) % collages.length;
    global.vipUserRemoteSessions.set(vipAuth.cleanNumber, s);
    await sendWhatsAppCollageRemoteCard(conn, from, vipAuth.cleanNumber, isOwner);
});

// 3. Previous Collage Navigation: .vp / .prev
cmd({
    pattern: "vp",
    alias: ["vprev", "prev", "prevcollage"],
    desc: "Switch to Previous Collage Photo",
    category: "vip",
    react: "◀️"
}, async (conn, mek, m, { from, sender, isOwner }) => {
    const vipAuth = await isVipUser(sender || from, isOwner, conn, mek);
    if (!vipAuth.isVip) return;
    const collages = await getCollagesCatalog();
    if (!collages || collages.length === 0) return;

    let s = global.vipUserRemoteSessions.get(vipAuth.cleanNumber) || { collageIndex: 0 };
    s.collageIndex = ((s.collageIndex || 0) - 1 + collages.length) % collages.length;
    global.vipUserRemoteSessions.set(vipAuth.cleanNumber, s);
    await sendWhatsAppCollageRemoteCard(conn, from, vipAuth.cleanNumber, isOwner);
});

// Helper: Deliver Video to Chat (Local file priority, fallback to GramJS Telegram Topic 6)
async function deliverVideoToChat(conn, from, targetVideo, mek) {
    const title = targetVideo.title || targetVideo.fileName || `Video ${targetVideo.code}`;
    const code = targetVideo.code || '';
    const sizeFmt = targetVideo.sizeFmt || 'HD';
    const fileName = targetVideo.fileName || `${title}.mp4`;

    // 1. Send from local disk if file exists
    if (targetVideo.filePath && fs.existsSync(targetVideo.filePath)) {
        await conn.sendMessage(from, { text: `⏳ *"${fileName}"* (${sizeFmt}) සූදානම් කරමින් පවතී... WhatsApp වෙත Document එකක් ලෙස එවනු ඇත. 🚀` }, { quoted: mek });
        return await conn.sendMessage(from, {
            document: fs.readFileSync(targetVideo.filePath),
            mimetype: 'video/mp4',
            fileName: fileName,
            caption: `🎬 *[${code}] ${title}*\n💾 *Size:* ${sizeFmt}\n👑 *DMC™ VIP Video Stream*`
        }, { quoted: mek });
    }

    // 2. Download from Telegram Topic 6 via GramJS MTProto
    await conn.sendMessage(from, { text: `⏳ *"${fileName}"* (${sizeFmt}) Telegram වෙතින් ලබාගනිමින් පවතී... WhatsApp වෙත එවනු ඇත. 🚀` }, { quoted: mek });

    try {
        const { downloadTelegramVideo } = require('../lib/telegramDownloader');
        const targetChatId = targetVideo.chatId || -1004382943539;
        const targetMsgId = targetVideo.messageId;
        const downloadedPath = await downloadTelegramVideo(targetChatId, targetMsgId, fileName);

        if (downloadedPath && fs.existsSync(downloadedPath)) {
            await conn.sendMessage(from, {
                document: fs.readFileSync(downloadedPath),
                mimetype: targetVideo.mimeType || 'video/mp4',
                fileName: fileName,
                caption: `🎬 *[${code}] ${title}*\n💾 *Size:* ${sizeFmt}\n👑 *DMC™ VIP Video Stream*`
            }, { quoted: mek });
            try { fs.unlinkSync(downloadedPath); } catch (_) {}
            return;
        }
    } catch (tgErr) {
        console.error("Telegram download error:", tgErr.message);
        await conn.sendMessage(from, { text: `⚠️ Telegram වෙතින් Video එක ලබාගැනීමේදී දෝෂයක් සිදුවිය: ${tgErr.message}` }, { quoted: mek });
    }
}

// 4. Direct Video Download: .v <code/number>
cmd({
    pattern: "v",
    alias: ["getv", "xrdv"],
    desc: "Quick Jump & Get Video by Code",
    category: "vip",
    react: "🎬"
}, async (conn, mek, m, { from, sender, isOwner, args, reply }) => {
    try {
        const senderJid = sender || mek.key.participant || from;
        const vipAuth = await isVipUser(senderJid, isOwner, conn, mek);

        if (!vipAuth.isVip) {
            return await reply("⛔ *ACCESS DENIED:* ඔබට VIP Access නොමැත. Owner (+94717884174) සම්බන්ධ කරගන්න.");
        }

        const rawCode = (args[0] || '').trim().toLowerCase();
        if (!rawCode) {
            return await reply("💡 *භාවිතය:* `.v <code/number>` (උදා: `.v 01` හෝ `.v 10`)");
        }

        let codeQuery = rawCode.replace(/^#/, '').replace(/^general\s*/i, '').trim();
        if (codeQuery.length === 1) codeQuery = '0' + codeQuery;

        // 1. Direct Check from Local 4,1 Folder
        const local41 = getLocalSection41Videos();
        if (local41 && local41.videos) {
            const localMatch = local41.videos.find(v => 
                String(v.code) === codeQuery ||
                String(v.code) === codeQuery.replace(/^0+/, '') ||
                v.fileName.toLowerCase().includes(codeQuery)
            );

            if (localMatch && fs.existsSync(localMatch.filePath)) {
                return await deliverVideoToChat(conn, from, localMatch, mek);
            }
        }

        // 2. Check MongoDB telegram_videos
        let targetVideo = null;
        try {
            const { MongoClient } = require('mongodb');
            if (process.env.MONGODB_URI) {
                const client = new MongoClient(process.env.MONGODB_URI);
                await client.connect();
                targetVideo = await client.db('whatsapp_bot').collection('telegram_videos').findOne({
                    $or: [
                        { code: codeQuery },
                        { code: codeQuery.replace(/^0+/, '') },
                        { code: '0' + codeQuery.replace(/^0+/, '') }
                    ]
                });
                await client.close();
            }
        } catch (_) {}

        if (!targetVideo) {
            return await reply(`⚠️ අංක "${codeQuery}" ට අදාළ Video එකක් හමුනොවීය. කරුණාකර .xrd මඟින් Collage එක Open කර Code එක පරීක්ෂා කරන්න.`);
        }

        await deliverVideoToChat(conn, from, targetVideo, mek);

    } catch (err) {
        console.error("Video dispatch error:", err);
        await reply(`⚠️ Video එක ලබාගැනීමේදී දෝෂයක් සිදුවිය: ${err.message}`);
    }
});

// 5. Direct Digits Body Listener (e.g. typing 01, 02... 10, 11, etc. directly in chat)
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, isOwner, sender, reply }) => {
    try {
        const text = (body || '').trim();
        const numMatch = text.match(/^[.#]?(\d{1,3})$/);
        if (!numMatch) return;
        let code = numMatch[1];
        if (code.length === 1) code = '0' + code;

        const vipAuth = await isVipUser(sender || from, isOwner, conn, mek);
        if (!vipAuth.isVip) return;

        // Check local
        const local41 = getLocalSection41Videos();
        if (local41 && local41.videos) {
            const match = local41.videos.find(v => v.code === code || v.code === code.replace(/^0+/, ''));
            if (match && fs.existsSync(match.filePath)) {
                return await deliverVideoToChat(conn, from, match, mek);
            }
        }

        // Check Telegram / MongoDB
        try {
            const { MongoClient } = require('mongodb');
            if (process.env.MONGODB_URI) {
                const client = new MongoClient(process.env.MONGODB_URI);
                await client.connect();
                const targetVideo = await client.db('whatsapp_bot').collection('telegram_videos').findOne({
                    $or: [{ code }, { code: code.replace(/^0+/, '') }]
                });
                await client.close();

                if (targetVideo) {
                    return await deliverVideoToChat(conn, from, targetVideo, mek);
                }
            }
        } catch (_) {}
    } catch (_) {}
});

// 6. Manual Sync Command: .sync
cmd({
    pattern: "sync",
    alias: ["synctg", "syncvideos"],
    desc: "Sync collages and videos from Telegram",
    category: "vip"
}, async (conn, mek, m, { reply, isOwner }) => {
    if (!isOwner) return;
    try {
        await reply("🔄 *Telegram වෙතින් Collages සහ Videos Sync වෙමින් පවතී...*");
        const { execFileSync } = require('child_process');
        execFileSync(process.execPath, [path.join(__dirname, '../sync_telegram.js')], { stdio: 'pipe' });
        await reply("✅ *Collages සහ Videos සාර්ථකව Sync විය! දැන් .xrd මඟින් අලුත් Collages බලන්න.*");
    } catch (e) {
        await reply(`❌ Sync දෝෂයක්: ${e.message}`);
    }
});

// 7. Full Video Catalog: .vlist
cmd({
    pattern: "vlist",
    alias: ["vcatalog", "videos"],
    desc: "Show full VIP Video Catalog with codes",
    category: "vip"
}, async (conn, mek, m, { from, sender, isOwner }) => {
    const vipAuth = await isVipUser(sender || from, isOwner, conn, mek);
    if (!vipAuth.isVip) return;
    const collages = await getCollagesCatalog();
    let listText = `👑 *DMC™ VIP COLLAGE & VIDEO CATALOG* 🎬\n\n`;
    collages.forEach(c => {
        listText += `🖼️ *#Collage${c.collageNum}* (${c.videos.length} Videos):\n`;
        (c.videos || []).forEach(v => {
            listText += `  • [${v.code}] *${v.title}* (${v.sizeFmt || 'HD'})\n`;
        });
        listText += `\n`;
    });
    listText += `💡 _ඕනෑම Video එකක් ලබාගැනීමට \`.v <Code>\` ලෙස එවන්න (උදා: \`.v 01\` හෝ \`.v 10\`)_`;
    await conn.sendMessage(from, { text: listText });
});

module.exports = {
    extractCleanNumber,
    isVipUser,
    generateVipToken,
    sendWhatsAppRemoteCard: sendWhatsAppCollageRemoteCard,
    sendWhatsAppCollageRemoteCard,
    getCollagesCatalog,
    getLocalSection41Videos
};
