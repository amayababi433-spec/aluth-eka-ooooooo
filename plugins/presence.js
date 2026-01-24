// presence.js (FAST PACK v1)  :contentReference[oaicite:0]{index=0}
// 1st speed-up method: early-exit + per-chat lock + minimal presence loop
// Big-bot 2026 methods: safe interval handling, cooldown, auto-timeout, no spam updates
// 🔴 CANNOT: hide/evade WhatsApp detection, anti-ban tricks, spoof real device signals

const { cmd } = require('../command');

const activeIntervals = {};
const activeTimeouts = {};
const locks = new Set();
const cooldown = new Map();

const CD_MS = 1500;
const LOOP_MS = 15000;         // less spam than 10s (more stable)
const AUTO_STOP_MS = 5 * 60 * 1000; // auto stop after 5 minutes

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
function clearChatTimers(chat) {
  try {
    if (activeIntervals[chat]) { clearInterval(activeIntervals[chat]); delete activeIntervals[chat]; }
    if (activeTimeouts[chat]) { clearTimeout(activeTimeouts[chat]); delete activeTimeouts[chat]; }
  } catch {}
}

cmd({
  pattern: "scam",
  alias: ["presence"],
  desc: "Set fake presence (typing, recording, online)",
  category: "fun",
  filename: __filename
},
async (conn, mek, m, { from, q, reply, isOwner }) => {
  const id = keyId(mek, from);

  try {
    if (!isOwner) return reply("❌ Owner only!");
    if (!q) return reply("❌ Use:\n.scam typing\n.scam recording\n.scam online\n.scam stop");
    if (onCooldown(id)) return;

    if (locks.has(from)) return reply("⏳ Already processing...");
    locks.add(from);

    const type = q.toLowerCase().trim();

    // reset old timers
    clearChatTimers(from);

    // STOP
    if (type === 'stop' || type === 'off') {
      await conn.sendPresenceUpdate('paused', from);
      locks.delete(from);
      return reply("🛑 *Fake Presence Stopped!*");
    }

    let presenceStatus;
    let msg;

    if (type === 'typing') {
      presenceStatus = 'composing';
      msg = "✍️ *Fake Typing Started...*";
    } else if (type === 'recording') {
      presenceStatus = 'recording';
      msg = "🎤 *Fake Recording Started...*";
    } else if (type === 'online') {
      presenceStatus = 'available';
      msg = "🟢 *Fake Online Started...*";
    } else {
      locks.delete(from);
      return reply("❌ Wrong usage!\n\nTry:\n.scam typing\n.scam recording\n.scam online\n.scam stop");
    }

    await conn.sendMessage(from, { text: msg }, { quoted: mek });

    // first update
    await conn.sendPresenceUpdate(presenceStatus, from);

    // loop (less frequent => more stable)
    activeIntervals[from] = setInterval(async () => {
      try { await conn.sendPresenceUpdate(presenceStatus, from); } catch {}
    }, LOOP_MS);

    // auto stop
    activeTimeouts[from] = setTimeout(async () => {
      clearChatTimers(from);
      try { await conn.sendPresenceUpdate('paused', from); } catch {}
    }, AUTO_STOP_MS);

    locks.delete(from);

  } catch (e) {
    locks.delete(from);
    console.log(e);
    reply("❌ Error setting presence.");
  }
});

// 🔴 CANNOT (highlight): anti-ban/evade detection tricks, spoofing real device signals, stealth presence hacks.
