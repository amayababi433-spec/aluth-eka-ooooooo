/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD & ANTI-SPAM) 👑
 * LOGIC: Native YouTube Downloader with Azure Playwright Engine
 */

const { cmd } = require('../command');
const axios = require('axios');
const yts = require('yt-search');

const API_ENDPOINT = 'https://copyright-handled-todd-latter.trycloudflare.com/api/info';

// Helper to fetch video info from our Azure Playwright API
async function fetchFromAzure(videoUrl) {
    const res = await axios.get(API_ENDPOINT + '?url=' + encodeURIComponent(videoUrl), {
        timeout: 90000
    });
    return res.data;
}

// 1. COMMAND HANDLER (.song, .video, .play, .yt, .mp3, .mp4, etc.)
cmd({
    pattern: "download",
    alias: ["song", "play", "video", "yt", "audio", "mp3", "mp4"],
    react: "🎵",
    desc: "Download YouTube audio or video",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, prefix, command }) => {
    try {
        if (mek.key.fromMe) return; // Prevent self-trigger loop

        let query = q ? q.trim() : "";
        if (!query) {
            return reply("⚠️ *කරුණාකර නමක් හෝ YouTube ලින්ක් එකක් ලබා දෙන්න!*\n\nඋදාහරණ:\n*." + (command || 'song') + " mihirawi*\n*." + (command || 'song') + " https://youtu.be/...*");
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

        const data = await fetchFromAzure(targetUrl);
        if (!data || !data.download_url) {
            return reply("❌ *වීඩියෝ එකේ Direct Stream Link එක ලබා ගැනීමට නොහැකි විය.*");
        }

        const cleanTitle = (data.title && data.title !== "- YouTube" && data.title !== "YouTube") ? data.title : (searchTitle || "Song / Video");
        const cmdName = (command || "").toLowerCase();
        const isAudio = ["song", "play", "audio", "mp3"].includes(cmdName);

        if (isAudio) {
            await conn.sendMessage(from, {
                audio: { url: data.download_url },
                mimetype: 'audio/mpeg',
                fileName: cleanTitle + '.mp3'
            }, { quoted: mek });
        } else {
            await conn.sendMessage(from, {
                video: { url: data.download_url },
                caption: "👑 *" + cleanTitle + "* 👑\n\n_Downloaded via ＤＭＣ™ Core (Playwright Engine)_"
            }, { quoted: mek });
        }

    } catch (err) {
        console.error("Downloader Error:", err.message);
        reply("❌ *YouTube වෙතින් Download කිරීමට නොහැකි විය. කරුණාකර සුළු මොහොතකින් නැවත උත්සාහ කරන්න.*");
    }
});

// 2. PASSIVE LISTENER: ONLY for direct YouTube links pasted without prefix
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, reply }) => {
    try {
        if (!body || mek.key.fromMe) return; // Never trigger on own messages

        const trimmed = body.trim();
        // Strict regex: Message must ONLY be a YouTube link (preventing spam on regular conversations)
        const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]+(\S*)?$/i;
        if (!ytRegex.test(trimmed)) return;

        // Ignore if user typed a command like .song http://...
        if (trimmed.startsWith('.') || trimmed.startsWith('!') || trimmed.startsWith('/')) return;

        await reply("⏳ *YouTube ලින්ක් එක හඳුනාගන්නා ලදී. Download වෙමින් පවතී...*");

        const data = await fetchFromAzure(trimmed);
        if (!data || !data.download_url) {
            return reply("❌ *Stream Link එක ලබා ගැනීමට නොහැකි විය.*");
        }

        const title = data.title || "YouTube Video";

        await conn.sendMessage(from, {
            video: { url: data.download_url },
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ Core (Playwright Engine)_"
        }, { quoted: mek });

    } catch (err) {
        console.error("Auto YouTube link error:", err.message);
    }
});