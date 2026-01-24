// menu.js (FAST PACK v1 - 2026 UPDATED)
const { cmd, commands } = require('../command');
const os = require('os');
const config = require('../config');
const fs = require('fs');
const path = require('path');

// 1) CATEGORY EMOJIS & SETTINGS
const EMOJIS = {
  downloader: "⬇️",
  ai: "🤖",
  main: "ℹ️",
  group: "👥",
  owner: "👑",
  fun: "😂",
  logo: "🎨",
  editor: "🎬",
  converter: "🔄",
  search: "🔍",
  sticker: "🏷️",
  other: "👻"
};

function sanitizeCmdName(x) {
  return String(x || '').replace(/[^a-zA-Z0-9]/g, '').trim();
}

function fmtUptime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const d = Math.floor(sec / 86400); sec %= 86400;
  const h = Math.floor(sec / 3600); sec %= 3600;
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

// 2) DYNAMIC MENU CACHE (Updates when plugins load)
function buildMenuCache() {
  const map = new Map();
  for (const c of (commands || [])) {
    const rawName = c?.pattern || c?.command || c?.name;
    const name = sanitizeCmdName(rawName);
    if (!name) continue;

    let category = (c?.category || "other").toLowerCase();
    if (category === "conventer") category = "converter";
    if (category === "stickers") category = "sticker";
    if (!map.has(category)) map.set(category, new Set());
    map.get(category).add(name);
  }
  const categories = Array.from(map.keys()).sort();
  return { map, categories };
}

// 3) MENU COMMAND
cmd({
  pattern: "menu",
  alias: ["help", "list", "panel"],
  desc: "Get the bot professional menu list",
  category: "main",
  filename: __filename
}, async (conn, mek, m, { from, pushname, reply }) => {
  try {
    const BOT_NAME = '👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑';
    // Re-build cache to include new sticker/crop plugins
    let MENU_CACHE = buildMenuCache();

    const uptime = fmtUptime(process.uptime());
    const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const totalRam = (os.totalmem() / 1024 / 1024).toFixed(2);

    let menuMsg =
      `${BOT_NAME}\n\n` +
      `👋 *Hello ${pushname || "User"}*\n\n` +
      `🤖 *Bot Name:* ${BOT_NAME}\n` +
      `👤 *Owner:* ＤＭＣ™ＫＩＮＧ✓\n` +
      `🚀 *Uptime:* ${uptime}\n` +
      `💾 *Ram:* ${ramUsage}MB / ${totalRam}MB\n\n` +
      `──────────────────────\n\n`;

    // Category Loop
    for (const category of MENU_CACHE.categories) {
      const set = MENU_CACHE.map.get(category);
      if (!set || set.size === 0) continue;

      const list = Array.from(set).sort();
      menuMsg += `*${EMOJIS[category] || "🔹"} ${category.toUpperCase()} COMMANDS*\n`;

      for (const name of list) {
        menuMsg += `│ ∘ .${name}\n`;
      }
      menuMsg += `└──────────────\n\n`;
    }

    menuMsg += `${BOT_NAME}`;

    // Local Thumbnail handling
    let MENU_THUMB = null;
    try {
      MENU_THUMB = fs.readFileSync(path.join(__dirname, '../thumbnail/menu.jpg'));
    } catch (e) {
      try { MENU_THUMB = fs.readFileSync(path.join(__dirname, '../thumbnail/menu.png')); } catch (e2) { }
    }

    if (MENU_THUMB) {
      return await conn.sendMessage(from, { image: MENU_THUMB, caption: menuMsg }, { quoted: mek });
    }

    const imgUrl = config.ALIVE_IMG || "https://telegra.ph/file/ba516a.jpg";
    await conn.sendMessage(from, { image: { url: imgUrl }, caption: menuMsg }, { quoted: mek });

  } catch (e) {
    console.log(e);
    reply("❌ Error loading menu.");
  }
});
