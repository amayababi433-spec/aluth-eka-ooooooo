/**
 * 👑 DMC DIRECT WEB VIDEO DOWNLOADER (CRASH GUARD & SMART GATEWAY EXTRACTOR) 👑
 * LOGIC: Multi-layered verification for Direct Internet Video Links:
 *        1. Intelligent HTML Gate / Redirect Page extraction (Extracts hidden real video links)
 *        2. HTTP HEAD verification (MIME types, redirects, size guard)
 *        3. Magic Bytes Sniffing (Initial bytes inspection to verify genuine video signatures)
 *        4. Smart Size Guard (Inline Video vs Document, max 300MB)
 *        5. 100% Isolated from YouTube Downloader Core Logic
 */

const { cmd } = require('../command');
const axios = require('axios');

// Supported direct video extensions in URL
const VIDEO_EXT_REGEX = /\.(mp4|mov|webm|mkv|avi|m4v)(\?.*)?$/i;

// Valid video MIME types
const VALID_VIDEO_MIME_TYPES = [
    'video/mp4', 'video/webm', 'video/x-flv', 'video/quicktime',
    'video/mpeg', 'video/3gpp', 'video/x-matroska', 'video/avi',
    'video/msvideo', 'application/x-mpegurl', 'application/vnd.apple.mpegurl'
];

/**
 * Inspect magic bytes of the first 1KB of the file to verify genuine video binary signature.
 */
function inspectMagicBytes(buffer) {
    if (!buffer || buffer.length < 12) {
        return { isVideo: false, reason: 'Empty or invalid file stream' };
    }

    const sample = buffer.slice(0, 200).toString('utf8').trim().toLowerCase();
    if (sample.startsWith('<!doctype') || sample.startsWith('<html') ||
        sample.includes('<head') || sample.includes('<script') ||
        sample.includes('window.location') || sample.includes('<?php')) {
        return { isVideo: false, reason: 'HTML Web Page' };
    }

    // MP4 / MOV / 3GP (usually has 'ftyp' at bytes 4-8)
    const ftyp = buffer.slice(4, 8).toString('utf8');
    if (ftyp === 'ftyp' || ftyp === 'moov' || ftyp === 'mdat') {
        return { isVideo: true, format: 'MP4' };
    }

    // Some MP4 files have ftyp within the first 32 bytes
    if (buffer.indexOf(Buffer.from('ftyp')) !== -1 && buffer.indexOf(Buffer.from('ftyp')) < 32) {
        return { isVideo: true, format: 'MP4' };
    }

    // MKV / WebM: EBML header (0x1A 0x45 0xDF 0xA3)
    if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
        return { isVideo: true, format: 'MKV/WebM' };
    }

    // AVI: 'RIFF' .... 'AVI '
    if (buffer.slice(0, 4).toString('utf8') === 'RIFF' && buffer.slice(8, 12).toString('utf8') === 'AVI ') {
        return { isVideo: true, format: 'AVI' };
    }

    // FLV: 0x46 0x4C 0x56
    if (buffer[0] === 0x46 && buffer[1] === 0x4C && buffer[2] === 0x56) {
        return { isVideo: true, format: 'FLV' };
    }

    // MPEG-TS sync byte (0x47)
    if (buffer[0] === 0x47) {
        return { isVideo: true, format: 'MPEG-TS' };
    }

    return { isVideo: false, reason: 'Unrecognized video file signature' };
}

/**
 * Intelligent HTML Video Link Extractor:
 * Extracts hidden video links embedded in intermediate gate pages or player pages.
 */
