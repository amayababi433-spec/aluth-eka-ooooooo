/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Public REST APIs Fallback Chain
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

    let downloadUrl = null;
    let title = "Here is your video!";

    // Method 1: Cobalt wuk.sh
    if (!downloadUrl) {
        try {
            const res = await axios.post("https://co.wuk.sh/api/json", { url: query }, {
                headers: { "Accept": "application/json", "Content-Type": "application/json" }
            });
            if (res.data && res.data.url) downloadUrl = res.data.url;
        } catch (e) { console.error("Wuk API Failed"); }
    }

    // Method 2: Ryzendesu API
    if (!downloadUrl) {
        try {
            const res = await axios.get("https://api.ryzendesu.vip/api/downloader/ytmp4?url=" + encodeURIComponent(query));
            if (res.data && res.data.url) downloadUrl = res.data.url;
        } catch (e) { console.error("Ryzendesu API Failed"); }
    }
    
    // Method 3: Siputzx API
    if (!downloadUrl) {
        try {
            const res = await axios.get("https://api.siputzx.my.id/api/d/ytmp4?url=" + encodeURIComponent(query));
            if (res.data && res.data.data && res.data.data.dl) downloadUrl = res.data.data.dl;
        } catch (e) { console.error("Siputzx API Failed"); }
    }

    if (downloadUrl) {
        await conn.sendMessage(from, { 
            video: { url: downloadUrl }, 
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ Core_" 
        }, { quoted: mek });
    } else {
        reply("❌ YouTube එකෙන් Video එක Download කිරීමට නොහැක. (Bot Protection / No APIs available)");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
  }
});