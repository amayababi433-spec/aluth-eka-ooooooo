/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Native YouTube Downloader with Custom Azure Playwright API
 */

const { cmd } = require('../command');
const axios = require('axios');

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
    
    if (!query.includes("youtube.com") && !query.includes("youtu.be")) {
       if (q) return reply("⚠️ කරුණාකර නිවැරදි YouTube ලින්ක් එකක් ලබා දෙන්න.");
       return;
    }

    reply("⏳ *Video එක Download වෙමින් පවතී... කරුණාකර රැඳී සිටින්න.*");

    try {
        let response = await axios.get(\https://dmc-bot-api.loca.lt/api/info?url=\\, {
            headers: {
                "Bypass-Tunnel-Reminder": "true"
            }
        });
        
        let data = response.data;
        if (!data || !data.download_url) {
            return reply("❌ වීඩියෝ එකේ Direct Link එක ලබා ගැනීමට නොහැකි විය. (Stream not found)");
        }

        const title = data.title || "Here is your video!";
        
        await conn.sendMessage(from, { 
            video: { url: data.download_url }, 
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ Core (Playwright Engine)_" 
        }, { quoted: mek });

    } catch (err) {
        console.error("API Error:", err.message);
        reply("❌ YouTube එකෙන් Video එක Download කිරීමට නොහැක. (Bot Protection / Restricted Video)");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
  }
});