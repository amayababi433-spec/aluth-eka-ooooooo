/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD & ANTI-SPAM) 👑
 * LOGIC: Native YouTube Downloader with Azure Playwright Engine + Swipe-to-MP3
 */

const { cmd } = require('../command');
const axios = require('axios');
const yts = require('yt-search');

const API_ENDPOINT = 'https://copyright-handled-todd-latter.trycloudflare.com/api/info';

// Helper to fetch video or audio info from our Azure Playwright API
async function fetchFromAzure(videoUrl, type = 'video') {
    const res = await axios.get(API_ENDPOINT + '?url=' + encodeURIComponent(videoUrl) + '&type=' + type, {
        timeout: 90000
    });
    return res.data;
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

// 1. COMMAND HANDLER (.song, .video, .play, .yt, .mp3, .mp4, etc.)
cmd({
    pattern: "download",
    alias: ["song", "play", "video", "yt", "audio", "mp3", "mp4"],
    react: "🎬",
    desc: "Download YouTube audio or video",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, prefix, command }) => {
    try {
        if (mek.key.fromMe) return; // Prevent self-trigger loop

        let query = q ? q.trim() : "";
        if (!query) {
            return reply("⚠️ *කරුණාකර නමක් හෝ YouTube ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*." + (command || 'video') + " bowitiya mal*\n*." + (command || 'video') + " https://youtu.be/...*");
        }

        await reply("⏳ *සොයමින් පවතී... කරුණාකර රැඳී සිටින්න.*");

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

        // Fetch video stream from Azure
        const data = await fetchFromAzure(targetUrl, 'video');
        if (!data || !data.download_url) {
            return reply("❌ *වීඩියෝ එකේ Direct Stream Link එක ලබා ගැනීමට නොහැකි විය.*");
        }

        const cleanTitle = (data.title && data.title !== "- YouTube" && data.title !== "YouTube") ? data.title : (searchTitle || "Video");

        // Embed invisible secret payload for Swipe-to-MP3
        const secretCode = encodeInvisible("DMC_AUDIO:" + targetUrl);
        const swipePrompt = "\n\n╰┈➤ ⏩ 🎵 *MP3 Audio සඳහා මේ මැසේජ් එක දකුණට Swipe කරන්න*" + secretCode;

        // Send Video with stylish Swipe prompt
        await conn.sendMessage(from, {
            video: { url: data.download_url },
            caption: "👑 *" + cleanTitle + "* 👑\n\n_Downloaded via ＤＭＣ™ Core (Playwright Engine)_" + swipePrompt
        }, { quoted: mek });

    } catch (err) {
        console.error("Downloader Error:", err.message);
        reply("❌ *YouTube වෙතින් Download කිරීමට නොහැකි විය. කරුණාකර සුළු මොහොතකින් නැවත උත්සාහ කරන්න.*");
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

                const audioData = await fetchFromAzure(targetUrl, 'audio');
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

        const data = await fetchFromAzure(trimmed, 'video');
        if (!data || !data.download_url) {
            return reply("❌ *Stream Link එක ලබා ගැනීමට නොහැකි විය.*");
        }

        const title = data.title || "YouTube Video";
        const secretCode = encodeInvisible("DMC_AUDIO:" + trimmed);
        const swipePrompt = "\n\n╰┈➤ ⏩ 🎵 *MP3 Audio සඳහා මේ මැසේජ් එක දකුණට Swipe කරන්න*" + secretCode;

        await conn.sendMessage(from, {
            video: { url: data.download_url },
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ Core (Playwright Engine)_" + swipePrompt
        }, { quoted: mek });

    } catch (err) {
        console.error("Auto YouTube / Swipe error:", err.message);
    }
});