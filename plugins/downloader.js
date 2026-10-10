/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Native YouTube Downloader with play-dl
 */

const { cmd } = require('../command');
const play = require('play-dl');

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
        let yt_info = await play.video_info(query);
        let stream = await play.stream_from_info(yt_info, { quality: 1 }); 
        // quality 1 means highest video quality that has audio, play-dl handles this well

        if (!stream || !stream.url) {
            return reply("❌ වීඩියෝ එකේ Direct Link එක ලබා ගැනීමට නොහැකි විය.");
        }

        const title = yt_info.video_details.title || "Here is your video!";
        
        await conn.sendMessage(from, { 
            video: { url: stream.url }, 
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ Core_" 
        }, { quoted: mek });

    } catch (err) {
        console.error("Play-DL Error:", err);
        reply("❌ YouTube එකෙන් Video එක Download කිරීමට නොහැක. (Bot Protection / Restricted Video)");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
  }
});