/**
 * 👑 DMC GOD MODE V53 (CRASH GUARD) 👑
 * LOGIC: Native YouTube Downloader (Bypassing external APIs)
 */

const { cmd } = require('../command');
const ytdl = require('@distube/ytdl-core');

const agent = ytdl.createAgent([
  { name: 'SAPISID', value: 'VaiZNESFQMimwDQk/AiRudrFXE7Rptdvrz', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: '__Secure-3PAPISID', value: 'VaiZNESFQMimwDQk/AiRudrFXE7Rptdvrz', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: 'AEC', value: 'Aaa9EJpJEH1k5ngA8Xw-2C9IXlXs6p_82Ac6-z_W1wtzif724SPkJ8oHqAA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: 'NID', value: 'CsMECAES9QMBOxGDSCuTfbH3Y-DFZFAyj4HHcRUk6wLYNecsapNkPsscOa_CHkviV3lF_GGbH52piaWOCJUzBgxWix7v_neO33pBivTx6TH9T8RyRKFlyTAOP-lAa12yk7Ldoi2-nguBXf9OxAsmj0GOz_zMNJHsJUqpE1gfV1HFFz9HeGGFjSI8938nCcJCb4_i1mlX7_US6dq-ceXPPBdSMhpwzIVHcwoFT-eJqku-mP00f05zvFj4izLAavUJ31vVCZbxc94qcSVNX6kE0B0eolXLVRxxY5duyeE8mQyFfwvJo_JOS-sYSV698sI9Du56tn2UVlO8nfhwSAf-1bwQkFtzHFwElNrP1pNLfWMqqERB1BLVEwyGOZkDJoVxwBUx2YKPYSCYnDcWOEKKRYB2oCZA85u4dVb5n6peWuYCJHYXBdAYi2eOGeX86e606KBcZrvzuRHgxPLjNU59nhqK4nC1Zdo3mUqg9KWjoLp1x8PedS0jJse0P_rQCnVf9wrtT4eAa1QoU0vmJLGisqJxlNnhuZn1MouR23jwLtFs-LSgBn_5QdOx0V26HXZQl7rB1VfbKSyjJWyylU9L65bZTyKcL6GEfY_oQE7vBxa9gM8LLj4-L2WQlrue0KlJNYSFdmbid1c85yyCQ7dW8IHvn6OiJ3xmYiphALEoATJFAdKsB8__R4ZnKX55qT1w3qAV7i8SICnqv7aRdea5QBEjULrks1ANmUQJS89epYH7vE1tt9wwF3RmUUwe5L9geYysGngL', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-1PSIDTS', value: 'sidts-CjcBkldj_9GvfgT-DFXNkfZxOFEBbAUKUpyF8DapdzgXfwDqrqJdEqr8tcGyrrokCyJCDDan9i-fEAA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: 'OTZ', value: '8815160_34_34__34_', domain: 'www.google.com', path: '/', secure: true, httpOnly: false },
  { name: '__Secure-1PAPISID', value: 'VaiZNESFQMimwDQk/AiRudrFXE7Rptdvrz', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: '__Secure-3PSID', value: 'g.a000DgmTCW3OfvEZ_tGJS1sp6Kj3QgH-X31xXDuSy4nErexIMCBqSJ-IgHWmSSTOY3bp0_nFhQACgYKAacSARYSFQHGX2Mi-om98aYxi7rqJCI9ShOyAhoVAUF8yKoWGv4VknH98TuzF8V6Lmpw0076', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-1PSID', value: 'g.a000DgmTCW3OfvEZ_tGJS1sp6Kj3QgH-X31xXDuSy4nErexIMCBqSWtCSXcB_YBaG0aeey53FAACgYKAcwSARYSFQHGX2MiqupROZSIKQg5qQZQJxQ_YBoVAUF8yKr0ZPOjiSc4vvgffnuEXf_30076', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-1PSIDCC', value: 'AKEyXzV_73qIpMAW_dLe8vMgucAau_weY9vl36LDPoXGf0sZBeSnkltuprccWztndffNXzWTjA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-1PSIDRTS', value: 'sidts-CjcBkldj_9GvfgT-DFXNkfZxOFEBbAUKUpyF8DapdzgXfwDqrqJdEqr8tcGyrrokCyJCDDan9i-fEAA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-3PSIDCC', value: 'AKEyXzU-xdlvC-yzkJP1h7PBlfZ7RwEwMAwP2QbepbPbvuluHFTe5NfcWGox5g1XVVILkvwxSQ', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-3PSIDRTS', value: 'sidts-CjcBkldj_9GvfgT-DFXNkfZxOFEBbAUKUpyF8DapdzgXfwDqrqJdEqr8tcGyrrokCyJCDDan9i-fEAA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-3PSIDTS', value: 'sidts-CjcBkldj_9GvfgT-DFXNkfZxOFEBbAUKUpyF8DapdzgXfwDqrqJdEqr8tcGyrrokCyJCDDan9i-fEAA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-ENID', value: 'Cs0CCAIS_wEBAQxeRezQb_uXquik410V8H3OOPCpghEDet7aeM9bAcZ-CwGrNT8qZcHgA_s4Qi5eT2KIbzNfGKhrDQsM7xvYWfmRNwQfyj27MX5DMqOibo_x4vIS-UpsnfzINcpN5wEQ6DmMioKrnWVNgUdVd-8xTCS7ewwRGIK_38u1Ifrlqhb6U3IzKqlm0-6P1FnQgZVupHz70nF6UoCZ6hdmT1I5URXwWD3ImPkkk7yk9z9e3bXfo49KkD8CM24wr2VnR0Fz-2gjgryTIQQ9LUe5z4bK7VxSMXAq5gk7QocAvCBfFVVwhFWUp_CspsxGlVExDMDyZaE6HqJyWAAppREGK70oAjJFAX1sxKo3NQzltdwgXGrwIfJxjuuac_t6CyclOGkn3E5KCV4iYBlQlbmhSEGaipz5tqZgK6i2JxgXmtahQ91bsX6CelUF', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-STRP', value: 'ABNhA6ikJExqix4bsXQaiacuoRbkye8FGl6XM6Bu8xZQfpU1JmB5v-vsV3MWZpPLNG6EEA0DrdVT7ajLpwbitngAEKu068bCk46r', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: 'SSID', value: 'AH-xIupHMQbOQr08M', domain: '.google.com', path: '/', secure: true, httpOnly: true }
]);

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
        // Extract video info using cookies
        const info = await ytdl.getInfo(query, { agent });
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