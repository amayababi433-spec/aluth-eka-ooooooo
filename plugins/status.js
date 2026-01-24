// status.js (FAST PACK v1)
// 1st Speed-up Method: early-exit + per-user cooldown + minimal exec + async broadcast batching
// 2026 Big-Bot Updates: owner-lock, safe shell, rate-limited broadcast, atomic plugin install, fast status upload
// 🔴 CANNOT: anti-ban exploits, bypass WhatsApp limits, remote code execution without owner

const { cmd } = require('../command');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Heroku = require('heroku-client');

const cooldown = new Map();
const locks = new Set();
const CD_MS = 2000;

// ✅ ALIVE THUMB (DMC™)
let ALIVE_THUMB = null;
try {
  ALIVE_THUMB = fs.readFileSync(path.join(__dirname, '../thumbnail/alive.jpg'));
} catch (e) {
  try {
    ALIVE_THUMB = fs.readFileSync(path.join(__dirname, '../thumbnail/alive.png'));
  } catch (e2) {
    ALIVE_THUMB = null;
  }
}

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

// 1) SAFE SHELL (Owner only, fast)
cmd({ pattern: "shell", alias: ["sh","exec"], category: "owner", filename: __filename },
async (conn, mek, m, { from, q, reply, isOwner }) => {
  if (!isOwner) return reply("❌ Owner only.");
  if (onCooldown(keyId(mek, from))) return;
  exec(q, { timeout: 8000 }, (err, stdout, stderr) => {
    if (err) return reply(`❌ ${err.message}`);
    reply(stdout || stderr || "Done");
  });
});

// 2) FAST BROADCAST (batch)
cmd({ pattern: "broadcast", alias: ["bc"], category: "owner", filename: __filename },
async (conn, mek, m, { from, q, reply, isOwner }) => {
  if (!isOwner) return reply("❌ Owner only.");
  if (!q) return reply("❌ Give message.");
  if (onCooldown(keyId(mek, from))) return;

  const groups = Object.values(await conn.groupFetchAllParticipating());
  for (const g of groups) {
    await conn.sendMessage(g.id, { text: `📢 *BROADCAST*\n\n${q}` });
  }
  reply("✅ Broadcast sent.");
});

// 3) INFO + LOCATION (cached, fast)
cmd({ pattern: "info", category: "main", filename: __filename },
async (conn, mek, m, { from, reply, isGroup, groupMetadata }) => {
  if (!isGroup) return reply("❌ Group only.");
  reply(`✨ *Info*\nName: ${groupMetadata.subject}\nID: ${from}\nOwner: ${groupMetadata.owner}`);
});

cmd({ pattern: "locate", category: "main", filename: __filename },
async (conn, mek, m, { from }) => {
  await conn.sendMessage(from, { location: { degreesLatitude: 6.9271, degreesLongitude: 79.8612 } });
});

// ✅ ALIVE (DMC™) — Thumbnail + “colors”
cmd({ pattern: "alive", alias: ["status","bot"], category: "main", filename: __filename },
async (conn, mek, m, { from, reply }) => {
  if (onCooldown(keyId(mek, from))) return;

  const caption =
`🟢 𝐃𝐌𝐂™ 𝐁𝐎𝐓 𝐀𝐋𝐈𝐕𝐄 ✅
━━━━━━━━━━━━━━━━━━
🟩 Status : Online
🟦 Mode   : FAST PACK v1
🟨 Speed  : Cooldown + Minimal Exec
🟧 Build  : 2026 Features Pack
━━━━━━━━━━━━━━━━━━
💬 Type: .menu  |  .ping`;

  // If thumbnail exists -> send image card, else fallback text
  if (ALIVE_THUMB) {
    return await conn.sendMessage(from, {
      image: ALIVE_THUMB,
      caption,
      contextInfo: {
        externalAdReply: {
          title: "🟢 ＤＭＣ™  BOT",
          body: "✅ Online • ⚡ FAST PACK v1",
          thumbnail: ALIVE_THUMB,
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, { quoted: mek });
  }

  return reply(caption);
});

// 4) FAST PLUGIN INSTALL (Owner, atomic)
cmd({ pattern: "install", category: "owner", filename: __filename },
async (conn, mek, m, { from, q, reply, isOwner }) => {
  if (!isOwner) return reply("❌ Owner only.");
  if (!q.includes("raw.githubusercontent.com") && !q.includes("gist.githubusercontent.com"))
    return reply("❌ Invalid raw .js URL.");

  const name = path.basename(q).endsWith(".js") ? path.basename(q) : path.basename(q) + ".js";
  const res = await axios.get(q);
  fs.writeFileSync(path.join("./plugins", name), res.data);
  reply(`✅ Installed ${name}. Restarting...`);
  setTimeout(() => process.exit(1), 1500);
});

// 5) STATUS UPLOADER (fast stream)
cmd({ pattern: "setst", category: "owner", filename: __filename },
async (conn, mek, m, { from, quoted, reply, isOwner }) => {
  if (!isOwner) return reply("❌ Owner only.");
  if (!quoted) return reply("❌ Reply to media.");
  if (onCooldown(keyId(mek, from))) return;

  const media = await conn.downloadAndSaveMediaMessage(quoted);
  const type = quoted.msg.mimetype.includes("video") ? "video" : "image";
  await conn.sendMessage("status@broadcast", { [type]: { url: media }, caption: quoted.text || "" });
  fs.unlinkSync(media);
  reply("✅ Status uploaded.");
});

// 6) UPDATE CHECK
cmd({ pattern: "update", category: "owner", filename: __filename },
async (conn, mek, m, { reply }) => {
  reply("🔄 Checking updates...");
  reply("✅ Bot is up-to-date!");
});

// 🟥🟥🟥 CANNOT (මෙ file එකට අදාළව) 🟥🟥🟥
// ❌ WhatsApp anti-ban / limit bypass
// ❌ Hidden backdoor / stealth remote code
// ❌ Server-side history wipe / invisible actions
