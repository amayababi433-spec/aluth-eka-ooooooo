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

// Helper: Get Safe Catalog (guarantees non-empty)
function getCatalog() {
    if (global.vipVideoCatalog && Array.isArray(global.vipVideoCatalog) && global.vipVideoCatalog.length > 0) {
        return global.vipVideoCatalog;
    }
    return [
        {
            name: '🎬 Action Movies',
            videos: [
                { id: 'v1', code: '01', title: 'Action Thriller Part 1', sizeFmt: '520 MB', durationFmt: '45m', quality: '1080p Full HD' },
                { id: 'v2', code: '02', title: 'Action Thriller Part 2', sizeFmt: '610 MB', durationFmt: '50m', quality: '1080p Full HD' },
                { id: 'v3', code: '03', title: 'Action Thriller Part 3', sizeFmt: '490 MB', durationFmt: '38m', quality: '1080p Full HD' }
            ]
        },
        {
            name: '📺 Hindi Teledramas',
            videos: [
                { id: 'v4', code: '04', title: 'Hindi Dubbed Episode 1', sizeFmt: '350 MB', durationFmt: '42m', quality: '720p HD' },
                { id: 'v5', code: '05', title: 'Hindi Dubbed Episode 2', sizeFmt: '380 MB', durationFmt: '44m', quality: '720p HD' }
            ]
        }
    ];
}

// Helper: Send the WhatsApp Native TV Controller (Card + Poll Controls)
async function sendWhatsAppRemoteCard(conn, toJid, cleanNumber, isOwner) {
    const catalog = getCatalog();
    let session = global.vipUserRemoteSessions.get(cleanNumber);
    if (!session) {
        session = { folderIndex: 0, videoIndex: 0, lastActionTime: 0 };
        global.vipUserRemoteSessions.set(cleanNumber, session);
    }

    // Safety checks for bounds
    if (session.folderIndex >= catalog.length) session.folderIndex = 0;
    if (session.folderIndex < 0) session.folderIndex = catalog.length - 1;

    const currentFolder = catalog[session.folderIndex] || catalog[0];
    const videos = currentFolder.videos || [];

    if (session.videoIndex >= videos.length) session.videoIndex = 0;
    if (session.videoIndex < 0) session.videoIndex = Math.max(0, videos.length - 1);

    const currentVideo = videos[session.videoIndex] || { title: 'No Videos in Folder', code: '00', sizeFmt: 'N/A', quality: 'HD' };

    const token = generateVipToken(cleanNumber);
    const baseUrl = getRemoteBaseUrl();
    const remoteUrl = `${baseUrl}/remote?token=${encodeURIComponent(token)}&user=${encodeURIComponent(cleanNumber)}`;

    const captionText = 
        `👑 *DMC™ VIP TV REMOTE CONTROLLER* 📺\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📁 *FOLDER [${session.folderIndex + 1}/${catalog.length}]:* ${currentFolder.name}\n` +
        `🎬 *VIDEO [${session.videoIndex + 1}/${videos.length}]:* *${currentVideo.title}*\n` +
        `💾 *Size:* ${currentVideo.sizeFmt || 'HD'}  |  ⏱️ *Duration:* ${currentVideo.durationFmt || 'HD'}\n` +
        `🌟 *Quality:* ${currentVideo.quality || '1080p Full HD'}\n` +
        `🔢 *Direct Code:* \`.v ${currentVideo.code}\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎮 *WHATSAPP NATIVE CONTROLLER:*\n` +
        `පහත Poll Buttons මඟින් Real-time Folders හා Videos මාරු කර ගන්න _(WhatsApp Package අයට Data කැපෙන්නේ නැත)_:\n\n` +
        `▶️ *Next Video* | ◀️ *Prev Video*\n` +
        `📁 *Next Folder* | 📁 *Prev Folder*\n` +
        `🔴 *SEND THIS VIDEO* (කෙළින්ම Chat එකට එවයි)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 _Normal Data හෝ WiFi ඇති අයට Web Remote Screen එක:_ \n` +
        `🔗 ${remoteUrl}`;

    // Send visual card
    const pollImgPath = path.join(__dirname, '../thumbnail/poll.png');
    const menuImgPath = path.join(__dirname, '../thumbnail/menu.png');
    let imgBuffer = null;
    if (fs.existsSync(pollImgPath)) imgBuffer = fs.readFileSync(pollImgPath);
    else if (fs.existsSync(menuImgPath)) imgBuffer = fs.readFileSync(menuImgPath);

    if (imgBuffer) {
        await conn.sendMessage(toJid, {
            image: imgBuffer,
            caption: captionText,
            mimetype: 'image/png'
        });
    } else {
        await conn.sendMessage(toJid, { text: captionText });
    }

    // Send Interactive Controller Poll (Works 100% inside WhatsApp on all data packages)
    const pollMsg = await conn.sendMessage(toJid, {
        poll: {
            name: `🎮 TV Remote: [${currentFolder.name}] • Vid ${session.videoIndex + 1}/${videos.length}`,
            values: [
                "▶️ Next Video",
                "◀️ Previous Video",
                "📁 Next Folder ⬇️",
                "📁 Previous Folder ⬆️",
                "🔴 SEND THIS VIDEO (WhatsApp)",
                "📑 Show Full Video List"
            ],
            selectableCount: 1
        }
    });

    if (pollMsg?.key?.id && global.activePolls) {
        global.activePolls.set(pollMsg.key.id, pollMsg);
    }
}

