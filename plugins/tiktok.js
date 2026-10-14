/**
 * 👑 DMC TIKTOK NO-WATERMARK HD DOWNLOADER (POLL & 1-TAP CATEGORIES) 👑
 * LOGIC: High-speed TikTok Scraper via TikWM Engine
 *        - HD Original (No Watermark)
 *        - No Watermark MP4
 *        - MP3 Audio
 * 
 * 100% Isolated Plugin - Preserves existing YouTube & Playwright hardcode logic.
 */

const { cmd } = require('../command');
const axios = require('axios');

// In-memory cache for pending user selections (Key: jid/sender)
// Auto-purged after 10 minutes to prevent memory leaks
const pendingTikTok = new Map();

// Periodic cleanup of stale sessions older than 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of pendingTikTok.entries()) {
        if (now - value.timestamp > 600000) {
            pendingTikTok.delete(key);
        }
    }
}, 60000);

/**
 * Fetch video details from TikWM API
 */
async function fetchTikTokData(tiktokUrl) {
    try {
        const response = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 25000
        });

        if (response.data && response.data.code === 0 && response.data.data) {
            return response.data.data;
        }
        return null;
    } catch (err) {
        console.error("[TIKTOK API ERROR]:", err.message);
        return null;
    }
}

/**
 * Helper to deliver chosen format to user
 */
