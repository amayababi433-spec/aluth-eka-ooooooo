/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Native yt-dlp via youtube-dl-exec
 */

const { cmd } = require('../command');
const youtubedl = require('youtube-dl-exec');

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
        const output = await youtubedl(query, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0'
            ]
        });

        if (output && output.url) {
            await conn.sendMessage(from, { 
                video: { url: output.url }, 
                caption: "👑 *" + (output.title || "Here is your video!") + "* 👑\n\n_Downloaded via ＤＭＣ™ Core_" 
            }, { quoted: mek });
        } else if (output && output.formats && output.formats.length > 0) {
            const format = output.formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || output.formats.find(f => f.vcodec !== 'none');
            if (format && format.url) {
                await conn.sendMessage(from, { 
                    video: { url: format.url }, 
                    caption: "👑 *" + (output.title || "Here is your video!") + "* 👑\n\n_Downloaded via ＤＭＣ™ Core_" 
                }, { quoted: mek });
            } else {
                reply("❌ වීඩියෝ එකේ Direct Link එක ලබා ගැනීමට නොහැකි විය.");
            }
        } else {
            reply("❌ වීඩියෝ එකේ Direct Link එක ලබා ගැනීමට නොහැකි විය.");
        }
    } catch (err) {
        console.error("YTDL Error:", err.message);
        reply("❌ YouTube එකෙන් Video එක Download කිරීමට නොහැක. (Bot Protection / Restricted Video)");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
  }
});