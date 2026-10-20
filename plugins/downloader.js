/**
 * 👑 DMC GOD MODE V54 (SMART FAILOVER ENGINE) 👑
 * LOGIC: Primary Azure Cloud Server (Fast Direct Core) ──► Busy/Down? ──► Auto GitHub Actions Backup (16GB RAM)
 * FEATURES: 100% Native YouTube Audio/Video + Swipe-to-MP3 + 1-Tap Link + yt-search + Crash Guard
 */

const { cmd } = require('../command');
const axios = require('axios');
const yts = require('yt-search');

// 1️⃣ Primary Server: User's Azure Cloud VM (High-Speed Direct Core)
const PRIMARY_AZURE_API = 'https://copyright-handled-todd-latter.trycloudflare.com/api/info';

// 2️⃣ Backup Server: Dynamic Cloudflare / Localtunnel Backup URL resolver
let cachedBackupUrl = 'https://roland-certificates-component-weed.trycloudflare.com/api/info';
let lastUrlFetchTime = 0;

async function getBackupApiUrl() {
    if (Date.now() - lastUrlFetchTime < 30000 && cachedBackupUrl) {
        return cachedBackupUrl;
    }
    try {
        const res = await axios.get('https://raw.githubusercontent.com/dimdtu0-cell/dmc-backup-api/main/api_url.txt?t=' + Date.now(), { timeout: 5000 });
        if (res.data && res.data.trim().startsWith('https://')) {
            cachedBackupUrl = res.data.trim().replace(/\/$/, '') + '/api/info';
            lastUrlFetchTime = Date.now();
            console.log('📡 [DYNAMIC BACKUP] Resolved live Cloudflare backup URL:', cachedBackupUrl);
        }
    } catch (e) {
        lastUrlFetchTime = 0; // invalidate on error so next call retries fresh
    }
    return cachedBackupUrl;
}