async function sendChosenFormat(conn, from, mek, session, formatType) {
    try {
        const { data, title, author } = session;
        const cleanTitle = title || "TikTok Video";
        const authorName = author?.nickname || author?.unique_id || "TikTok User";

        if (formatType === 'audio') {
            await conn.sendMessage(from, { text: "⏳ *Audio (MP3) සකසමින් පවතී... කරුණාකර රැඳී සිටින්න.*" }, { quoted: mek });
            const audioUrl = data.music || data.music_info?.play;
            if (!audioUrl) {
                return conn.sendMessage(from, { text: "❌ *Audio stream එක ලබා ගැනීමට නොහැකි විය.*" }, { quoted: mek });
            }

            await conn.sendMessage(from, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle.slice(0, 40)}.mp3`,
                ptt: false
            }, { quoted: mek });
            return;
        }

        const isHD = (formatType === 'hd');
        const videoUrl = isHD ? (data.hdplay || data.play) : data.play;

        if (!videoUrl) {
            return conn.sendMessage(from, { text: "❌ *Video stream එක ලබා ගැනීමට නොහැකි විය.*" }, { quoted: mek });
        }

        const formatLabel = isHD ? "HD Original (No Watermark)" : "No Watermark MP4";
        await conn.sendMessage(from, { text: `⏳ *${formatLabel} Download වෙමින් පවතී...*` }, { quoted: mek });

        await conn.sendMessage(from, {
            video: { url: videoUrl },
            caption: `👑 *${cleanTitle}* 👑\n\n` +
                     `✨ *Format:* ${formatLabel}\n` +
                     `👤 *Author:* @${authorName}\n` +
                     `👁️ *Views:* ${(data.play_count || 0).toLocaleString()}\n` +
                     `❤️ *Likes:* ${(data.digg_count || 0).toLocaleString()}\n\n` +
                     `_Downloaded via ＤＭＣ™ Core Engine_`
        }, { quoted: mek });

    } catch (e) {
        console.error("[TIKTOK SEND ERROR]:", e.message);
        await conn.sendMessage(from, { text: "❌ *Download කිරීමේදී දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.*" }, { quoted: mek });
    }
}

/**
 * Global Poll Vote Hook for Native WhatsApp Polls
 */
const existingPollHandler = global.processPollVote;
global.processPollVote = async (sender, selectedOption, sock) => {
    try {
        if (typeof existingPollHandler === 'function') {
            try { await existingPollHandler(sender, selectedOption, sock); } catch (_) {}
        }

        if (!sender || !selectedOption) return;

        // Normalize sender key
        const userKey = sender.replace('@lid', '').replace('@s.whatsapp.net', '').replace('@c.us', '');
        let matchedSession = null;
        let matchedKey = null;

        for (const [key, session] of pendingTikTok.entries()) {
            if (key.includes(userKey) || userKey.includes(key.split('_')[0])) {
                matchedSession = session;
                matchedKey = key;
                break;
            }
        }

        if (!matchedSession) return;

        const opt = selectedOption.trim().toLowerCase();
        let chosen = null;

        if (opt.includes("hd original") || opt.includes("hd")) {
            chosen = 'hd';
        } else if (opt.includes("no watermark mp4") || opt.includes("no watermark") || opt.includes("mp4")) {
            chosen = 'nowm';
        } else if (opt.includes("mp3 audio") || opt.includes("audio") || opt.includes("mp3")) {
            chosen = 'audio';
        }

        if (chosen) {
            await sendChosenFormat(sock, matchedSession.from, matchedSession.mek, matchedSession, chosen);
            pendingTikTok.delete(matchedKey);
        }
    } catch (err) {
        console.error("[TIKTOK POLL VOTE ERROR]:", err.message);
    }
};

// --------------------------------------------------------------------------
// 1. COMMAND HANDLER: .tiktok <url>, .tt <url>, .tik <url>
// --------------------------------------------------------------------------
cmd({
    pattern: "tiktok",
    alias: ["tt", "tik", "ttdl", "tiktokdl"],
    react: "📱",
    desc: "Download TikTok videos with/without watermark & MP3",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, sender }) => {
    try {
        if (mek.key.fromMe) return;

        let url = (q || "").trim();
        if (!url) {
            // Check quoted message for link
            const quoted = mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                const text = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
                const match = text.match(/https?:\/\/(www\.|vm\.|vt\.|t\.)?tiktok\.com\/[^\s]+/i);
                if (match) url = match[0];
            }
        }

        if (!url || !url.includes("tiktok.com")) {
            return reply("⚠️ *කරුණාකර TikTok වීඩියෝ ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*.tiktok https://vt.tiktok.com/...*");
        }

        await reply("⏳ *TikTok තොරතුරු ලබාගනිමින් පවතී...*");

        const data = await fetchTikTokData(url);
        if (!data || (!data.play && !data.hdplay)) {
            return reply("❌ *TikTok වීඩියෝව සොයාගත නොහැකි විය. ලින්ක් එක නිවැරදි දැයි පරීක්ෂා කරන්න.*");
        }

        const sessionKey = `${(sender || from).split('@')[0]}_${from}`;
        const sessionData = {
            data,
            title: data.title || "TikTok Video",
            author: data.author,
            from,
            mek,
            timestamp: Date.now()
        };
        pendingTikTok.set(sessionKey, sessionData);

        const cleanTitle = (data.title || "TikTok Video").slice(0, 60);

        // A. Send Native WhatsApp Poll with the exact 3 categories from user's image
        try {
            const pollOptions = [
                "HD Original (No Watermark)",
                "No Watermark MP4",
                "MP3 Audio"
            ];

            const pollMsg = await conn.sendMessage(from, {
                poll: {
                    name: `🎬 *TIKTOK DOWNLOADER* 🎬\n\n📌 *Title:* ${cleanTitle}\n\nකරුණාකර ඔබට අවශ්‍ය Format එක තෝරන්න (Select Format):`,
                    values: pollOptions,
                    selectableCount: 1
                }
            }, { quoted: mek });

            if (global.activePolls && pollMsg?.key?.id) {
                global.activePolls.set(pollMsg.key.id, {
                    message: pollMsg,
                    creatorJid: conn.user?.id || from,
                    options: pollOptions
                });
            }
        } catch (pollErr) {
            console.log("[TIKTOK POLL CREATE ERROR]:", pollErr.message);
        }

        // B. Send Numbered Fallback Menu for users who prefer replying with numbers (1, 2, 3)
        const menuText = `👑 *ＤＭＣ™ TIKTOK DOWNLOADER* 👑\n\n` +
                         `📌 *Title:* ${cleanTitle}\n` +
                         `👤 *Author:* @${data.author?.nickname || "User"}\n\n` +
                         `කරුණාකර ඉහත Poll එක Vote කරන්න, නැතහොත් අදාළ *අංකය (1, 2, හෝ 3)* Reply කරන්න:\n\n` +
                         `  [1] 🌟 *HD Original (No Watermark)*\n` +
                         `  [2] 🎬 *No Watermark MP4*\n` +
                         `  [3] 🎵 *MP3 Audio*\n\n` +
                         `_DMC Modern Automation Core_`;

        await conn.sendMessage(from, { text: menuText }, { quoted: mek });

    } catch (err) {
        console.error("[TIKTOK CMD ERROR]:", err.message);
        reply("❌ *TikTok Download කිරීමේදී දෝෂයක් ඇති විය.*");
    }
});

// --------------------------------------------------------------------------
// 2. PASSIVE LISTENER: Auto-detect TikTok links & reply with 1, 2, 3 selection
// --------------------------------------------------------------------------
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, reply, sender }) => {
    try {
        if (!body || mek.key.fromMe) return;

        const trimmed = body.trim();
        const userKey = `${(sender || from).split('@')[0]}_${from}`;

        // A. Check if the user replied with 1, 2, or 3 for pending selection
        if (pendingTikTok.has(userKey)) {
            const input = trimmed.toLowerCase();
            let chosen = null;

            if (input === '1' || input === 'hd' || input.includes('original')) {
                chosen = 'hd';
            } else if (input === '2' || input === 'mp4' || input.includes('no watermark') || input === 'nowm') {
                chosen = 'nowm';
            } else if (input === '3' || input === 'audio' || input === 'mp3') {
                chosen = 'audio';
            }

            if (chosen) {
                const session = pendingTikTok.get(userKey);
                pendingTikTok.delete(userKey);
                await sendChosenFormat(conn, from, mek, session, chosen);
                return;
            }
        }

        // B. Passive link detection: Auto-detect TikTok URL pasted directly
        const tiktokRegex = /^(https?:\/\/)?(www\.|vm\.|vt\.|t\.)?tiktok\.com\/[^\s]+$/i;
        if (!tiktokRegex.test(trimmed)) return;

        // Skip if it was already a command
        if (trimmed.startsWith('.') || trimmed.startsWith('!') || trimmed.startsWith('/')) return;

        await reply("⏳ *TikTok ලින්ක් එක හඳුනාගන්නා ලදී. විස්තර ලබාගනිමින් පවතී...*");

        const data = await fetchTikTokData(trimmed);
        if (!data || (!data.play && !data.hdplay)) {
            return reply("❌ *TikTok වීඩියෝව සොයාගත නොහැකි විය.*");
        }

        const sessionData = {
            data,
            title: data.title || "TikTok Video",
            author: data.author,
            from,
            mek,
            timestamp: Date.now()
        };
        pendingTikTok.set(userKey, sessionData);

        const cleanTitle = (data.title || "TikTok Video").slice(0, 60);

        // Send Native WhatsApp Poll
        try {
            const pollOptions = [
                "HD Original (No Watermark)",
                "No Watermark MP4",
                "MP3 Audio"
            ];

            const pollMsg = await conn.sendMessage(from, {
                poll: {
                    name: `🎬 *TIKTOK DOWNLOADER* 🎬\n\n📌 *Title:* ${cleanTitle}\n\nකරුණාකර Format එකක් තෝරන්න (Select Format):`,
                    values: pollOptions,
                    selectableCount: 1
                }
            }, { quoted: mek });

            if (global.activePolls && pollMsg?.key?.id) {
                global.activePolls.set(pollMsg.key.id, {
                    message: pollMsg,
                    creatorJid: conn.user?.id || from,
                    options: pollOptions
                });
            }
        } catch (_) {}

        // Numbered Fallback Prompt
        const menuText = `👑 *ＤＭＣ™ TIKTOK DOWNLOADER* 👑\n\n` +
                         `📌 *Title:* ${cleanTitle}\n` +
                         `👤 *Author:* @${data.author?.nickname || "User"}\n\n` +
                         `කරුණාකර ඉහත Poll එක Vote කරන්න, නැතහොත් අදාළ *අංකය (1, 2, හෝ 3)* Reply කරන්න:\n\n` +
                         `  [1] 🌟 *HD Original (No Watermark)*\n` +
                         `  [2] 🎬 *No Watermark MP4*\n` +
                         `  [3] 🎵 *MP3 Audio*\n\n` +
                         `_DMC Modern Automation Core_`;

        await conn.sendMessage(from, { text: menuText }, { quoted: mek });

    } catch (err) {
        console.error("[TIKTOK AUTO DETECT ERROR]:", err.message);
    }
});
