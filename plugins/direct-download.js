/**
 * 👑 DMC DIRECT WEB VIDEO DOWNLOADER (CRASH GUARD & SMART SIZE) 👑
 * LOGIC: High-speed direct MP4/Web video download with HTTP pre-check,
 *        Smart Size routing (Inline Video vs Document), and Strict Timeout Guard.
 */

const { cmd } = require('../command');
const axios = require('axios');

// Supported direct video extensions
const VIDEO_EXT_REGEX = /\.(mp4|mov|webm|mkv|avi|m4v)(\?.*)?$/i;

// Reusable download and stream handler
async function handleDirectDownload(conn, mek, from, rawUrl, reply) {
    let targetUrl = rawUrl.trim();

    // 1. Resolve videy.co page links to direct CDN stream
    if (targetUrl.includes('videy.co/v?id=')) {
        const idMatch = targetUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch) {
            targetUrl = 'https://cdn2.videy.co/' + idMatch[1] + '.mp4';
        }
    }

    let sourceDomain = 'Web';
    try {
        sourceDomain = new URL(targetUrl).hostname;
    } catch (e) { }

    await reply("⏳ *Direct Video Link හඳුනාගන්නා ලදී. Crash Guard පරීක්ෂාව සිදු වෙමින් පවතී...*");

    // 2. HTTP Pre-check (HEAD verification with GET Range fallback)
    let contentType = 'video/mp4';
    let fileSizeMB = 0;

    try {
        const headRes = await axios.head(targetUrl, {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            validateStatus: (s) => s >= 200 && s < 400
        });
        contentType = headRes.headers['content-type'] || 'video/mp4';
        const contentLength = parseInt(headRes.headers['content-length'] || '0', 10);
        fileSizeMB = contentLength / (1024 * 1024);
    } catch (headErr) {
        // Fallback to GET with range 0-1024
        try {
            const rangeRes = await axios.get(targetUrl, {
                timeout: 7000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Range': 'bytes=0-1024'
                },
                validateStatus: (s) => s >= 200 && s < 400
            });
            contentType = rangeRes.headers['content-type'] || 'video/mp4';
            const contentLength = parseInt(rangeRes.headers['content-length'] || '0', 10);
            fileSizeMB = contentLength / (1024 * 1024);
        } catch (fallbackErr) {
            console.error("Precheck Error:", fallbackErr.message);
            return reply("❌ *ලින්ක් එක පරීක්ෂා කිරීම අසාර්ථක විය. ලින්ක් එක නිවැරදිද සහ සක්‍රියදැයි බලන්න.*");
        }
    }

    // 3. Validate content type
    const isVideo = contentType.startsWith('video/') ||
                    contentType.includes('octet-stream') ||
                    VIDEO_EXT_REGEX.test(targetUrl) ||
                    targetUrl.includes('videy.co');

    if (!isVideo) {
        return reply("❌ *මෙම ලින්ක් එක වීඩියෝවක් නොවේ (Type: " + contentType + ")*");
    }

    // 4. Smart Size Guard
    const MAX_TOTAL_SIZE_MB = 300;
    const MAX_VIDEO_INLINE_MB = 100;

    if (fileSizeMB > MAX_TOTAL_SIZE_MB) {
        return reply("⚠️ *File එක විශාල වැඩියි (" + fileSizeMB.toFixed(2) + " MB). උපරිම ආරක්ෂිත සීමාව: 300 MB වේ.*");
    }

    const sizeText = fileSizeMB > 0 ? fileSizeMB.toFixed(2) + " MB" : "Direct Stream";
    await reply("🚀 *බාගත වෙමින් පවතී (" + sizeText + ")... කරුණාකර රැඳී සිටින්න.*");

    // 5. Send Media (Direct streaming via Baileys)
    try {
        if (fileSizeMB > MAX_VIDEO_INLINE_MB) {
            // Send as WhatsApp Document (100MB - 300MB)
            const ext = (contentType && contentType.includes('/')) ? contentType.split('/')[1] : 'mp4';
            await conn.sendMessage(from, {
                document: { url: targetUrl },
                mimetype: contentType || 'video/mp4',
                fileName: `video-${Date.now()}.${ext}`,
                caption: "👑 *Direct Web Video (Document)* 👑\n\n📦 *Size:* " + fileSizeMB.toFixed(2) + " MB\n🌐 *Source:* " + sourceDomain + "\n\n_Downloaded via ＤＭＣ™ Crash Guard Engine_"
            }, { quoted: mek });
        } else {
            // Send as Inline Video (<= 100MB)
            await conn.sendMessage(from, {
                video: { url: targetUrl },
                mimetype: contentType || 'video/mp4',
                caption: "👑 *Direct Web Video* 👑\n\n📦 *Size:* " + sizeText + "\n🌐 *Source:* " + sourceDomain + "\n\n_Downloaded via ＤＭＣ™ Crash Guard Engine_"
            }, { quoted: mek });
        }
    } catch (sendErr) {
        console.error("Direct Video Send Error:", sendErr.message);
        reply("❌ *වීඩියෝව එවීමේදී දෝෂයක් සිදු විය. ලින්ක් එකේ අවසර (Permissions) පරීක්ෂා කරන්න.*");
    }
}

// 1. COMMAND HANDLER: .direct, .dl, .url, .videourl
cmd({
    pattern: "direct",
    alias: ["dl", "url", "directdl", "videourl", "webdl"],
    react: "🎬",
    desc: "Download direct web video (.mp4 / web video link)",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (mek.key.fromMe) return;

        let query = q ? q.trim() : "";
        if (!query) {
            return reply("⚠️ *කරුණාකර සෘජු වීඩියෝ ලින්ක් එකක් (Direct .mp4 Link) ලබා දෙන්න!*\n\nඋදාහරණ:\n*.dl https://cdn2.videy.co/...mp4*\n*.dl https://videy.co/v?id=...*");
        }

        // Ignore YouTube links here (handled by YouTube downloader)
        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            return reply("ℹ️ *YouTube වීඩියෝ සඳහා කරුණාකර .video හෝ .song භාවිතා කරන්න.*");
        }

        await handleDirectDownload(conn, mek, from, query, reply);
    } catch (err) {
        console.error("Direct Command Error:", err.message);
        reply("❌ *බාගත කිරීම අසාර්ථක විය.*");
    }
});

// 2. PASSIVE LISTENER: Direct link paste without command
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, reply }) => {
    try {
        if (mek.key.fromMe) return;
        if (!body) return;

        const trimmed = body.trim();

        // Ignore commands
        if (trimmed.startsWith('.') || trimmed.startsWith('!') || trimmed.startsWith('/')) return;

        // Ignore YouTube links (handled by downloader.js)
        if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) return;

        // Check if message is a direct video link
        const isHttpUrl = /^https?:\/\/\S+$/i.test(trimmed);
        if (!isHttpUrl) return;

        const isVidey = trimmed.includes('videy.co');
        const isDirectVideo = VIDEO_EXT_REGEX.test(trimmed);

        if (isVidey || isDirectVideo) {
            await handleDirectDownload(conn, mek, from, trimmed, reply);
        }
    } catch (err) {
        console.error("Direct Link Auto Listener Error:", err.message);
    }
});