// Smart Failover & Manual Routing Engine
async function fetchMediaWithFailover(videoUrl, type = 'video') {
    const routing = global.DOWNLOAD_ROUTING || { yt: 'auto', all: 'auto' };
    const mode = (routing.all && routing.all !== 'auto') ? routing.all : (routing.yt || 'auto');
    console.log(`🎯 [YouTube Engine Routing] Mode: ${mode.toUpperCase()} (Full Routing: ${JSON.stringify(routing)})`);

    // 1️⃣ Preferred Mode: Azure Cloud Server (with Auto GitHub Failover Guard)
    if (mode === 'azure') {
        try {
            const res = await axios.get(PRIMARY_AZURE_API + '?url=' + encodeURIComponent(videoUrl) + '&type=' + type, {
                headers: { 'Bypass-Tunnel-Reminder': 'true' },
                timeout: 30000
            });
            if (res.data && res.data.download_url) {
                return {
                    ...res.data,
                    engineUsed: 'Azure Core'
                };
            }
            throw new Error(res.data?.error || "Azure server returned no download_url");
        } catch (azErr) {
            console.warn(`⚠️ [Azure Server Issue]: ${azErr.message}. Auto-failover to GitHub Runner...`);
            const backupApiUrl = await getBackupApiUrl();
            const backupRes = await axios.get(backupApiUrl + '?url=' + encodeURIComponent(videoUrl) + '&type=' + type, {
                headers: { 'Bypass-Tunnel-Reminder': 'true' },
                timeout: 40000
            });
            if (backupRes.data && backupRes.data.download_url) {
                return {
                    ...backupRes.data,
                    engineUsed: 'GitHub Actions (Failover Guard)'
                };
            }
            throw azErr;
        }
    }

    // 2️⃣ Preferred Mode: GitHub Actions Runner (with Auto Azure Failover Guard)
    if (mode === 'github') {
        try {
            const backupApiUrl = await getBackupApiUrl();
            const backupRes = await axios.get(backupApiUrl + '?url=' + encodeURIComponent(videoUrl) + '&type=' + type, {
                headers: { 'Bypass-Tunnel-Reminder': 'true' },
                timeout: 75000
            });
            if (backupRes.data && backupRes.data.download_url) {
                return {
                    ...backupRes.data,
                    engineUsed: 'GitHub Actions Runner'
                };
            }
            throw new Error(backupRes.data?.error || "GitHub Actions backup returned no download_url");
        } catch (ghErr) {
            console.warn(`⚠️ [GitHub Runner Issue]: ${ghErr.message}. Auto-switching to Azure Cloud Server to ensure 100% download success!`);
            try {
                const res = await axios.get(PRIMARY_AZURE_API + '?url=' + encodeURIComponent(videoUrl) + '&type=' + type, {
                    headers: { 'Bypass-Tunnel-Reminder': 'true' },
                    timeout: 25000
                });
                if (res.data && res.data.download_url) {
                    return {
                        ...res.data,
                        engineUsed: 'Azure Core (Failover Guard)'
                    };
                }
            } catch (azErr) {
                console.error('Azure failover also failed:', azErr.message);
            }
            throw ghErr;
        }
    }

    // 3️⃣ Smart Auto Failover Mode (Azure Primary 15s ──► Fail? ──► GitHub Actions Backup 35s)
    let lastErr = null;

    try {
        const res = await axios.get(PRIMARY_AZURE_API + '?url=' + encodeURIComponent(videoUrl) + '&type=' + type, {
            headers: { 'Bypass-Tunnel-Reminder': 'true' },
            timeout: 15000
        });
        if (res.data && res.data.download_url) {
            return {
                ...res.data,
                engineUsed: 'Primary Azure Core'
            };
        }
    } catch (primaryErr) {
        lastErr = primaryErr;
        console.warn(`⚠️ [FAILOVER TRIGGERED] Primary Azure API busy/down (${primaryErr.message}). Switching to GitHub Actions Backup...`);
    }

    try {
        const backupApiUrl = await getBackupApiUrl();
        const backupRes = await axios.get(backupApiUrl + '?url=' + encodeURIComponent(videoUrl) + '&type=' + type, {
            headers: { 'Bypass-Tunnel-Reminder': 'true' },
            timeout: 75000
        });
        if (backupRes.data && backupRes.data.download_url) {
            return {
                ...backupRes.data,
                engineUsed: 'Backup Cloud Failover'
            };
        }
    } catch (backupErr) {
        console.error(`❌ [ALL ENGINES FAILED] Azure: ${lastErr?.message} | GitHub: ${backupErr.message}`);
        throw new Error(backupErr.message || lastErr?.message || "Both download engines failed");
    }

    throw new Error("Stream not found from both Primary and Backup engines");
}

// Connection-safe media sender with retry logic for network stability
async function sendMediaSafely(sock, jid, payload, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await sock.sendMessage(jid, payload, options);
        } catch (err) {
            console.warn(`⚠️ [Media Send Attempt ${i + 1} Failed]: ${err.message}. Retrying in 3s...`);
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, 3000));
            } else {
                throw err;
            }
        }
    }
}

// ----------------------------------------------------
// Secret Zero-Width Invisible Character Encoder/Decoder
// ----------------------------------------------------
function encodeInvisible(text) {
    const binary = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');
    const invisible = binary.split('').map(b => b === '1' ? '\u200C' : '\u200B').join('');
    return '\u200D' + invisible + '\u200D';
}

function decodeInvisible(str) {
    if (!str) return null;
    const match = str.match(/\u200D([\u200B\u200C]+)\u200D/);
    if (!match) return null;
    const binary = match[1];
    let decoded = '';
    for (let i = 0; i < binary.length; i += 8) {
        const byte = binary.substr(i, 8);
        if (byte.length === 8) {
            const charCode = parseInt(byte.split('').map(c => c === '\u200C' ? '1' : '0').join(''), 2);
            decoded += String.fromCharCode(charCode);
        }
    }
    return decoded;
}