// 🎮 Interactive WhatsApp Poll Controller Handler
global.processVipRemotePollVote = async function(senderJid, optionName, sock) {
    if (!optionName || typeof optionName !== 'string') return;

    const validOptions = [
        "▶️ Next Video",
        "◀️ Previous Video",
        "📁 Next Folder ⬇️",
        "📁 Previous Folder ⬆️",
        "🔴 SEND THIS VIDEO (WhatsApp)",
        "📑 Show Full Video List"
    ];

    const isOurPoll = validOptions.some(opt => optionName.includes(opt.split(' ')[1] || opt));
    if (!isOurPoll) return;

    const cleanNumber = extractCleanNumber(senderJid);
    let session = global.vipUserRemoteSessions.get(cleanNumber);
    if (!session) {
        session = { folderIndex: 0, videoIndex: 0, lastActionTime: 0 };
        global.vipUserRemoteSessions.set(cleanNumber, session);
    }

    // Debounce to prevent double tap
    const now = Date.now();
    if (now - (session.lastActionTime || 0) < 600) return;
    session.lastActionTime = now;

    const catalog = getCatalog();
    const currentFolder = catalog[session.folderIndex] || catalog[0];
    const videos = currentFolder.videos || [];

    if (optionName.includes("Next Video")) {
        session.videoIndex = (session.videoIndex + 1) % Math.max(1, videos.length);
        await sendWhatsAppRemoteCard(sock, senderJid, cleanNumber, false);
    } else if (optionName.includes("Previous Video")) {
        session.videoIndex = (session.videoIndex - 1 + videos.length) % Math.max(1, videos.length);
        await sendWhatsAppRemoteCard(sock, senderJid, cleanNumber, false);
    } else if (optionName.includes("Next Folder")) {
        session.folderIndex = (session.folderIndex + 1) % catalog.length;
        session.videoIndex = 0;
        await sendWhatsAppRemoteCard(sock, senderJid, cleanNumber, false);
    } else if (optionName.includes("Previous Folder")) {
        session.folderIndex = (session.folderIndex - 1 + catalog.length) % catalog.length;
        session.videoIndex = 0;
        await sendWhatsAppRemoteCard(sock, senderJid, cleanNumber, false);
    } else if (optionName.includes("SEND THIS VIDEO")) {
        const targetVideo = videos[session.videoIndex];
        if (targetVideo) {
            await sock.sendMessage(senderJid, {
                text: `⏳ *"${targetVideo.title}"* සූදානම් කරමින් පවතී... WhatsApp වෙත Document එකක් ලෙස එවනු ඇත.`
            });
            if (typeof global.dispatchVipVideoToWhatsApp === 'function') {
                await global.dispatchVipVideoToWhatsApp(senderJid, targetVideo);
            }
        }
    } else if (optionName.includes("Show Full Video List")) {
        let listText = `👑 *DMC™ VIP VIDEO CATALOG* 🎬\n\n`;
        catalog.forEach((f, fIdx) => {
            listText += `📁 *${f.name}:*\n`;
            (f.videos || []).forEach((v, vIdx) => {
                listText += `  • [${v.code || (vIdx + 1)}] *${v.title}* (${v.sizeFmt || 'HD'})\n`;
            });
            listText += `\n`;
        });
        listText += `💡 _ඕනෑම Video එකක් ලබාගැනීමට \`.v <Code>\` ලෙස එවන්න (උදා: \`.v 01\`)_`;
        await sock.sendMessage(senderJid, { text: listText });
    }
};

