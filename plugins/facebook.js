/**
 * 👑 DMC FACEBOOK (VIDEOS, REELS & PHOTOS) DOWNLOADER V1 👑
 * LOGIC: Ultra-resilient multi-engine scraper for Facebook Public Videos, Reels & Photos.
 *        - Engine 1: SnapSave Decryptor (HD 1080p/720p, SD 360p, Photos)
 *        - Engine 2: Siputzx Facebook API (HD/SD fallback)
 *        - Engine 3: Renpwn Native Embedded JSON Scraper
 *        - Engine 4: OpenGraph Meta Extractor for Public Photos
 * 
 * 100% Isolated Plugin - Preserves existing YouTube & TikTok hardcode logic.
 */

const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');
const getFBInfo = require('@renpwn/fb-downloader');

/**
 * Intelligent Facebook URL Extractor:
 * Extracts clean Facebook URL from any dirty text, multi-line string, or link preview.
 */
function isPlayableVideo(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    if (lower.includes('.mpd') || lower.includes('/dash/') || lower.includes('manifest.mpd') || lower.includes('format=mpd') || lower.includes('mime=application%2fdash%2bxml')) {
        return false;
    }
    return true;
}

function extractFacebookUrl(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/https?:\/\/(?:www\.|m\.|web\.|fb\.)?(?:facebook\.com|fb\.watch|fb\.com)\/[^\s<>"')]+/i);
    if (!match) return null;
    return match[0].trim();
}

/**
 * SNAPSAVE DECODER HELPERS
 */
function decodeSnapApp(args) {
    let [h, u, n, t, e, r] = args;
    const tNum = Number(t);
    const eNum = Number(e);
    function decode(d, e, f) {
        const g = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/".split("");
        const hArr = g.slice(0, e);
        const iArr = g.slice(0, f);
        let j = d.split("").reverse().reduce((a, b, c) => {
            const idx = hArr.indexOf(b);
            if (idx !== -1) return a + idx * Math.pow(e, c);
            return a;
        }, 0);
        let k = "";
        while (j > 0) {
            k = iArr[j % f] + k;
            j = Math.floor(j / f);
        }
        return k || "0";
    }
    let result = "";
    for (let i = 0, len = h.length; i < len;) {
        let s = "";
        while (i < len && h[i] !== n[eNum]) {
            s += h[i];
            i++;
        }
        i++;
        for (let j = 0; j < n.length; j++) s = s.replace(new RegExp(n[j], "g"), j.toString());
        result += String.fromCharCode(Number(decode(s, eNum, 10)) - tNum);
    }
    try {
        const bytes = new Uint8Array(result.split("").map((char) => char.charCodeAt(0)));
        return new TextDecoder("utf-8").decode(bytes);
    } catch (e) {
        return result;
    }
}

function getEncodedSnapApp(data) {
    const part1 = data.split("decodeURIComponent(escape(r))}(")[1];
    if (!part1) throw new Error("Could not find SnapApp payload");
    const part2 = part1.split("))")[0];
    return part2.split(",").map((v) => v.replace(/"/g, "").trim());
}

function getDecodedSnapSave(data) {
    const alertMatch = data.match(/document\.querySelector\(["']#alert["']\)\.innerHTML\s*=\s*["']([^"']+)["']/);
    if (alertMatch && alertMatch[1]) throw new Error(alertMatch[1]);
    const sectionMatch = data.match(/getElementById\(["']download-section["']\)\.innerHTML\s*=\s*["']([\s\S]*?)["'];\s*document\.getElementById/);
    if (sectionMatch && sectionMatch[1]) {
        return sectionMatch[1].replace(/\\(\\)?/g, "");
    }
    return data;
}

function decryptSnapSave(data) {
    return getDecodedSnapSave(decodeSnapApp(getEncodedSnapApp(data)));
}

/**
 * ENGINE 1: SnapSave Scraper (Videos, Reels & Photos)
 */
async function scrapeSnapSave(fbUrl) {
    try {
        const res = await axios.post('https://snapsave.app/action.php?lang=en', qs.stringify({
            url: fbUrl
        }), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://snapsave.app/',
                'Origin': 'https://snapsave.app',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000
        });

        const decryptedHtml = decryptSnapSave(res.data);
        const $ = cheerio.load(decryptedHtml);

        const description = $("span.video-des").text().trim() || $("h3.title").text().trim() || "";
        const preview = $("article.media > figure").find("img").attr("src") || $("div.download-items__thumb > img").attr("src") || "";

        let hdUrl = null;
        let sdUrl = null;
        const photos = [];

        // Parse Table for Videos (Filtered against .mpd DASH manifests)
        $("tbody > tr").each((_, el) => {
            const $td = $(el).find("td");
            const resolution = $td.eq(0).text().trim().toLowerCase();
            let url = $td.eq(2).find("a").attr("href") || $td.eq(2).find("button").attr("onclick");
            if (url && typeof url === 'string') {
                const matchUrl = url.match(/https?:\/\/[^\s"']+/);
                if (matchUrl) url = matchUrl[0];
            }
            if (url && url.startsWith('http') && isPlayableVideo(url)) {
                if (resolution.includes('hd') || resolution.includes('1080') || resolution.includes('720')) {
                    if (!hdUrl) hdUrl = url;
                } else {
                    if (!sdUrl) sdUrl = url;
                }
            }
        });

        // Ensure selected URLs are valid playable video
        if (hdUrl && !isPlayableVideo(hdUrl)) hdUrl = null;
        if (sdUrl && !isPlayableVideo(sdUrl)) sdUrl = null;

        // Parse Photos / Images
        $("div.download-items, div.card").each((_, el) => {
            const img = $(el).find("img").attr("src");
            const aHref = $(el).find("a").attr("href");
            const aText = $(el).find("a").text().trim();
            if (aText.includes("Photo") || aHref?.includes("image") || img) {
                const photoUrl = aHref && aHref.startsWith('http') ? aHref : img;
                if (photoUrl && photoUrl.startsWith('http') && !photos.includes(photoUrl)) {
                    photos.push(photoUrl);
                }
            }
        });

        if (hdUrl || sdUrl || photos.length > 0) {
            return {
                title: description || "Facebook Media",
                hd: hdUrl || sdUrl,
                sd: sdUrl || hdUrl,
                photos,
                source: "SnapSave Engine"
            };
        }
    } catch (e) {
        console.log("[FB ENGINE 1 SNAPSAVE FAIL]:", e.message);
    }
    return null;
}

/**
 * ENGINE 2: Siputzx Facebook API (Cloud-Resilient Fallback)
 */
async function scrapeSiputzx(fbUrl) {
    try {
        const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(fbUrl)}`, {
            timeout: 12000
        });

        if (res.data && res.data.status && res.data.data) {
            const data = res.data.data;
            const title = data.title || "Facebook Video";
            let hdUrl = null;
            let sdUrl = null;

            if (Array.isArray(data.downloads)) {
                for (const item of data.downloads) {
                    if (!item.url || !isPlayableVideo(item.url)) continue;
                    const q = (item.quality || '').toLowerCase();
                    if (q.includes('hd') || q.includes('720') || q.includes('1080')) {
                        if (!hdUrl) hdUrl = item.url;
                    } else if (q.includes('sd') || q.includes('360')) {
                        if (!sdUrl) sdUrl = item.url;
                    }
                }
            }

            if (hdUrl || sdUrl) {
                return {
                    title,
                    hd: hdUrl || sdUrl,
                    sd: sdUrl || hdUrl,
                    photos: [],
                    source: "Siputzx API"
                };
            }
        }
    } catch (e) {
        console.log("[FB ENGINE 2 SIPUTZX FAIL]:", e.message);
    }
    return null;
}

/**
 * ENGINE 3: Renpwn Native Embedded JSON Scraper
 */
async function scrapeRenpwn(fbUrl) {
    try {
        const data = await getFBInfo(fbUrl);
        if (data && (data.hd || data.sd)) {
            return {
                title: data.title || "Facebook Video",
                hd: data.hd || data.sd,
                sd: data.sd || data.hd,
                photos: [],
                source: "Renpwn Engine"
            };
        }
    } catch (e) {
        console.log("[FB ENGINE 3 RENPWN FAIL]:", e.message);
    }
    return null;
}

/**
 * ENGINE 4: OpenGraph Fallback (For Photo Posts)
 */
async function scrapeFacebookOG(fbUrl) {
    try {
        const res = await axios.get(fbUrl, {
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 10000
        });

        const $ = cheerio.load(res.data);
        const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
        const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:url"]').attr('content');
        const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text().trim();

        if (ogImage || ogVideo) {
            return {
                title: ogTitle || "Facebook Media",
                hd: ogVideo || null,
                sd: ogVideo || null,
                photos: ogImage ? [ogImage] : [],
                source: "Facebook OpenGraph"
            };
        }
    } catch (e) {
        console.log("[FB ENGINE 4 OG FAIL]:", e.message);
    }
    return null;
}

/**
 * Master Facebook Media Resolver: Runs multi-engine cascade
 */
async function fetchFacebookData(rawUrl) {
    const cleanUrl = extractFacebookUrl(rawUrl) || rawUrl.trim();

    // 1. Try SnapSave (Best for all Video qualities and Photos)
    const data1 = await scrapeSnapSave(cleanUrl);
    if (data1 && (data1.hd || data1.sd || (data1.photos && data1.photos.length > 0))) return data1;

    // 2. Try Siputzx API (Fast cloud stream provider)
    const data2 = await scrapeSiputzx(cleanUrl);
    if (data2 && (data2.hd || data2.sd)) return data2;

    // 3. Try Renpwn Native Scraper
    const data3 = await scrapeRenpwn(cleanUrl);
    if (data3 && (data3.hd || data3.sd)) return data3;

    // 4. Try OpenGraph for Photos/Basic Video
    const data4 = await scrapeFacebookOG(cleanUrl);
    if (data4 && (data4.hd || data4.sd || (data4.photos && data4.photos.length > 0))) return data4;

    return null;
}

/**
 * Core Facebook Media Dispatcher: Sends Video, Audio, or Photo to user
 */
async function processFacebookDownload(conn, mek, from, validUrl, forceFormat = 'auto') {
    try {
        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';
        const data = await fetchFacebookData(validUrl);

        if (!data || (!data.hd && !data.sd && (!data.photos || data.photos.length === 0))) {
            return conn.sendMessage(from, { text: "❌ *Facebook මාධ්‍යය සොයාගත නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදි දැයි සහ එය Public දැයි පරීක්ෂා කරන්න.*" }, { quoted: mek });
        }

        const cleanTitle = (data.title || "Facebook Media").replace(/[^\w\s\u0D80-\u0DFF-]/g, '').trim() || "Facebook Media";

        // A. PHOTO DOWNLOAD
        if (data.photos && data.photos.length > 0 && forceFormat !== 'video' && forceFormat !== 'hd' && forceFormat !== 'sd' && forceFormat !== 'mp3') {
            for (let i = 0; i < Math.min(data.photos.length, 5); i++) {
                const photoUrl = data.photos[i];
                await conn.sendMessage(from, {
                    image: { url: photoUrl },
                    caption: `👑 *${cleanTitle}* 👑\n\n📸 *Facebook Photo*\n\n_Downloaded via ＤＭＣ™ Core Engine_`
                }, { quoted: mek });
            }
            return;
        }

        // B. MP3 AUDIO DOWNLOAD
        if (forceFormat === 'mp3') {
            const streamUrl = data.hd || data.sd;
            if (!streamUrl) {
                return conn.sendMessage(from, { text: "❌ *Audio Stream එක ලබා ගැනීමට නොහැකි විය.*" }, { quoted: mek });
            }

            await conn.sendMessage(from, { text: "⏳ *Facebook Audio (MP3) සකසමින් පවතී... කරුණාකර රැඳී සිටින්න.*" }, { quoted: mek });

            await conn.sendMessage(from, {
                audio: { url: streamUrl },
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle.slice(0, 40)}.mp3`,
                ptt: false
            }, { quoted: mek });
            return;
        }

        // C. VIDEO / REEL DOWNLOAD
        let videoUrl = (forceFormat === 'sd') ? (data.sd || data.hd) : (data.hd || data.sd);
        if (videoUrl && !isPlayableVideo(videoUrl)) {
            videoUrl = isPlayableVideo(data.sd) ? data.sd : (isPlayableVideo(data.hd) ? data.hd : null);
        }
        if (!videoUrl) {
            // If no video URL but has photo, fallback to photo
            if (data.photos && data.photos.length > 0) {
                return await conn.sendMessage(from, {
                    image: { url: data.photos[0] },
                    caption: `👑 *${cleanTitle}* 👑\n\n📸 *Facebook Photo*\n\n_Downloaded via ＤＭＣ™ Core Engine_`
                }, { quoted: mek });
            }
            return conn.sendMessage(from, { text: "❌ *Video Stream එක ලබා ගැනීමට නොහැකි විය.*" }, { quoted: mek });
        }

        const isHD = (videoUrl === data.hd && data.hd !== data.sd);
        const formatLabel = isHD ? "HD Quality" : "SD Quality";

        await conn.sendMessage(from, { text: `⏳ *Facebook වීඩියෝව (${formatLabel}) Download වෙමින් පවතී...*` }, { quoted: mek });

        const tapMp3Prompt = botNum 
            ? `\n\n👉 🎵 *Tap MP3 Link:*\nhttps://wa.me/${botNum}?text=.fbmp3%20${encodeURIComponent(validUrl)}` 
            : '';

        await conn.sendMessage(from, {
            video: { url: videoUrl },
            caption: `👑 *${cleanTitle}* 👑\n\n` +
                     `🎬 *Quality:* ${formatLabel}\n\n` +
                     `_Downloaded via ＤＭＣ™ Core Engine_` + tapMp3Prompt
        }, { quoted: mek });

    } catch (err) {
        console.error("[FB DOWNLOAD DISPATCH ERROR]:", err.message);
        await conn.sendMessage(from, { text: "❌ *Facebook වෙතින් Download කිරීමේදී දෝෂයක් ඇති විය.*" }, { quoted: mek });
    }
}

// --------------------------------------------------------------------------
// 1. DEDICATED COMMANDS: .fb, .facebook, .fbdl, .fbhd, .fbsd, .fbmp3
// --------------------------------------------------------------------------
cmd({
    pattern: "fb",
    alias: ["facebook", "fbdl", "fbvideo", "fbmp4"],
    react: "📘",
    desc: "Download Facebook Public Videos, Reels & Photos",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (mek.key.fromMe) return;

        let rawInput = (q || "").trim();
        if (!rawInput) {
            const quoted = mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                rawInput = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
            }
        }

        const validUrl = extractFacebookUrl(rawInput);
        if (!validUrl) {
            return reply("⚠️ *කරුණාකර Facebook Video, Reel හෝ Photo ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*.fb https://www.facebook.com/...*");
        }

        await reply("⏳ *Facebook තොරතුරු ලබාගනිමින් පවතී...*");
        await processFacebookDownload(conn, mek, from, validUrl, 'auto');

    } catch (err) {
        console.error("[FB CMD ERROR]:", err.message);
        reply("❌ *Facebook බාගත කිරීමේදී දෝෂයක් ඇති විය.*");
    }
});

cmd({
    pattern: "fbhd",
    alias: ["facebookhd"],
    react: "🌟",
    desc: "Download Facebook HD Video",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    if (mek.key.fromMe) return;
    const validUrl = extractFacebookUrl(q);
    if (!validUrl) return reply("⚠️ *කරුණාකර Facebook ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*.fbhd https://www.facebook.com/...*");
    await reply("⏳ *Facebook HD වීඩියෝව ලබාගනිමින් පවතී...*");
    await processFacebookDownload(conn, mek, from, validUrl, 'hd');
});

cmd({
    pattern: "fbsd",
    alias: ["facebooksd"],
    react: "🎬",
    desc: "Download Facebook SD Video",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    if (mek.key.fromMe) return;
    const validUrl = extractFacebookUrl(q);
    if (!validUrl) return reply("⚠️ *කරුණාකර Facebook ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*.fbsd https://www.facebook.com/...*");
    await reply("⏳ *Facebook SD වීඩියෝව ලබාගනිමින් පවතී...*");
    await processFacebookDownload(conn, mek, from, validUrl, 'sd');
});

cmd({
    pattern: "fbmp3",
    alias: ["fbaudio", "facebookmp3"],
    react: "🎵",
    desc: "Download Facebook Audio as MP3",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    if (mek.key.fromMe) return;
    const validUrl = extractFacebookUrl(q);
    if (!validUrl) return reply("⚠️ *කරුණාකර Facebook ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*.fbmp3 https://www.facebook.com/...*");
    await reply("⏳ *Facebook Audio එක ලබාගනිමින් පවතී...*");
    await processFacebookDownload(conn, mek, from, validUrl, 'mp3');
});

// --------------------------------------------------------------------------
// 2. PASSIVE LISTENER: Direct Facebook Link Auto-Detector
// --------------------------------------------------------------------------
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, reply }) => {
    try {
        if (!body || mek.key.fromMe) return;

        const trimmed = body.trim();

        // Ignore commands
        if (trimmed.startsWith('.') || trimmed.startsWith('!') || trimmed.startsWith('/')) return;

        // Extract genuine Facebook URL
        const validUrl = extractFacebookUrl(trimmed);
        if (!validUrl) return;

        const isPhotoUrl = validUrl.includes('/photo') || validUrl.includes('photo.php') || validUrl.includes('/photos/');
        const statusMsg = isPhotoUrl 
            ? "⏳ *Facebook Photo එක හඳුනාගන්නා ලදී. Download වෙමින් පවතී...*" 
            : "⏳ *Facebook ලින්ක් එක හඳුනාගන්නා ලදී. Download වෙමින් පවතී...*";

        await reply(statusMsg);
        await processFacebookDownload(conn, mek, from, validUrl, 'auto');

    } catch (err) {
        console.error("[FB AUTO DETECT ERROR]:", err.message);
    }
});
