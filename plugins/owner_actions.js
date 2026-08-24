// owner_actions.js (FAST PACK v1)  :contentReference[oaicite:0]{index=0}
// 1st speed-up method: early-exit + cooldown + per-user lock + safe cleanup
// Big-bot 2026 methods: safer mimetype checks, temp-file cleanup, admin/owner logic hardening
// 🔴 CANNOT: anti-ban exploits, bypass WhatsApp permissions, delete chat history server-side

const { cmd } = require('../command');
const fs = require('fs');

// --------------------
// Lock + Cooldown
// --------------------
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
function safeUnlink(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}

// 1) BLOCK / UNBLOCK
cmd({
  pattern: "block",
  desc: "Block a user",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { from, quoted, reply, isOwner }) => {
  const id = keyId(mek, from);
  if (!isOwner) return reply("❌ Owner only.");
  if (!quoted?.sender) return reply("❌ Reply to a user.");
  if (onCooldown(id)) return;

  if (locks.has(id)) return reply("⏳ Already processing...");
  locks.add(id);
  try {
    await conn.updateBlockStatus(quoted.sender, "block");
    reply("🚫 *User Blocked!*");
  } catch {
    reply("❌ Error blocking user.");
  } finally {
    locks.delete(id);
  }
});

cmd({
  pattern: "unblock",
  desc: "Unblock a user",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { from, quoted, reply, isOwner }) => {
  const id = keyId(mek, from);
  if (!isOwner) return reply("❌ Owner only.");
  if (!quoted?.sender) return reply("❌ Reply to a user.");
  if (onCooldown(id)) return;

  if (locks.has(id)) return reply("⏳ Already processing...");
  locks.add(id);
  try {
    await conn.updateBlockStatus(quoted.sender, "unblock");
    reply("✅ *User Unblocked!*");
  } catch {
    reply("❌ Error unblocking user.");
  } finally {
    locks.delete(id);
  }
});

// 2) SET PROFILE PICTURE (PP)
cmd({
  pattern: "setpp",
  alias: ["pp"],
  desc: "Set bot profile picture",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { from, quoted, reply, isOwner }) => {
  const id = keyId(mek, from);
  if (!isOwner) return reply("❌ Owner only.");
  if (!quoted?.msg?.mimetype || !quoted.msg.mimetype.includes("image")) return reply("❌ Reply to an image.");
  if (onCooldown(id)) return;

  if (locks.has(id)) return reply("⏳ Already processing...");
  locks.add(id);

  let mediaPath;
  try {
    reply("🔄 *Updating Profile Picture...*");
    mediaPath = await conn.downloadAndSaveMediaMessage(quoted);

    await conn.updateProfilePicture(conn.user.id, { url: mediaPath });
    reply("✅ *Profile Picture Updated!*");
  } catch {
    reply("❌ Error updating profile picture.");
  } finally {
    safeUnlink(mediaPath);
    locks.delete(id);
  }
});

// 3) LEAVE (group)
cmd({
  pattern: "leave",
  desc: "Make bot leave the group",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { from, reply, isOwner, isGroup }) => {
  const id = keyId(mek, from);
  if (!isOwner) return reply("❌ Owner only.");
  if (!isGroup) return reply("❌ Group only.");
  if (onCooldown(id)) return;

  if (locks.has(id)) return reply("⏳ Already processing...");
  locks.add(id);
  try {
    await reply("👋 *Goodbye!*");
    await conn.groupLeave(from);
  } catch {
    reply("❌ Error leaving group.");
  } finally {
    locks.delete(id);
  }
});

// 4) DELETE MESSAGE
cmd({
  pattern: "del",
  alias: ["delete"],
  desc: "Delete a message",
  category: "group",
  filename: __filename
}, async (conn, mek, m, { from, quoted, reply, isAdmins, isOwner, isBotAdmins }) => {
  try {
    if (!quoted?.key) return reply("❌ Reply to a message.");
    if (!isBotAdmins) return reply("❌ Bot needs Admin to delete messages.");
    if (!(isAdmins || isOwner)) return reply("❌ Only Admins/Owner can delete messages.");

    await conn.sendMessage(from, { delete: quoted.key });
  } catch {
    reply("❌ Error deleting.");
  }
});

// 🔴 CANNOT (highlight): anti-ban exploits, permission bypass, server-side history wipe.
