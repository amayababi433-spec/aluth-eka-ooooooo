/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Native YouTube Downloader (Bypassing external APIs)
 */

const { cmd } = require('../command');
const ytdl = require('@distube/ytdl-core');

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
        // Extract video info
        const info = await ytdl.getInfo(query);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo', filter: 'audioandvideo' }) || ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });
        
        if (!format || !format.url) {
            return reply("❌ වීඩියෝ එකේ Direct Link එක ලබා ගැනීමට නොහැකි විය.");
        }

        const title = info.videoDetails.title || "Here is your video!";
        
        await conn.sendMessage(from, { 
            video: { url: format.url }, 
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ Core_" 
        }, { quoted: mek });

    } catch (err) {
        console.error("YTDL Error:", err);
        reply("❌ YouTube එකෙන් Video එක Download කිරීමට නොහැක. (Bot Protection / Restricted Video)");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
  }
});