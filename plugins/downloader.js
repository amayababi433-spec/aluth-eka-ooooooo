/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Native YouTube Downloader with Custom Azure Playwright API
 */

const { cmd } = require('../command');
const axios = require('axios');
const yts = require('yt-search');

cmd({
  on: "body",
  pattern: "download",
  alias: ["song", "play", "video", "yt", "audio", "mp3", "mp4"],
  react: "⏳",
  desc: "Download YouTube videos natively",
  category: "download",
  filename: __filename
}, async (conn, mek, m, { from, q, reply, body }) => {
  try {
    let query = q ? q.trim() : (body ? body.trim() : "");
    if (!query) return reply("⚠️ කරුණාකර සිංදුවක නමක් හෝ YouTube ලින්ක් එකක් ලබා දෙන්න.");

    reply("⏳ *සොයමින් පවතී... කරුණාකර රැඳී සිටින්න.*");

    let videoUrl = query;
    let videoTitle = "";

    // Search YouTube if it's not a link
    if (!query.includes("youtube.com") && !query.includes("youtu.be")) {
        const searchResults = await yts(query);
        if (!searchResults.videos.length) {
            return reply("❌ වීඩියෝවක් සොයාගත නොහැකි විය.");
        }
        videoUrl = searchResults.videos[0].url;
        videoTitle = searchResults.videos[0].title;
    }

    try {
        let apiUrl = "https://dmc-api-pasindu-2024.loca.lt/api/info?url=" + encodeURIComponent(videoUrl);
        let response = await axios.get(apiUrl, {
            headers: {
                "Bypass-Tunnel-Reminder": "true"
            }
        });
        
        let data = response.data;
        if (!data || !data.download_url) {
            return reply("❌ වීඩියෝ එකේ Direct Link එක ලබා ගැනීමට නොහැකි විය. (Stream not found)");
        }

        const finalTitle = data.title || videoTitle || "Here is your video!";
        
        await conn.sendMessage(from, { 
            video: { url: data.download_url }, 
            caption: "👑 *" + finalTitle + "* 👑\n\n_Downloaded via ＤＭＣ™ Core (Playwright Engine)_" 
        }, { quoted: mek });

    } catch (err) {
        console.error("API Error:", err.message);
        reply("❌ YouTube එකෙන් Video එක Download කිරීමට නොහැක. (Bot Protection / Restricted Video)");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
  }
});