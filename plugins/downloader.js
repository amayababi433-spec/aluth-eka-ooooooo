/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Extreme Public REST APIs Fallback Chain
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
    
    const tryExtract = async () => {
        // Method 1: Cobalt wuk.sh
        try {
            const res = await axios.post("https://co.wuk.sh/api/json", { url: query }, { headers: { "Accept": "application/json", "Content-Type": "application/json" } });
            if (res.data && res.data.url) return res.data.url;
        } catch (e) {}

        // Method 2: Vreden API
        try {
            const res = await axios.get("https://api.vreden.web.id/api/ytmp4?url=" + encodeURIComponent(query));
            if (res.data && res.data.result && res.data.result.download && res.data.result.download.url) return res.data.result.download.url;
        } catch (e) {}
        
        // Method 3: Gifted API
        try {
            const res = await axios.get("https://api.giftedtech.my.id/api/download/ytdl?apikey=gifted&url=" + encodeURIComponent(query));
            if (res.data && res.data.result && res.data.result.url) return res.data.result.url;
        } catch (e) {}

        // Method 4: Yanzbotz API
        try {
            const res = await axios.get("https://api.yanzbotz.my.id/api/downloader/ytmp4?url=" + encodeURIComponent(query));
            if (res.data && res.data.result && res.data.result.url) return res.data.result.url;
        } catch (e) {}

        return null;
    };

    downloadUrl = await tryExtract();

    if (downloadUrl) {
        await conn.sendMessage(from, { 
            video: { url: downloadUrl }, 
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ Core_" 
        }, { quoted: mek });
    } else {
        reply("❌ YouTube එකෙන් Video එක Download කිරීමට නොහැක. (Bot Protection / All APIs are blocked)");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
  }
});