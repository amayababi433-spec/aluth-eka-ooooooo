/**
 * 👑 DMC TIKTOK NO-WATERMARK HD DOWNLOADER V3 (CLOUD-RESILIENT HYBRID ENGINE) 👑
 * LOGIC: Ultra-resilient multi-engine scraper optimized for Cloud/Koyeb hosting
 *        - Engine 1: SSSTik Scraper (Bypasses Cloudflare on Datacenter/Cloud IPs)
 *        - Engine 2: TikWM POST (High-speed mobile mimic with origin guard)
 *        - Engine 3: TikWM GET Endpoint
 *        - Format 1: HD Original (No Watermark)
 *        - Format 2: No Watermark MP4
 *        - Format 3: MP3 Audio
 * 
 * 100% Isolated Plugin - Preserves existing YouTube & Playwright hardcode logic.
 */

const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

// In-memory cache for pending user selections (Key: jid/sender)
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
 * Intelligent URL Extractor:
 * Extracts genuine TikTok URL even from multi-line messages, previews, or messy copy-pastes.
 */
function extractTikTokUrl(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/https?:\/\/(?:www\.|vm\.|vt\.|t\.|v\.)?tiktok\.com\/[^\s<>"')]+/i);
    if (!match) return null;
    return match[0].trim();
}

/**
 * ENGINE 1: SSSTik Scraper (100% Cloud/Koyeb Datacenter Safe)
 */
async function scrapeSSSTik(tiktokUrl) {
    try {
        const res1 = await axios.get('https://ssstik.io/en', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000
        });

        const cookies = res1.headers['set-cookie'];
        const ttMatch = res1.data.match(/s_tt\s*=\s*['"]([^'"]+)['"]/i);
        const tt = ttMatch ? ttMatch[1] : '';

        const postRes = await axios.post('https://ssstik.io/abc?url=dl', qs.stringify({
            id: tiktokUrl,
            locale: 'en',
            tt: tt
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'HX-Request': 'true',
                'Referer': 'https://ssstik.io/en',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': cookies ? cookies.join('; ') : ''
            },
            timeout: 15000
        });

        const $ = cheerio.load(postRes.data);
        const title = $('p.maintext').text().trim() || "TikTok Video";
        const hdLink = $('a.without_watermark_hd').attr('href') || null;
        let noWmLink = $('a.without_watermark').attr('href') || null;
        const musicLink = $('a.music').attr('href') || null;

        if (noWmLink && noWmLink.startsWith('//')) noWmLink = 'https:' + noWmLink;

        if (noWmLink || musicLink) {
            return {
                title,
                author: { nickname: "TikTok Creator" },
                play: noWmLink,
                hdplay: hdLink || noWmLink,
                music: musicLink,
                source: "SSSTik Engine"
            };
        }
    } catch (e) {
        console.log("[TIKTOK ENGINE 1 SSSTIK FAIL]:", e.message);
    }
    return null;
}

/**
 * ENGINE 2: TikWM POST Endpoint
 */
async function scrapeTikWMPost(tiktokUrl) {
    try {
        const params = new URLSearchParams({
            url: tiktokUrl,
            count: 12,
            cursor: 0,
            web: 1,
            hd: 1
        });

        const res = await axios.post('https://www.tikwm.com/api/', params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Referer': 'https://www.tikwm.com/',
                'Origin': 'https://www.tikwm.com',
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            },
            timeout: 12000
        });

        if (res.data && res.data.code === 0 && res.data.data) {
            return res.data.data;
        }
    } catch (e) {
        console.log("[TIKTOK ENGINE 2 TIKWM POST FAIL]:", e.message);
    }
    return null;
}

/**
 * ENGINE 3: TikWM Direct GET Endpoint
 */
async function scrapeTikWMGet(tiktokUrl) {
    try {
        const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}&hd=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.tikwm.com/'
            },
            timeout: 12000
        });

        if (res.data && res.data.code === 0 && res.data.data) {
            return res.data.data;
        }
    } catch (e) {
        console.log("[TIKTOK ENGINE 3 TIKWM GET FAIL]:", e.message);
    }
    return null;
}

/**
 * Master Resolver: Runs multi-engine cascade
 */
async function fetchTikTokData(rawUrl) {
    const cleanUrl = extractTikTokUrl(rawUrl) || rawUrl.trim();

    // 1. Try SSSTik first (Most resilient on Koyeb/Cloud IPs)
    const data1 = await scrapeSSSTik(cleanUrl);
    if (data1 && (data1.play || data1.hdplay || data1.music)) return data1;

    // 2. Try TikWM POST
    const data2 = await scrapeTikWMPost(cleanUrl);
    if (data2 && (data2.play || data2.hdplay || data2.music)) return data2;

    // 3. Try TikWM GET
    const data3 = await scrapeTikWMGet(cleanUrl);
    if (data3 && (data3.play || data3.hdplay || data3.music)) return data3;

    return null;
}

