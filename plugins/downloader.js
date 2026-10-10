/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Native YouTube Downloader with play-dl
 */

const { cmd } = require('../command');
const play = require('play-dl');

// Set proper YouTube cookies using the user's latest provided cookies
play.setToken({ 
  youtube: { 
    cookie: 'VISITOR_PRIVACY_METADATA=CgJMSxIEGgAgYA%3D%3D; __Secure-3PSID=g.a000DgkgWo2pnksCu5Zo0kv2Bdgeo3BIqO58z3vNoEx4O7eIpr6qG6hw2VNtA3CUE7Z3hg53hAACgYKAZ0SARMSFQHGX2MiiEjhusZC8Em2t8KsFnWp3hoVAUF8yKoXZhR9ms_Ky0coUY50uT2N0076; GPS=1; YSC=K2JYvk__bqI; SID=g.a000DgkgWo2pnksCu5Zo0kv2Bdgeo3BIqO58z3vNoEx4O7eIpr6qx1pHow0fjT1hM9i335ZlCgACgYKAf8SARMSFQHGX2MiDEskuvj8M8-SnMw35w7CCxoVAUF8yKp8VCRgIazOcBM6N0Gwwyjt0076; __Secure-1PSIDTS=sidts-CjUBkldj_4N7vXCjLwN7fDl5xWhd3LJ7xOgcaE730kD8lva0SSLFQeH6iDUa_3EgpVa_kI6iwxAA; SAPISID=MuNMK7jPkjNXoMyT/AJgk69PzOweudL5QH; __Secure-1PSIDCC=AKEyXzVfKpnhyjyUr0j2wQsJG4yaDOPe2l9c6jD6ub6GkfQq50iKfGnQWzgMrPzJeTMN4ert8Q; SSID=An344bm1tdNjMBM0O; __Secure-1PAPISID=MuNMK7jPkjNXoMyT/AJgk69PzOweudL5QH; __Secure-1PSID=g.a000DgkgWo2pnksCu5Zo0kv2Bdgeo3BIqO58z3vNoEx4O7eIpr6qNY98E50DYMZzNdeGZxnYDQACgYKAdsSARMSFQHGX2Mi9b1ewi2YKPO7Zyon-qoZWxoVAUF8yKqiuC7OtHasYzM1fkAfsot70076; __Secure-3PAPISID=MuNMK7jPkjNXoMyT/AJgk69PzOweudL5QH; __Secure-3PSIDCC=AKEyXzXxcBD4DreaqizDHFDJ6r0oF4tRBqz_j9P-iI6JeeHObIhSzAUQo-O-3_9D722aQO9B; __Secure-3PSIDTS=sidts-CjUBkldj_4N7vXCjLwN7fDl5xWhd3LJ7xOgcaE730kD8lva0SSLFQeH6iDUa_3EgpVa_kI6iwxAA; APISID=QRE7rUj274ZWyULz/A0RxVabzu7axyuVbu; HSID=AtyXuIhJSuIopUrVH; LOGIN_INFO=AFmmF2swRAIgFL0SMPAUn3bs80YloPaOrTxAg6LubMh7R_v_OwxTgqoCIAyVnRY851mKjuEo8VZoA67DHLnCAEHsPcT0hO7bZ7gw:QUQ3MjNmenJ4RmpGa2MwdS1wS25WaXd5ZkFHMFJlOTZCRUZYYlczZXBhdUZOa0RtZVo0TzRKMDhNTlRBMTJSVV91NUVyQ05TYUN6NWR4V1NMVUtfakdycXJqNkxCSzdTbEZQcE5JY3NaekZBaEVHQ1JVTTR3N1NJMVYxeGN5Rk5qM05fTlhmSU1zZzFER2ppZXU1YkpMTzAyNFpiVkRncHl3; PREF=tz=Asia.Colombo' 
  } 
});

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
        // Request quality 2 which usually gets standard video with audio, or stream will auto-pick the best
        let stream = await play.stream_from_info(yt_info, { quality: 1 }); 
        
        if (!stream || !stream.url) {
            // Fallback for some stream issues in play-dl
            return reply("❌ වීඩියෝ එකේ Direct Link එක ලබා ගැනීමට නොහැකි විය. (Stream not found)");
        }

        const title = yt_info.video_details.title || "Here is your video!";
        
        await conn.sendMessage(from, { 
            video: { url: stream.url }, 
            caption: "👑 *" + title + "* 👑\n\n_Downloaded via ＤＭＣ™ Core (play-dl)_" 
        }, { quoted: mek });

    } catch (err) {
        console.error("Play-DL Error:", err.message);
        reply("❌ YouTube එකෙන් Video එක Download කිරීමට නොහැක. (Bot Protection / Restricted Video)");
    }

  } catch (e) {
    console.error('Song/Video Downloader Error:', e.message);
  }
});