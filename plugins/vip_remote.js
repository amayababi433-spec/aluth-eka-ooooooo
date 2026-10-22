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

// Helper: Safely extract clean international phone number without multi-device colon suffixes
function extractCleanNumber(jid) {
    if (!jid) return '';
    // Strip JID domain and device identifier (:1, :0, etc.)
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
        const vipAuth = await isVipUser(senderJid, isOwner, conn, mek);

        if (!vipAuth.isVip) {
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
    extractCleanNumber,
    isVipUser,
    generateVipToken
};
