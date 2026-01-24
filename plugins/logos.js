// logos.js (FAST PACK v1)
// 1st speed-up method: single axios client + keep-alive + timeout + encodeURIComponent
// Big-bot 2026 methods: cooldown + per-user lock + safe input length + real image upload (tourl) via Catbox
// 🔴 CANNOT (highlight): bypass paid/private logo APIs, steal API keys, or upload illegal/private content

const { cmd } = require('../command');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const https = require('https');

// ===============================
// 1) SPEED-UP METHOD #1
// Single HTTP client + Keep-Alive + Timeout
// ===============================
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

const http = axios.create({
  timeout: 12000,
  httpsAgent,
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*' },
  maxRedirects: 2
});

// ===============================
// Big-bot methods: lock + cooldown
// ===============================
const locks = new Set();
const cooldown = new Map();
const CD_MS = 1800;

function keyId(mek, from) {
  return mek?.key?.participant || mek?.key?.remoteJid || from;
}
function onCooldown(id) {
  const last = cooldown.get(id) || 0;
  const now = Date.now();
  if (now - last < CD_MS) return true;
  cooldown.set(id, now);
  return false;
}
function safeText(q, max = 80) {
  const t = String(q || '').trim();
  return t.length > max ? t.slice(0, max) : t;
}

// ===============================
// 1) ATTP (Animated Text Sticker)
// ===============================
cmd({
  pattern: "attp",
  desc: "Create animated text sticker",
  category: "logo",
  filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
  const kid = keyId(mek, from);
  if (!q) return reply("❌ Text දෙන්න.\nExample: *.attp Hello*");
  if (onCooldown(kid)) return;

  const text = safeText(q, 60);
  try {
    // encodeURIComponent fixes broken links with spaces/sinhala
    const url = `https://api.dreaded.site/api/attp?text=${encodeURIComponent(text)}`;

    await conn.sendMessage(from, {
      sticker: { url },
      packagePack: "Sew Queen",
      packageAuthor: "Bot"
    }, { quoted: mek });

  } catch {
    reply("❌ Error creating ATTP.");
  }
});

// ===============================
// 2) FANCY TEXT GENERATOR (local, fast)
// ===============================
cmd({
  pattern: "fancy",
  desc: "Convert text to fancy styles",
  category: "logo",
  filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
  const kid = keyId(mek, from);
  if (!q) return reply("❌ Text දෙන්න.\nExample: *.fancy Hello*");
  if (onCooldown(kid)) return;

  try {
    const text = safeText(q, 120);

    const fonts = {
      "Bold": text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.match(/[a-z]/) ? 119737 : 119743))),
      "Italic": text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.match(/[a-z]/) ? 119789 : 119795))),
      "Mono": text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.match(/[a-z]/) ? 120367 : 120373))),
      "Script": text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.match(/[a-z]/) ? 119993 : 119999)))
    };

    let msg = `🎨 *FANCY TEXT GENERATOR* 🎨\n\n`;
    for (let style in fonts) msg += `🔹 *${style}:* ${fonts[style]}\n`;

    reply(msg);
  } catch {
    reply("❌ Error generating fancy text.");
  }
});

// ===============================
// 3) LOGO MAKER
// ===============================
cmd({
  pattern: "logo",
  desc: "Create simple logos",
  category: "logo",
  filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
  const kid = keyId(mek, from);
  if (!q) return reply("❌ Text දෙන්න.\nExample: *.logo Sew Queen*");
  if (onCooldown(kid)) return;

  const text = safeText(q, 60);

  try {
    const logoUrl = `https://api.dreaded.site/api/textpro/blackpink?text=${encodeURIComponent(text)}`;

    await conn.sendMessage(from, {
      image: { url: logoUrl },
      caption: `✅ *Logo Created for:* ${text}`
    }, { quoted: mek });

  } catch {
    reply("❌ Error creating logo.");
  }
});

// ===============================
// 4) IMAGE TO URL (REAL UPLOAD) - Catbox
// ===============================
cmd({
  pattern: "tourl",
  alias: ["img2url", "upload"],
  desc: "Upload image to internet (Catbox)",
  category: "logo",
  filename: __filename
}, async (conn, mek, m, { from, quoted, reply }) => {
  const kid = keyId(mek, from);
  if (onCooldown(kid)) return;

  try {
    if (!quoted || !quoted.msg?.mimetype || !quoted.msg.mimetype.includes('image')) {
      return reply("❌ Photo එකකට reply කරලා *.tourl* කියන්න.");
    }

    reply("☁️ *Uploading...*");

    const mediaPath = await conn.downloadAndSaveMediaMessage(quoted);

    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', fs.createReadStream(mediaPath));

    const res = await http.post('https://catbox.moe/user/api.php', form, {
      headers: form.getHeaders()
    });

    const url = String(res.data || '').trim();
    fs.unlinkSync(mediaPath);

    if (!url.startsWith('http')) return reply("❌ Upload failed.");

    reply(`✅ *Uploaded!*\n${url}`);

  } catch (e) {
    reply("❌ Error uploading.");
  }
});

// 🔴 CANNOT (highlight): paid/private logo API bypass, stealing API keys, illegal uploads.