function extractVideoFromHtml(html) {
    if (!html || typeof html !== 'string') return null;

    // 1. JavaScript variable: targetUrl = "..." or videoUrl = "..."
    const targetMatch = html.match(/(?:targetUrl|target_url|videoUrl|video_url|videoSrc|fileUrl)\s*[:=]\s*["']([^"']+)["']/i);
    if (targetMatch) {
        return targetMatch[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    }

    // 2. HTML5 <video> or <source> tags
    const tagMatch = html.match(/<(?:video|source)[^>]+src=["']([^"']+)["']/i);
    if (tagMatch) {
        return tagMatch[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    }

    // 3. window.location or location.href redirects
    const locMatch = html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
    if (locMatch && !locMatch[1].includes('window.location')) {
        return locMatch[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    }

    // 4. Any direct mp4, webm, mov, mkv url in the HTML
    const generalMatch = html.match(/https?:\/\/[^"'<>\s]+\.(mp4|webm|mov|mkv)(\?[^"'<>\s]*)?/i);
    if (generalMatch) {
        return generalMatch[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    }

    return null;
}

// ✅ Dual-Engine Priority: Azure Primary ──► Auto GitHub Actions Cloud Backup
const TERABOX_AZURE_ENDPOINT = 'https://copyright-handled-todd-latter.trycloudflare.com/api/terabox';
const DISKWALA_AZURE_ENDPOINT = 'https://copyright-handled-todd-latter.trycloudflare.com/api/diskwala';

let cachedBackupBase = 'https://roland-certificates-component-weed.trycloudflare.com';
let lastUrlFetchTime = 0;

async function getBackupBaseUrl() {
    if (Date.now() - lastUrlFetchTime < 30000 && cachedBackupBase) {
        return cachedBackupBase;
    }
    try {
        const res = await axios.get('https://raw.githubusercontent.com/dimdtu0-cell/dmc-backup-api/main/api_url.txt?t=' + Date.now(), { timeout: 5000 });
        if (res.data && res.data.trim().startsWith('https://')) {
            cachedBackupBase = res.data.trim().replace(/\/$/, '');
            lastUrlFetchTime = Date.now();
        }
    } catch (e) {
        lastUrlFetchTime = 0; // invalidate on error so next call retries fresh
    }
    return cachedBackupBase;
}

// Dedicated TeraBox download handler with Smart Dual-Engine Failover
async function handleTeraBoxDownload(conn, mek, from, targetUrl, reply) {
    try {
        await reply("⏳ *TeraBox ලින්ක් එක හඳුනාගන්නා ලදී. Playwright Cloud Engine මඟින් වීඩියෝව සකසමින් පවතී (තත්පර 15-20 ක් ගත විය හැක)...*");

        let res;
        let engineUsed = "Azure Core Engine";

        const routing = global.DOWNLOAD_ROUTING || { terabox: 'auto', all: 'auto' };
        const mode = (routing.all && routing.all !== 'auto') ? routing.all : (routing.terabox || 'auto');
        console.log(`🎯 [TeraBox Engine Routing] Mode: ${mode.toUpperCase()} (Full Routing: ${JSON.stringify(routing)})`);

        if (mode === 'azure') {
            engineUsed = "Azure Core (Manual Mode)";
            res = await axios.get(TERABOX_AZURE_ENDPOINT + '?url=' + encodeURIComponent(targetUrl), { timeout: 35000 });
        } else if (mode === 'github') {
            engineUsed = "GitHub Actions (Manual Mode)";
            const backupBase = await getBackupBaseUrl();
            res = await axios.get(backupBase + '/api/terabox?url=' + encodeURIComponent(targetUrl), { timeout: 45000 });
        } else {
            // 1️⃣ Attempt Primary Azure Cloud Server (25s) with failover to GitHub Actions
            try {
                res = await axios.get(TERABOX_AZURE_ENDPOINT + '?url=' + encodeURIComponent(targetUrl), {
                    timeout: 25000
                });
                if (!res.data || !res.data.download_url) throw new Error("No download_url from Azure");
            } catch (azureErr) {
                console.warn("⚠️ Azure TeraBox busy/slow, switching to GitHub Actions Cloud Backup...", azureErr.message);
                engineUsed = "GitHub Actions Backup";
                const backupBase = await getBackupBaseUrl();
                res = await axios.get(backupBase + '/api/terabox?url=' + encodeURIComponent(targetUrl), {
                    timeout: 45000
                });
            }
        }

        if (!res.data || !res.data.download_url) {
            return reply("❌ *TeraBox වීඩියෝව ලබා ගැනීමට නොහැකි විය.*");
        }

        const data = res.data;
        const title = data.title || "TeraBox Video";
        const sizeMB = (data.size_bytes || 0) / (1024 * 1024);
        const fileName = title.endsWith('.mp4') ? title : (title + '.mp4');

        await reply("🚀 *TeraBox වීඩියෝව සූදානම් (" + (sizeMB > 0 ? sizeMB.toFixed(2) + " MB" : "Stream") + "). WhatsApp වෙත එවමින් පවතී...*");

        // Smart Size Guard routing
        try {
            if (sizeMB > 100) {
                // Send as Document if > 100MB
                await conn.sendMessage(from, {
                    document: { url: data.download_url },
                    mimetype: 'video/mp4',
                    fileName: fileName,
                    caption: "👑 *TeraBox Video (Document)* 👑\n\n📦 *File:* " + title + "\n📊 *Size:* " + (sizeMB > 0 ? sizeMB.toFixed(2) + " MB" : "Unknown") + "\n\n_Downloaded via ＤＭＣ™ (" + engineUsed + ")_"
                }, { quoted: mek });
            } else {
                // Send as Video if <= 100MB
                await conn.sendMessage(from, {
                    video: { url: data.download_url },
                    mimetype: 'video/mp4',
                    caption: "👑 *TeraBox Video* 👑\n\n📦 *File:* " + title + "\n📊 *Size:* " + (sizeMB > 0 ? sizeMB.toFixed(2) + " MB" : "Stream") + "\n\n_Downloaded via ＤＭＣ™ (" + engineUsed + ")_"
                }, { quoted: mek });
            }
        } catch (sendErr) {
            console.error("TeraBox WhatsApp Send Error:", sendErr.message);
            reply("❌ *WhatsApp වෙත වීඩියෝව යැවීමේදී දෝෂයක් සිදු විය: " + sendErr.message + "*");
        }
    } catch (err) {
        console.error("TeraBox download error:", err.message);
        const errMsg = err.response?.data?.error || err.message;
        reply("❌ *TeraBox වීඩියෝව ලබා ගැනීමේ දෝෂයක් සිදු විය: " + errMsg + "*");
    }
}

// Dedicated DiskWala download handler with Smart Dual-Engine Failover
async function handleDiskwalaDownload(conn, mek, from, targetUrl, reply) {
    try {
        await reply("⏳ *DiskWala ලින්ක් එක හඳුනාගන්නා ලදී. Playwright Cloud Engine මඟින් වීඩියෝව සකසමින් පවතී (තත්පර 15-20 ක් ගත විය හැක)...*");

        let res;
        let engineUsed = "Azure Core Engine";

        const routing = global.DOWNLOAD_ROUTING || { terabox: 'auto', all: 'auto' };
        const mode = (routing.all && routing.all !== 'auto') ? routing.all : (routing.terabox || 'auto');

        if (mode === 'azure') {
            engineUsed = "Azure Core (Manual Mode)";
            res = await axios.get(DISKWALA_AZURE_ENDPOINT + '?url=' + encodeURIComponent(targetUrl), {
                timeout: 35000,
                validateStatus: (status) => status < 500
            });
        } else if (mode === 'github') {
            engineUsed = "GitHub Actions (Manual Mode)";
            const backupBase = await getBackupBaseUrl();
            res = await axios.get(backupBase + '/api/diskwala?url=' + encodeURIComponent(targetUrl), {
                timeout: 45000,
                validateStatus: (status) => status < 500
            });
        } else {
            // 1️⃣ Attempt Primary Azure Cloud Server (25s) with failover to GitHub Actions
            try {
                res = await axios.get(DISKWALA_AZURE_ENDPOINT + '?url=' + encodeURIComponent(targetUrl), {
                    timeout: 25000,
                    validateStatus: (status) => status < 500
                });
                if (res.status === 404 || res.data?.error?.includes('404')) {
                    return reply("❌ *DiskWala 404 Error: මෙම වීඩියෝව DiskWala සර්වරයෙන් ඉවත් කර ඇත හෝ Link එක අවලංගුයි.*");
                }
                if (!res.data || !res.data.download_url) throw new Error("No download_url from Azure");
            } catch (azureErr) {
                console.warn("⚠️ Azure DiskWala busy/slow, switching to GitHub Actions Cloud Backup...", azureErr.message);
                engineUsed = "GitHub Actions Backup";
                const backupBase = await getBackupBaseUrl();
                res = await axios.get(backupBase + '/api/diskwala?url=' + encodeURIComponent(targetUrl), {
                    timeout: 45000,
                    validateStatus: (status) => status < 500
                });
            }
        }

        if (res.status === 404 || res.data?.error?.includes('404')) {
            return reply("❌ *DiskWala 404 Error: මෙම වීඩියෝව DiskWala සර්වරයෙන් ඉවත් කර ඇත හෝ Link එක අවලංගුයි.*");
        }

        if (!res.data || !res.data.download_url) {
            const errDetail = res.data?.error || 'URL not found';
            if (errDetail.includes('No genuine video stream') || errDetail.includes('ad filtering')) {
                return reply("❌ *DiskWala Stream Error: Ad filter වීමෙන් පසු සැබෑ වීඩියෝ Stream එකක් සොයාගත නොහැකි විය. වීඩියෝව App එකේ පමණක් ක්‍රියාත්මක වන එකක් විය හැක.*");
            }
            return reply("❌ *DiskWala වීඩියෝව ලබා ගැනීමට නොහැකි විය: " + errDetail + "*");
        }

        const data = res.data;
        const title = data.title || "DiskWala Video";
        const sizeMB = (data.size_bytes || 0) / (1024 * 1024);
        const fileName = title.endsWith('.mp4') ? title : (title + '.mp4');

        await reply("🚀 *DiskWala වීඩියෝව සූදානම් (" + (sizeMB > 0 ? sizeMB.toFixed(2) + " MB" : "Stream") + "). WhatsApp වෙත එවමින් පවතී...*");

        // Smart Size Guard routing
        try {
            if (sizeMB > 100) {
                // Send as Document if > 100MB
                await conn.sendMessage(from, {
                    document: { url: data.download_url },
                    mimetype: 'video/mp4',
                    fileName: fileName,
                    caption: `👑 *DiskWala Video (Document)* 👑\n\n📦 *File:* ${title}\n📊 *Size:* ${sizeMB > 0 ? sizeMB.toFixed(2) + " MB" : "Unknown"}\n\n_Downloaded via ＤＭＣ™ (${engineUsed})_`
                }, { quoted: mek });
            } else {
                // Send as Video if <= 100MB
                await conn.sendMessage(from, {
                    video: { url: data.download_url },
                    mimetype: 'video/mp4',
                    caption: `👑 *DiskWala Video* 👑\n\n📦 *File:* ${title}\n📊 *Size:* ${sizeMB > 0 ? sizeMB.toFixed(2) + " MB" : "Stream"}\n\n_Downloaded via ＤＭＣ™ (${engineUsed})_`
                }, { quoted: mek });
            }
        } catch (sendErr) {
            console.error("DiskWala WhatsApp Send Error:", sendErr.message);
            reply("❌ *WhatsApp වෙත වීඩියෝව යැවීමේදී දෝෂයක් සිදු විය: " + sendErr.message + "*");
        }
    } catch (err) {
        console.error("DiskWala download error:", err.message);
        const status = err.response?.status;
        const errMsg = err.response?.data?.error || err.message;
        if (status === 404 || errMsg.includes('404')) {
            reply("❌ *DiskWala 404 Error: මෙම වීඩියෝව DiskWala සර්වරයෙන් ඉවත් කර ඇත හෝ Link එක අවලංගුයි.*");
        } else if (errMsg.includes('No genuine video stream') || errMsg.includes('ad filtering')) {
            reply("❌ *DiskWala Stream Error: Ad filter වීමෙන් පසු සැබෑ වීඩියෝ Stream එකක් සොයාගත නොහැකි විය. වීඩියෝව App එකේ පමණක් ක්‍රියාත්මක වන එකක් විය හැක.*");
        } else {
            reply("❌ *DiskWala වීඩියෝව ලබා ගැනීමේ දෝෂයක් සිදු විය: " + errMsg + "*");
        }
    }
}

// Reusable download and stream handler
async function handleDirectDownload(conn, mek, from, rawUrl, reply) {
    let targetUrl = rawUrl.trim();

    // 0. Check for TeraBox links
    const isTeraBox = /terabox(app)?\.com|1024terabox\.com|teraboxshare\.com|nephobox\.com|4funbox\.com|mirrobox\.com|1024tera\.com/i.test(targetUrl);
    if (isTeraBox) {
        return handleTeraBoxDownload(conn, mek, from, targetUrl, reply);
    }

    // 0.1 Check for DiskWala links
    const isDiskWala = /diskwala\.com/i.test(targetUrl);
    if (isDiskWala) {
        return handleDiskwalaDownload(conn, mek, from, targetUrl, reply);
    }

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

    // ----------------------------------------------------
    // LAYER 1: Enhanced HTTP HEAD Pre-check & Gateway Extractor
    // ----------------------------------------------------
    let contentType = '';
    let fileSizeMB = 0;
    let contentDisposition = '';

    try {
        const headRes = await axios.head(targetUrl, {
            timeout: 5000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            validateStatus: (s) => s >= 200 && s < 400
        });

        contentType = headRes.headers['content-type'] ? headRes.headers['content-type'].toLowerCase() : '';
        contentDisposition = headRes.headers['content-disposition'] ? headRes.headers['content-disposition'].toLowerCase() : '';
        const contentLength = parseInt(headRes.headers['content-length'] || '0', 10);
        fileSizeMB = contentLength / (1024 * 1024);

    } catch (headErr) {
        // Fallback to minimal Range GET
        try {
            const rangeRes = await axios.get(targetUrl, {
                timeout: 7000,
                maxRedirects: 5,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Range': 'bytes=0-1024'
                },
                validateStatus: (s) => s >= 200 && s < 400
            });

            contentType = rangeRes.headers['content-type'] ? rangeRes.headers['content-type'].toLowerCase() : '';
            contentDisposition = rangeRes.headers['content-disposition'] ? rangeRes.headers['content-disposition'].toLowerCase() : '';
            const contentLength = parseInt(rangeRes.headers['content-length'] || '0', 10);
            fileSizeMB = contentLength / (1024 * 1024);
        } catch (fallbackErr) {
            console.error("Direct Precheck Error:", fallbackErr.message);
            return reply("❌ *ලින්ක් එක පරීක්ෂා කිරීම අසාර්ථක විය. ලින්ක් එක සක්‍රියදැයි බලන්න.*");
        }
    }

    // 1.1 If it's an HTML / Web page, inspect the page to extract underlying real video URL!
    if (contentType.includes('text/html') || contentType.includes('application/json') || contentType.includes('text/plain')) {
        try {
            const pageRes = await axios.get(targetUrl, {
                timeout: 8000,
                maxRedirects: 5,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });

            const extractedVideoUrl = extractVideoFromHtml(pageRes.data);
            if (extractedVideoUrl && extractedVideoUrl !== targetUrl) {
                targetUrl = extractedVideoUrl;
                try { sourceDomain = new URL(targetUrl).hostname; } catch (e) { }

                // Re-verify headers of the newly extracted genuine video URL
                const realHead = await axios.head(targetUrl, {
                    timeout: 5000,
                    maxRedirects: 5,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    validateStatus: (s) => s >= 200 && s < 400
                });

                contentType = realHead.headers['content-type'] ? realHead.headers['content-type'].toLowerCase() : 'video/mp4';
                const realLen = parseInt(realHead.headers['content-length'] || '0', 10);
                fileSizeMB = realLen / (1024 * 1024);
            } else {
                return reply("❌ *මෙම ලින්ක් එක සැබෑ Video එකක් නොවේ (ව්‍යාජ / Web Page හෝ Phishing ලින්ක් එකකි).*\n\n_ලින්ක් එක අගට .mp4 තිබුණද, සේවාදායකය (Server) විසින් ලබා දෙන්නේ වෙබ් පිටුවක් (HTML) පමණි._");
            }
        } catch (extractErr) {
            console.error("HTML Extraction Error:", extractErr.message);
            return reply("❌ *මෙම ලින්ක් එක සැබෑ Video එකක් නොවේ (ව්‍යාජ / Web Page හෝ Phishing ලින්ක් එකකි).*");
        }
    }

    // ----------------------------------------------------
    // LAYER 2: Magic Bytes Sniffing (Initial Bytes Inspection)
    // ----------------------------------------------------
    try {
        const sniffRes = await axios.get(targetUrl, {
            timeout: 7000,
            maxRedirects: 5,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Range': 'bytes=0-1024'
            },
            validateStatus: (s) => s >= 200 && s < 400
        });

        const sniffBuffer = Buffer.from(sniffRes.data);
        const magicCheck = inspectMagicBytes(sniffBuffer);

        if (!magicCheck.isVideo) {
            return reply("❌ *මෙම ලින්ක් එක සැබෑ Video File එකක් නොවේ!*\n\n⚠️ *හඳුනාගැනීම:* " + magicCheck.reason + "\n_ව්‍යාජ ලින්ක් මඟින් Bot Crash වීම වැළැක්වීමට Crash Guard විසින් මෙම ක්‍රියාවලිය නවතා දමන ලදී._");
        }

    } catch (sniffErr) {
        console.error("Magic bytes sniffing error:", sniffErr.message);
        const isExplicitVideo = VALID_VIDEO_MIME_TYPES.some(t => contentType.includes(t));
        if (!isExplicitVideo) {
            return reply("❌ *වීඩියෝවේ සත්‍යතාව තහවුරු කළ නොහැකි විය (Signature check failed).*");
        }
    }

    // ----------------------------------------------------
    // LAYER 3: Smart Size Guard (Limits & Routing)
    // ----------------------------------------------------
    const MAX_TOTAL_SIZE_MB = 300;
    const MAX_VIDEO_INLINE_MB = 100;

    if (fileSizeMB > MAX_TOTAL_SIZE_MB) {
        return reply("⚠️ *File එක විශාල වැඩියි (" + fileSizeMB.toFixed(2) + " MB). උපරිම ආරක්ෂිත සීමාව: 300 MB වේ.*");
    }

    const sizeText = fileSizeMB > 0 ? fileSizeMB.toFixed(2) + " MB" : "Direct Stream";
    await reply("🚀 *බාගත වෙමින් පවතී (" + sizeText + ")... කරුණාකර රැඳී සිටින්න.*");

    // ----------------------------------------------------
    // LAYER 4: Send Media via Baileys Stream Pipeline
    // ----------------------------------------------------
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
        reply("❌ *වීඩියෝව එවීමේදී WhatsApp දෝෂයක් සිදු විය. කරුණාකර නැවත උත්සාහ කරන්න.*");
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
            return reply("⚠️ *කරුණාකර සෘජු වීඩියෝ ලින්ක් එකක් (Direct .mp4), TeraBox හෝ DiskWala ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*.dl https://cdn2.videy.co/...mp4*\n*.dl https://1024terabox.com/s/...*\n*.dl https://www.diskwala.com/app/...*");
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

        // Ignore YouTube, TikTok & Facebook links
        if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be') || trimmed.includes('tiktok.com') || trimmed.includes('facebook.com') || trimmed.includes('fb.watch') || trimmed.includes('fb.com')) return;

        // Check if message is a direct video link
        const isHttpUrl = /^https?:\/\/\S+$/i.test(trimmed);
        if (!isHttpUrl) return;

        const isVidey = trimmed.includes('videy.co') || trimmed.includes('videyc.pw');
        const isDirectVideo = VIDEO_EXT_REGEX.test(trimmed);
        const isTeraBox = /terabox(app)?\.com|1024terabox\.com|teraboxshare\.com|nephobox\.com|4funbox\.com|mirrobox\.com|1024tera\.com/i.test(trimmed);
        const isDiskWala = /diskwala\.com/i.test(trimmed);

        if (isVidey || isDirectVideo || isTeraBox || isDiskWala) {
            await handleDirectDownload(conn, mek, from, trimmed, reply);
        }
    } catch (err) {
        console.error("Direct Link Auto Listener Error:", err.message);
    }
});