// 1. Main Command: .xrd (VIP Video Remote Controller)
cmd({
    pattern: "xrd",
    alias: ["xrdremote", "vipremote", "tvremote"],
    desc: "Open VIP Live Video Remote Controller (WhatsApp Native + Web)",
    category: "vip",
    react: "🎮"
}, async (conn, mek, m, { from, sender, isOwner, reply }) => {
    try {
        const senderJid = sender || mek.key.participant || from;
        
        // 🔒 VIP Authorization Check with real-time multi-device & MongoDB lookup
        const vipAuth = await isVipUser(senderJid, isOwner, conn, mek);
        const cleanNumber = vipAuth.cleanNumber;

        console.log(`👑 [VIP Remote] .xrd triggered by ${senderJid} (Normalized: ${cleanNumber}) => VIP: ${vipAuth.isVip}`);

        if (!vipAuth.isVip) {
            return await reply(
                "⛔ *ACCESS DENIED (VIP ONLY)* ⛔\n\n" +
                "මෙම විශේෂිත Video Remote Controller එක ලබාගැනීමට ඔබට අවසර (VIP Access) නොමැත.\n\n" +
                "💡 _අවසර ලබාගැනීම සඳහා කරුණාකර Bot Owner (+94717884174) සම්බන්ධ කරගන්න._"
            );
        }

        // Send WhatsApp Native Controller (Card + Poll) - Works 100% on WhatsApp Packages!
        await sendWhatsAppRemoteCard(conn, from, cleanNumber, isOwner);

    } catch (e) {
        console.error("VIP Remote Error:", e);
        await reply("⚠️ Controller එක open කිරීමේදී දෝෂයක් සිදුවිය. කරුණාකර සුළු මොහොතකින් නැවත උත්සාහ කරන්න.");
    }
});

// 2. Direct Jump by Digits Command: .v <code/number>
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
            return await reply("⛔ *ACCESS DENIED:* ඔබට VIP Access නොමැත.");
        }

        const codeQuery = (args[0] || '').trim().toLowerCase();
        if (!codeQuery) {
            return await reply("💡 *භාවිතය:* `.v <code/number>` (උදා: `.v 01` හෝ `.v 05`)");
        }

        const catalog = getCatalog();
        let targetVideo = null;
        for (const f of catalog) {
            for (const v of (f.videos || [])) {
                if (String(v.code).toLowerCase() === codeQuery || String(v.title).toLowerCase().includes(codeQuery)) {
                    targetVideo = v;
                    break;
                }
            }
            if (targetVideo) break;
        }

        if (!targetVideo) {
            return await reply(`⚠️ අංක "${codeQuery}" ට අදාළ Video එකක් හමුනොවීය. කරුණාකර .xrd මඟින් Remote එක Open කර Code එක පරීක්ෂා කරන්න.`);
        }

        await reply(`⏳ *"${targetVideo.title}"* සූදානම් කරමින් පවතී... WhatsApp වෙත එවනු ඇත.`);

        if (typeof global.dispatchVipVideoToWhatsApp === 'function') {
            await global.dispatchVipVideoToWhatsApp(from, targetVideo);
        } else {
            await reply(`🎬 *[VIP VIDEO READY]*\n\n📁 Title: ${targetVideo.title}\n💾 Size: ${targetVideo.sizeFmt || 'HD'}\n🔗 Link: ${targetVideo.url || targetVideo.downloadUrl}`);
        }

    } catch (err) {
        console.error("Quick Jump Error:", err);
        await reply("⚠️ Video එක ලබාගැනීමේදී දෝෂයක් සිදුවිය.");
    }
});

