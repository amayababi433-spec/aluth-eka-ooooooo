// system-info.js (FAST PACK v1)  :contentReference[oaicite:0]{index=0}
// 1st speed-up method: less messages + no extra awaits + edit message instead of 2 sends
// Big-bot 2026 methods: cooldown + per-user lock + safe defaults + faster uptime calc
// 🔴 CANNOT: anti-ban tricks, WhatsApp speed spoofing, device spoofing

const { cmd } = require('../command');
const os = require("os");
const config = require("../settings/config");

// --------------------
// Cooldown + Lock
// --------------------
const locks = new Set();
const cooldown = new Map();
const CD_MS = 1500;

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
function fmtUptime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const days = Math.floor(sec / 86400);
  sec %= 86400;
  const hours = Math.floor(sec / 3600);
  sec %= 3600;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// ============================
// 1) ALIVE (FAST)
// ============================
cmd({
  pattern: "alive",
  desc: "Check bot status",
  category: "main",
  filename: __filename
}, async (conn, mek, m, { from, reply }) => {
  const id = keyId(mek, from);
  if (onCooldown(id)) return;
  if (locks.has(id)) return;
  locks.add(id);

  try {
    // 1 message only (image+caption) + optional react
    try { await conn.sendMessage(from, { react: { text: "👑", key: mek.key } }); } catch {}

    const usedMemory = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
    const totalMemory = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);

    const aliveMsg =
`✨ *SYSTEM ONLINE* ✨

╔═══════════════════
║ 👑 *User:* ${m.pushName || "User"}
║ ⏳ *Uptime:* ${fmtUptime(process.uptime())}
║ 💾 *Ram:* ${usedMemory}MB / ${totalMemory}GB
║ 💻 *Host:* ${os.hostname()}
╚═══════════════════

> 👸 Powerfull Queen Sew Bot`;

    await conn.sendMessage(from, {
      image: { url: config.thumbUrl || "https://telegra.ph/file/397000a07a1deb7fad9c2.jpg" },
      caption: aliveMsg
    }, { quoted: mek });

  } catch (e) {
    reply("Alive Error: " + e.message);
  } finally {
    locks.delete(id);
  }
});

// ============================
// 2) PING (FAST) - edit one message
// ============================
cmd({
  pattern: "ping",
  desc: "Check bot speed",
  category: "main",
  filename: __filename
}, async (conn, mek, m, { from, reply }) => {
  const id = keyId(mek, from);
  if (onCooldown(id)) return;

  try {
    const start = Date.now();
    const msg = await conn.sendMessage(from, { text: "🏓 Testing..." }, { quoted: mek });
    const end = Date.now();

    // edit instead of sending a new message (less load)
    await conn.sendMessage(from, { text: `☁️ *Pong:* ${end - start}ms`, edit: msg.key });

  } catch (e) {
    reply("Ping Error: " + e.message);
  }
});

// 🔴 CANNOT (highlight): WhatsApp speed spoofing / anti-ban / device spoofing.