// 1. COMMAND HANDLER (.song, .video, .play, .yt, .audio, .mp3, .mp4, etc.)
cmd({
    pattern: "download",
    alias: ["song", "play", "video", "yt", "audio", "mp3", "mp4", "yta", "ytaudio"],
    react: "🎬",
    desc: "Download YouTube audio or video with Smart Failover",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, prefix, command, body }) => {
    try {
        if (mek.key.fromMe) return; // Prevent self-trigger loop

        const cmdName = (command || (body && body.startsWith('.') ? body.slice(1).trim().split(' ')[0].toLowerCase() : '')).toLowerCase();
        const isAudioOnly = (cmdName === 'mp3' || cmdName === 'audio' || cmdName === 'yta' || cmdName === 'ytaudio');

        let query = q ? q.trim() : "";
        if (!query) {
            // Check if user quoted a video with secret audio code or a YouTube URL
            const quoted = mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                const quotedCaption = quoted?.videoMessage?.caption || quoted?.extendedTextMessage?.text || quoted?.conversation || "";
                const secretPayload = decodeInvisible(quotedCaption);
                if (secretPayload && secretPayload.startsWith("DMC_AUDIO:")) {
                    query = secretPayload.replace("DMC_AUDIO:", "").trim();
                } else {
                    const ytMatch = quotedCaption.match(/(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]+(\S*)?/i);
                    if (ytMatch) query = ytMatch[0];
                }
            }
        }

        if (!query) {
            return reply("⚠️ *කරුණාකර නමක් හෝ YouTube ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*." + (cmdName || 'video') + " bowitiya mal*\n*." + (cmdName || 'video') + " https://youtu.be/...*");
        }

        await reply(isAudioOnly ? "⏳ *Audio සොයමින් පවතී... කරුණාකර රැඳී සිටින්න.*" : "⏳ *සොයමින් පවතී... කරුණාකර රැඳී සිටින්න.*");

        let targetUrl = query;
        let searchTitle = "";

        // If not a direct YouTube URL, search YouTube
        if (!query.includes("youtube.com") && !query.includes("youtu.be")) {
            const searchResults = await yts(query);
            if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
                return reply("❌ *වීඩියෝවක් සොයාගත නොහැකි විය.*");
            }
            targetUrl = searchResults.videos[0].url;
            searchTitle = searchResults.videos[0].title;
        }

        const fetchType = isAudioOnly ? 'audio' : 'video';

        // Fetch stream via Smart Failover Engine (Azure ──► GitHub Actions Backup)
        const data = await fetchMediaWithFailover(targetUrl, fetchType);
        if (!data || !data.download_url) {
            return reply("❌ *Direct Stream Link එක ලබා ගැනීමට නොහැකි විය.*");
        }

        const cleanTitle = (data.title && data.title !== "- YouTube" && data.title !== "YouTube") ? data.title : (searchTitle || (isAudioOnly ? "Audio Track" : "Video"));
        const engineLabel = data.engineUsed || "Primary Azure Core";

        if (isAudioOnly) {
            await sendMediaSafely(conn, from, {
                audio: { url: data.download_url },
                mimetype: 'audio/mpeg',
                fileName: cleanTitle + '.mp3',
                ptt: false
            }, { quoted: mek });
            return;
        }

        // Extract bot number for 1-Tap Link
        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';

        // Embed invisible secret payload for Swipe-to-MP3
        const secretCode = encodeInvisible("DMC_AUDIO:" + targetUrl);
        const swipePrompt = "\n\n╰┈➤ ⏩ 🎵 *MP3 Audio සඳහා මේ මැසේජ් එක දකුණට Swipe කරන්න*" + secretCode;
        const oneTapPrompt = botNum ? `\n╰┈➤ 👆 🎵 *1-Tap MP3 Link:* https://wa.me/${botNum}?text=.mp3%20${encodeURIComponent(targetUrl)}` : '';

        // Send Video with stylish Swipe prompt, 1-Tap link, and Engine label
        await sendMediaSafely(conn, from, {
            video: { url: data.download_url },
            caption: "👑 *" + cleanTitle + "* 👑\n\n_Downloaded via ＤＭＣ™ (" + engineLabel + ")_" + swipePrompt + oneTapPrompt
        }, { quoted: mek });

    } catch (err) {
        console.error("Downloader Error:", err.message);
        reply("❌ *YouTube වෙතින් Download කිරීමට නොහැකි විය. (සර්වර් කාර්යබහුලයි, කරුණාකර මොහොතකින් නැවත උත්සාහ කරන්න)*");
    }
});