// 3. Quick Text Remote Navigators (.vn, .vp, .vf, .vok, .vlist)
cmd({ pattern: "vn", alias: ["vnext"], desc: "Remote: Next Video", category: "vip" }, async (conn, mek, m, { from, sender, isOwner }) => {
    const vipAuth = await isVipUser(sender || from, isOwner, conn, mek);
    if (!vipAuth.isVip) return;
    let s = global.vipUserRemoteSessions.get(vipAuth.cleanNumber) || { folderIndex: 0, videoIndex: 0 };
    const catalog = getCatalog();
    const curFolder = catalog[s.folderIndex] || catalog[0];
    s.videoIndex = (s.videoIndex + 1) % Math.max(1, curFolder.videos.length);
    global.vipUserRemoteSessions.set(vipAuth.cleanNumber, s);
    await sendWhatsAppRemoteCard(conn, from, vipAuth.cleanNumber, isOwner);
});

cmd({ pattern: "vp", alias: ["vprev"], desc: "Remote: Prev Video", category: "vip" }, async (conn, mek, m, { from, sender, isOwner }) => {
    const vipAuth = await isVipUser(sender || from, isOwner, conn, mek);
    if (!vipAuth.isVip) return;
    let s = global.vipUserRemoteSessions.get(vipAuth.cleanNumber) || { folderIndex: 0, videoIndex: 0 };
    const catalog = getCatalog();
    const curFolder = catalog[s.folderIndex] || catalog[0];
    s.videoIndex = (s.videoIndex - 1 + curFolder.videos.length) % Math.max(1, curFolder.videos.length);
    global.vipUserRemoteSessions.set(vipAuth.cleanNumber, s);
    await sendWhatsAppRemoteCard(conn, from, vipAuth.cleanNumber, isOwner);
});

cmd({ pattern: "vf", alias: ["vfolder"], desc: "Remote: Next Folder", category: "vip" }, async (conn, mek, m, { from, sender, isOwner }) => {
    const vipAuth = await isVipUser(sender || from, isOwner, conn, mek);
    if (!vipAuth.isVip) return;
    let s = global.vipUserRemoteSessions.get(vipAuth.cleanNumber) || { folderIndex: 0, videoIndex: 0 };
    const catalog = getCatalog();
    s.folderIndex = (s.folderIndex + 1) % catalog.length;
    s.videoIndex = 0;
    global.vipUserRemoteSessions.set(vipAuth.cleanNumber, s);
    await sendWhatsAppRemoteCard(conn, from, vipAuth.cleanNumber, isOwner);
});

cmd({ pattern: "vok", alias: ["vsend"], desc: "Remote: Send Current Video", category: "vip" }, async (conn, mek, m, { from, sender, isOwner, reply }) => {
    const vipAuth = await isVipUser(sender || from, isOwner, conn, mek);
    if (!vipAuth.isVip) return;
    let s = global.vipUserRemoteSessions.get(vipAuth.cleanNumber) || { folderIndex: 0, videoIndex: 0 };
    const catalog = getCatalog();
    const curFolder = catalog[s.folderIndex] || catalog[0];
    const targetVideo = curFolder.videos[s.videoIndex];
    if (targetVideo) {
        await reply(`⏳ *"${targetVideo.title}"* සූදානම් කරමින් පවතී... WhatsApp වෙත එවනු ඇත.`);
        if (typeof global.dispatchVipVideoToWhatsApp === 'function') {
            await global.dispatchVipVideoToWhatsApp(from, targetVideo);
        }
    }
});

module.exports = {
    extractCleanNumber,
    isVipUser,
    generateVipToken,
    sendWhatsAppRemoteCard
};
