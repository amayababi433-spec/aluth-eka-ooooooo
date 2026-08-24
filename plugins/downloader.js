/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Song Menu (Image Failed -> Text Fallback)
 */

const { cmd } = require('../command');

// Session Objects
if (!global.pendingSessions) global.pendingSessions = {};
if (!global.songSessions) global.songSessions = {};

cmd({
  pattern: "download",
  alias: ["song", "play", "video", "yt", "audio", "mp3", "mp4"],
  react: "☁️",
  filename: __filename
}, async (conn, mek, m, { from, q, reply, args, sender, body }) => {
  try {
    const textContent = (body || m.text || m.caption || "").trim();

    // 1. SKIP IF REPLYING TO MENU (Handled in main.js)
    if (global.pendingSessions[sender] && ["1", "2", "3"].includes(textContent)) return;
    if (global.songSessions[sender] && ["1", "2"].includes(textContent)) return;

    // 2. VALIDATE QUERY
    let query = q ? q.trim() : "";
    if (!query) return reply("⚠️ Link හෝ නමක් ලබා දෙන්න!");

    const commandName = body.split(" ")[0].toLowerCase().replace('.', '');
    const isSongCommand = ['song', 'audio', 'play', 'mp3'].includes(commandName);

    // 🅰️ SCENARIO A: SONG (Show Selection Menu) 🎵
    if (isSongCommand) {
      global.songSessions[sender] = { url: query, time: Date.now() };

      const songMenu = `👑 *DMC MUSIC SELECTOR* 👑\n\n🎶 Song: "${query}"\n\nDownload ක්රමය තෝරන්න (Reply Number):\n\n` +
        `1️⃣ *Direct Whatsapp File (Auto-Delete)* 🗑️\n` +
        `2️⃣ *Google Drive Link (Save Data)* ☁️\n\n` +
        `_Reply 1 or 2_`;

      // 🔥 CRASH GUARD: පින්තූරේ අවුල් ගියොත් Text එක යවනවා
      try {
        return await conn.sendMessage(from, {
          // Imgur Link එකක් දැම්මා (මේක ටිකක් ශේප්)
          image: { url: "https://i.imgur.com/LyH8M8y.jpeg" },
          caption: songMenu
        }, { quoted: mek });
      } catch (imgErr) {
        console.log("⚠️ Image Failed, Sending Text Only...");
        return await conn.sendMessage(from, { text: songMenu }, { quoted: mek });
      }
    }

    // 🅱️ SCENARIO B: VIDEO (Quality Poll) 🎥
    global.pendingSessions[sender] = { url: query, time: Date.now() };

    const videoMenu = `👑 *DMC VIDEO SELECTOR* 👑\n\n🔎 Query: "${query}"\n\nVideo Quality එක තෝරන්න (Reply Number):\n\n` +
      `1️⃣ *High Quality (HD)*\n` +
      `2️⃣ *Medium (360p)*\n` +
      `3️⃣ *Low Quality (Data Saver)*\n\n` +
      `_Reply 1, 2, or 3_`;

    try {
      return await conn.sendMessage(from, {
        image: { url: "https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png" },
        caption: videoMenu
      }, { quoted: mek });
    } catch (e) {
      return await conn.sendMessage(from, { text: videoMenu }, { quoted: mek });
    }

  } catch (e) {
    console.log(e);
    reply(`❌ System Error: ${e.message}`);
  }
});