// 2. PASSIVE LISTENER: Direct YouTube link paste & Swipe-to-MP3 Quoted Reply
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, reply }) => {
    try {
        if (mek.key.fromMe) return; // Never trigger on own messages

        // A. Check if the user swiped right (quoted) on a DMC video with invisible audio payload
        const quoted = mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted) {
            const quotedCaption = quoted?.videoMessage?.caption || quoted?.extendedTextMessage?.text || quoted?.conversation || "";
            const secretPayload = decodeInvisible(quotedCaption);

            if (secretPayload && secretPayload.startsWith("DMC_AUDIO:")) {
                const targetUrl = secretPayload.replace("DMC_AUDIO:", "").trim();

                await reply("⏳ *MP3 Audio එක සකසමින් පවතී... කරුණාකර රැඳී සිටින්න.*");

                const audioData = await fetchMediaWithFailover(targetUrl, 'audio');
                if (!audioData || !audioData.download_url) {
                    return reply("❌ *Audio Stream එක ලබා ගැනීමට නොහැකි විය.*");
                }

                const audioTitle = (audioData.title && audioData.title !== "- YouTube" && audioData.title !== "YouTube") ? audioData.title : "Audio Track";

                await conn.sendMessage(from, {
                    audio: { url: audioData.download_url },
                    mimetype: 'audio/mpeg',
                    fileName: audioTitle + '.mp3',
                    ptt: false
                }, { quoted: mek });

                return; // Handled swipe-to-mp3
            }
        }

        // B. Passive listener for direct links pasted without command
        if (!body) return;
        const trimmed = body.trim();
        const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]+(\S*)?$/i;
        if (!ytRegex.test(trimmed)) return;

        // Ignore if user typed a command like .video http://...
        if (trimmed.startsWith('.') || trimmed.startsWith('!') || trimmed.startsWith('/')) return;

        await reply("⏳ *YouTube ලින්ක් එක හඳුනාගන්නා ලදී. Download වෙමින් පවතී...*");

        const data = await fetchMediaWithFailover(trimmed, 'video');
        if (!data || !data.download_url) {
            return reply("❌ *Stream Link එක ලබා ගැනීමට නොහැකි විය.*");
        }

        const title = data.title || "YouTube Video";
        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';
        const secretCode = encodeInvisible("DMC_AUDIO:" + trimmed);
        const swipePrompt = "\n\n╰┈➤ ⏩ 🎵 *MP3 Audio සඳහා මේ මැසේජ් එක දකුණට Swipe කරන්න*" + secretCode;
        const oneTapPrompt = botNum ? `\n╰┈➤ 👆 🎵 *1-Tap MP3 Link:* https://wa.me/${botNum}?text=.mp3%20${encodeURIComponent(trimmed)}` : '';
        const engineLabel = data.engineUsed || "Primary Azure Core";

        await sendMediaSafely(conn, from, {
            video: { url: data.download_url },
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ (" + engineLabel + ")_" + swipePrompt + oneTapPrompt
        }, { quoted: mek });

    } catch (err) {
        console.error("Auto YouTube / Swipe error:", err.message);
    }
});