// video-filters.js (FAST PACK v1)  :contentReference[oaicite:0]{index=0}
// 1st Speed-up method: spawn ffmpeg + stream send (no fs.readFileSync) + per-user lock + cooldown + early-exit
// Big-bot 2026 methods: safe args (no shell injection), cleanup, minimal messages
// 🔴 CANNOT: WhatsApp size-limit bypass / anti-ban tricks / device spoofing

const { cmd } = require('../command');
const { getRandom } = require('../lib/functions');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// --------------------
// Locks + Cooldown
// --------------------
const locks = new Set();
const cooldown = new Map();
const CD_MS = 2000;

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
function safeUnlink(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y', ...args]);
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg_failed'))));
  });
}

cmd({
  pattern: "tblend",
  alias: ["filter"],
  desc: "Apply blend filters to video (FAST MODE)",
  category: "editor",
  filename: __filename
},
async (conn, mek, m, { from, q, quoted, reply }) => {
  const id = keyId(mek, from);

  try {
    // Filter list (same as your file)  :contentReference[oaicite:1]{index=1}
    const modes = ['dodge', 'or', 'multiply', 'grainmerge', 'and', 'burn', 'difference', 'grainextract', 'divide', 'xor', 'hardmix', 'negation'];

    // EARLY EXIT (speed)
    if (!quoted || !quoted.msg?.mimetype || !quoted.msg.mimetype.includes("video")) {
      return reply("❌ Please reply to a Video.");
    }
    if (!q || !modes.includes(q)) {
      return reply(`❌ Please give me a valid mode name.\n\n*Example:* *.tblend burn*\n\n${modes.join(', ')}`);
    }
    if (onCooldown(id)) return reply("⏳ Wait a bit...");
    if (locks.has(id)) return reply("⏳ Already processing...");

    locks.add(id);
    reply(`🖌️ *Applying '${q}' Filter...*`);

    const media = await conn.downloadAndSaveMediaMessage(quoted);
    const output = getRandom(".mp4");

    // SAFE: no exec string, use spawn args
    await runFfmpeg(['-i', media, '-vf', `tblend=all_mode=${q}`, output]);

    // STREAM SEND (no fs.readFileSync)
    await conn.sendMessage(from, {
      video: { url: path.resolve(output) },
      caption: `✅ *Applied Filter: ${q}*`
    }, { quoted: mek });

    safeUnlink(media);
    safeUnlink(output);
    locks.delete(id);

  } catch (e) {
    console.log(e);
    reply("❌ Error applying filter.");
    locks.delete(id);
  }
});

// 🔴 CANNOT (highlight): WhatsApp size-limit bypass / anti-ban tricks / device spoofing.
