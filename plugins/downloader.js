/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: n8n YouTube Downloader Integration
 */

const { cmd } = require('../command');
const axios = require('axios');

cmd({
  on: "body",
  pattern: "download",
  alias: ["song", "play", "video", "yt", "audio", "mp3", "mp4"],
  react: "⏳",
  desc: "Download YouTube videos via n8n",
  category: "download",
  filename: __filename
}, async (conn, mek, m, { from, q, reply, args, sender, body }) => {
  try {
    let query = q ? q.trim() : (body ? body.trim() : "");
    
    // Check if it's a valid youtube link
    if (!query.includes("youtube.com") && !query.includes("youtu.be")) {
       if (q) return reply("⚠️ කරුණාකර නිවැරදි YouTube ලින්ක් එකක් ලබා දෙන්න.");
       return;
    }

    reply("⏳ *Video එක Download වෙමින් පවතී... කරුණාකර රැඳී සිටින්න.*");

    const n8nWebhookUrl = 'http://172.198.152.235:80/webhook/236fbbcc-f33c-45e1-8c79-60bee0df774f';
    
    try {
        const response = await axios.post(n8nWebhookUrl, {
            sender: sender,
            message: query,
            botIdentifier: "👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑"
        });

        if (response.data && response.data.download_url) {
            await conn.sendMessage(from, { 
                video: { url: response.data.download_url }, 
                caption: "👑 *" + (response.data.title || "Here is your video!") + "* 👑\n\n_Downloaded via n8n Data Pipeline_" 
            }, { quoted: mek });
        } else {
            reply("❌ n8n එකෙන් Video එක ලබා ගැනීමට නොහැකි විය. (No direct link found)");
        }
    } catch (err) {
        console.error("n8n API Error:", err.message);
        reply("❌ n8n සර්වර් එක සමග සම්බන්ධ වීමට නොහැක. Webhook URL එක නිවැරදිදැයි පරීක්ෂා කරන්න.");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
    reply('❌ සිංදුව හෝ වීඩියෝව බාගත කිරීමේදී දෝෂයක් ඇති විය.');
  }
});