/**
 * Deliver Chosen Format to User
 */
async function sendChosenFormat(conn, from, mek, session, formatType) {
    try {
        const { data, title, author } = session;
        const cleanTitle = (title || "TikTok Video").replace(/[^\w\s\u0D80-\u0DFF-]/g, '').trim() || "TikTok Video";
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
        const videoUrl = isHD ? (data.hdplay || data.play) : (data.play || data.wmplay);

        if (!videoUrl) {
            return conn.sendMessage(from, { text: "❌ *Video stream එක ලබා ගැනීමට නොහැකි විය.*" }, { quoted: mek });
        }

        const formatLabel = isHD ? "HD Original (No Watermark)" : "No Watermark MP4";
        await conn.sendMessage(from, { text: `⏳ *${formatLabel} Download වෙමින් පවතී...*` }, { quoted: mek });

        await conn.sendMessage(from, {
            video: { url: videoUrl },
            caption: `👑 *${cleanTitle}* 👑\n\n` +
                     `✨ *Format:* ${formatLabel}\n` +
                     `👤 *Author:* @${authorName}\n\n` +
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

        let rawInput = (q || "").trim();
        if (!rawInput) {
            const quoted = mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                rawInput = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
            }
        }

        const validUrl = extractTikTokUrl(rawInput);
        if (!validUrl) {
            return reply("⚠️ *කරුණාකර TikTok වීඩියෝ ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*.tiktok https://vt.tiktok.com/...*");
        }

        await reply("⏳ *TikTok තොරතුරු ලබාගනිමින් පවතී...*");

        const data = await fetchTikTokData(validUrl);
        if (!data || (!data.play && !data.hdplay && !data.music)) {
            return reply("❌ *TikTok වීඩියෝව සොයාගත නොහැකි විය. කරුණාකර ලින්ක් එක පරීක්ෂා කරන්න.*");
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
        const pollOptions = [
            "HD Original (No Watermark)",
            "No Watermark MP4",
            "MP3 Audio"
        ];

        // Send Native WhatsApp Poll
        try {
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

        // Send Fallback Numbered Menu
        const menuText = `👑 *ＤＭＣ™ TIKTOK DOWNLOADER* 👑\n\n` +
                         `📌 *Title:* ${cleanTitle}\n` +
                         `👤 *Author:* @${data.author?.nickname || "User"}\n\n` +
                         `කරුණාකර ඉහත Poll එකෙන් තෝරන්න, නැතහොත් අදාළ *අංකය (1, 2, හෝ 3)* Reply කරන්න:\n\n` +
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

        // A. Handle user selection (1, 2, or 3) for pending TikTok download
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

        // B. Passive TikTok Link Detection (Supports multi-line, dirty strings, and preview text)
        const validUrl = extractTikTokUrl(trimmed);
        if (!validUrl) return;

        // Skip if it was already an explicit command
        if (trimmed.startsWith('.') || trimmed.startsWith('!') || trimmed.startsWith('/')) return;

        await reply("⏳ *TikTok ලින්ක් එක හඳුනාගන්නා ලදී. විස්තර ලබාගනිමින් පවතී...*");

        const data = await fetchTikTokData(validUrl);
        if (!data || (!data.play && !data.hdplay && !data.music)) {
            return reply("❌ *TikTok වීඩියෝව සොයාගත නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදි දැයි බලන්න.*");
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
        const pollOptions = [
            "HD Original (No Watermark)",
            "No Watermark MP4",
            "MP3 Audio"
        ];

        // Send Native WhatsApp Poll
        try {
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

        // Send Fallback Numbered Menu
        const menuText = `👑 *ＤＭＣ™ TIKTOK DOWNLOADER* 👑\n\n` +
                         `📌 *Title:* ${cleanTitle}\n` +
                         `👤 *Author:* @${data.author?.nickname || "User"}\n\n` +
                         `කරුණාකර ඉහත Poll එකෙන් තෝරන්න, නැතහොත් අදාළ *අංකය (1, 2, හෝ 3)* Reply කරන්න:\n\n` +
                         `  [1] 🌟 *HD Original (No Watermark)*\n` +
                         `  [2] 🎬 *No Watermark MP4*\n` +
                         `  [3] 🎵 *MP3 Audio*\n\n` +
                         `_DMC Modern Automation Core_`;

        await conn.sendMessage(from, { text: menuText }, { quoted: mek });

    } catch (err) {
        console.error("[TIKTOK AUTO DETECT ERROR]:", err.message);
    }
});
