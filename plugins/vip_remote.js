/**
 * 👑 DMC VIP VIDEO CONTROLLER & TELEGRAM STREAM ENGINE (.xrd) 👑
 * Exclusive VIP Access: Only numbers added via Dashboard can access .xrd
 */

const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');

const SESSION_SECRET = process.env.ADMIN_SECRET || 'dmc_admin_secret_787898_pasindu';

// Helper: Check if sender is VIP or Owner
function isVipUser(senderJid, isOwner) {
    if (isOwner) return true;
    const cleanNumber = (senderJid || '').split('@')[0].replace(/[^0-9]/g, '');
    if (cleanNumber === '94717884174' || cleanNumber === (config.OWNER_NUMBER || '').replace(/[^0-9]/g, '')) return true;
    if (global.vipVideoUsersCache && global.vipVideoUsersCache.has(cleanNumber)) return true;
    return false;
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
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    if (process.env.KOYEB_APP_NAME) return `https://${process.env.KOYEB_APP_NAME}.koyeb.app`;
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
    return `http://localhost:${process.env.PORT || 8000}`;
}

// 1. Main Command: .xrd (VIP Video Remote Controller)
cmd({
    pattern: "xrd",
    alias: ["xrdremote", "vipremote", "tvremote"],
    desc: "Open VIP Live Video Remote Controller",
    category: "vip",
    react: "🎮"
}, async (conn, mek, m, { from, sender, isOwner, reply }) => {
    try {
        const senderJid = sender || mek.key.participant || from;
        const cleanNumber = (senderJid || '').split('@')[0].replace(/[^0-9]/g, '');

        // 🔒 VIP Authorization Check
        if (!isVipUser(senderJid, isOwner)) {
            return await reply(
                "⛔ *ACCESS DENIED (VIP ONLY)* ⛔\n\n" +
                "මෙම විශේෂිත Video Remote Controller එක ලබාගැනීමට ඔබට අවසර (VIP Access) නොමැත.\n\n" +
                "💡 _අවසර ලබාගැනීම සඳහා කරුණාකර Bot Owner (+94717884174) සම්බන්ධ කරගන්න._"
            );
        }

        const token = generateVipToken(cleanNumber);
        const baseUrl = getRemoteBaseUrl();
        const remoteUrl = `${baseUrl}/remote?token=${encodeURIComponent(token)}&user=${encodeURIComponent(cleanNumber)}`;

        // Catalog count
        let folderCount = 1;
        let videoCount = 0;
        if (global.vipVideoCatalog && Array.isArray(global.vipVideoCatalog)) {
            folderCount = global.vipVideoCatalog.length;
            videoCount = global.vipVideoCatalog.reduce((sum, f) => sum + (f.videos ? f.videos.length : 0), 0);
        }

        const captionText = 
            `👑 *DMC™ VIP VIDEO CONTROLLER* 📺\n\n` +
            `👤 *VIP User:* +${cleanNumber}\n` +
            `📁 *Available Folders:* ${folderCount}\n` +
            `🎬 *Indexed Videos:* ${videoCount > 0 ? videoCount : 'Cloud Live Synced'}\n\n` +
            `🎮 *Real-time Remote Control:* පහත Link එක Tap කර Live Controller Screen එක Open කරගන්න. Buttons වලින් Video තෝරා මැද රතු Button එකෙන් WhatsApp එකට ලබාගන්න.\n\n` +
            `🔗 *Launch Remote:* \n${remoteUrl}`;

        // Send with thumbnail if exists
        const pollImgPath = path.join(__dirname, '../thumbnail/poll.png');
        const menuImgPath = path.join(__dirname, '../thumbnail/menu.png');
        let imgBuffer = null;
        if (fs.existsSync(pollImgPath)) {
            imgBuffer = fs.readFileSync(pollImgPath);
        } else if (fs.existsSync(menuImgPath)) {
            imgBuffer = fs.readFileSync(menuImgPath);
        }

        if (imgBuffer) {
            await conn.sendMessage(from, {
                image: imgBuffer,
                caption: captionText,
                mimetype: 'image/png'
            }, { quoted: mek });
        } else {
            await reply(captionText);
        }

    } catch (e) {
        console.error("VIP Remote Error:", e);
        await reply("⚠️ Controller link එක generate කිරීමේදී දෝෂයක් සිදුවිය. කරුණාකර සුළු මොහොතකින් නැවත උත්සාහ කරන්න.");
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
        if (!isVipUser(senderJid, isOwner)) {
            return await reply("⛔ *ACCESS DENIED:* ඔබට VIP Access නොමැත.");
        }

        const codeQuery = (args[0] || '').trim().toLowerCase();
        if (!codeQuery) {
            return await reply("💡 *භාවිතය:* `.v <code/number>` (උදා: `.v 05` හෝ `.v 12`)");
        }

        // Find video in catalog
        let targetVideo = null;
        if (global.vipVideoCatalog) {
            for (const f of global.vipVideoCatalog) {
                for (const v of (f.videos || [])) {
                    if (String(v.code).toLowerCase() === codeQuery || String(v.title).toLowerCase().includes(codeQuery)) {
                        targetVideo = v;
                        break;
                    }
                }
                if (targetVideo) break;
            }
        }

        if (!targetVideo) {
            return await reply(`⚠️ අංක "${codeQuery}" ට අදාළ Video එකක් හමුනොවීය. කරුණාකර .xrd මඟින් Remote එක Open කර Code එක පරීක්ෂා කරන්න.`);
        }

        await reply(`⏳ *"${targetVideo.title}"* සූදානම් කරමින් පවතී... WhatsApp වෙත එවනු ඇත.`);

        // Dispatch video via global sender helper if available
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

module.exports = {
    isVipUser,
    generateVipToken
};
