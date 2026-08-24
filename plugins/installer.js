// installer.js (FAST PACK v1)
// 1st speed-up method: axios keep-alive + timeout + early-exit
// Big-bot methods (2026): safer URL validation, size limit, atomic write, correct paths, clean remove/list
// 🔴 CANNOT: auto-install from random URLs / bypass owner checks / stealth remote code execution

const { cmd } = require('../command');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PLUGIN_DIR = path.join(process.cwd(), 'plugins');
if (!fs.existsSync(PLUGIN_DIR)) fs.mkdirSync(PLUGIN_DIR, { recursive: true });

// 1) SPEED-UP METHOD #1: single axios client + keep-alive + timeout
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const http = axios.create({
  timeout: 12000,
  httpsAgent,
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/plain,*/*' },
  maxRedirects: 2
});

// Big-bot: limits
const MAX_PLUGIN_BYTES = 300 * 1024; // 300KB safety limit

function isRawGistUrl(u) {
  try {
    const url = new URL(u);
    // Accept only raw gist domains
    const hostOk = url.hostname === 'gist.githubusercontent.com' || url.hostname === 'raw.githubusercontent.com';
    return hostOk && url.pathname.endsWith('.js');
  } catch {
    return false;
  }
}

function safeNameFromUrl(u) {
  const base = u.split('/').pop() || 'plugin.js';
  const name = base.endsWith('.js') ? base : base + '.js';
  // remove weird chars
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

// 1. INSTALL PLUGIN
cmd({
  pattern: "install",
  desc: "Install external plugins via URL",
  category: "owner",
  filename: __filename
},
async (conn, mek, m, { from, q, reply, isOwner }) => {
  try {
    if (!isOwner) return reply("❌ Owner only!");
    if (!q || !isRawGistUrl(q)) return reply("❌ Valid Raw Gist/Raw GitHub .js URL දාන්න.");

    const name = safeNameFromUrl(q);
    const outPath = path.join(PLUGIN_DIR, name);

    reply("🔄 *Installing Plugin...*");

    const res = await http.get(q, { responseType: 'text' });
    const code = String(res.data || '');

    // Size limit safety
    if (Buffer.byteLength(code, 'utf8') > MAX_PLUGIN_BYTES) {
      return reply("❌ Plugin too large (limit 300KB).");
    }

    // Very basic sanity check
    if (!code.includes('cmd(') && !code.includes('module.exports')) {
      // still allow, but warn
      atomicWrite(outPath, code);
      reply(`✅ *Installed (no cmd/export found):* ${name}\nRestarting...`);
    } else {
      atomicWrite(outPath, code);
      reply(`✅ *Installed:* ${name}\nRestarting...`);
    }

    setTimeout(() => process.exit(1), 1500);

  } catch (e) {
    reply("❌ Error installing plugin.");
  }
});

// 2. PLUGIN LIST
cmd({
  pattern: "plugin",
  alias: ["mycmd"],
  desc: "List installed plugins",
  category: "owner",
  filename: __filename
},
async (conn, mek, m, { from, reply, isOwner }) => {
  try {
    if (!isOwner) return reply("❌ Owner only!");

    const files = fs.readdirSync(PLUGIN_DIR).filter(f => f.endsWith('.js'));
    if (!files.length) return reply("🔌 *INSTALLED PLUGINS* 🔌\n\n(Empty)");

    let msg = "🔌 *INSTALLED PLUGINS* 🔌\n\n";
    for (const f of files) msg += `▫️ ${f}\n`;
    reply(msg);

  } catch {
    reply("❌ Error reading plugins.");
  }
});

// 3. REMOVE PLUGIN
cmd({
  pattern: "remove",
  desc: "Delete a plugin",
  category: "owner",
  filename: __filename
},
async (conn, mek, m, { from, q, reply, isOwner }) => {
  try {
    if (!isOwner) return reply("❌ Owner only!");
    if (!q) return reply("❌ Plugin name දෙන්න.\nExample: *.remove test.js*");

    const name = q.endsWith('.js') ? q : q + '.js';
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(PLUGIN_DIR, safe);

    if (!fs.existsSync(filePath)) return reply("❌ Plugin not found.");

    fs.unlinkSync(filePath);
    reply(`🗑️ *Deleted:* ${safe}\nRestarting...`);
    setTimeout(() => process.exit(1), 1500);

  } catch {
    reply("❌ Error deleting plugin.");
  }
});

// 🔴 CANNOT (highlight): installing from arbitrary URLs, bypassing owner checks, stealth remote code execution.
