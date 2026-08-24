// novels.js (FAST PACK v1)  :contentReference[oaicite:0]{index=0}
// 1st speed-up method: single axios client + keep-alive + timeout + reuse cover URLs
// Big-bot 2026 methods: cooldown + per-user lock + cache-ready structure + minimal ops
// 🔴 CANNOT (highlight): stealing paid novels, bypassing copyright/paywalls, private content scraping

const { cmd } = require('../command');
const axios = require('axios');
const https = require('https');

// --------------------
// 1) SPEED-UP METHOD #1: single client + keep-alive
// --------------------
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const http = axios.create({
  timeout: 12000,
  httpsAgent,
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*' },
  maxRedirects: 2
});

// --------------------
// Big-bot: cooldown + lock
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

// --------------------
// Covers (reused)
// --------------------
const COVER_MEENA = "https://i.ibb.co/hWMT88G/IMG-20210709-160347.png";
const COVER_HAMU  = "https://i.ibb.co/16Xvtnr/IMG-20210719-WA0473.jpg";

// --------------------
// Episodes (2026 big-bot method: central store)
// Paste your full texts here (01..10)
// --------------------
const MEENA = {
  1: `*මීන නුවන් 01*\n🧎🏻‍♀️❤️🧎\n\n"චූටී😲😲😲.....ඒයි මේ....තමුසෙ අද ක්ලාස් යන්නෙ නැද්ද ඕයි?......\n\n(මෙතනට ඔයාගේ දිග කතාවේ කොටස Paste කරන්න)...\n\nWrote By Sewwandi`,
  // 2: `*මීන නුවන් 02* ...`,
  // ...
  // 10: `*මීන නුවන් 10* ...`,
};

const HAMUWEMU = `කෙටිකතාවකි.....\n\nහමුවෙමු මතු භවයේ❤️❤️❤️❤️❤️❤️❤️\n\n(මෙතනට ඔයාගේ දිග කතාවේ කොටස Paste කරන්න)...\n\n✍️Asanjana sumangi`;

// =====================
// 1) MENU
// =====================
cmd({
  pattern: "novel",
  desc: "Show available novels",
  category: "fun",
  filename: __filename
}, async (conn, mek, m, { from }) => {
  const id = keyId(mek, from);
  if (onCooldown(id)) return;

  const msg =
    `👑 *NOVELS & STORIES* 👑\n\n` +
    `*1. 😍 මීන නුවන් 😍*\n` +
    `_(අසීමාන්තික ආදරයේ උත්තරීතර ආමන්ත්‍රණය)_\n` +
    `Commands:\n` +
    `.1meena, .2meena, .3meena ... to .10meena\n\n` +
    `*2. 😍 හමුවෙමු මතු බවයේ 😍*\n` +
    `(කෙටිකතාවකි)\n` +
    `Command: .hamuwemu\n\n` +
    `📚 *Read and Enjoy!*`;

  await conn.sendMessage(from, { image: { url: COVER_MEENA }, caption: msg }, { quoted: mek });
});

// =====================
// 2) MEENA EPISODES (1..10)
// =====================
function makeMeenaCmd(n) {
  cmd({
    pattern: `${n}meena`,
    desc: `Meena Nuwan Episode ${n}`,
    category: "fun",
    filename: __filename
  }, async (conn, mek, m, { from, reply }) => {
    const id = keyId(mek, from);
    if (onCooldown(id)) return;
    if (locks.has(id)) return;
    locks.add(id);

    try {
      const text = MEENA[n];
      if (!text) return reply(`❌ Episode ${n} text දාලා නෑ. (MEENA[${n}] තුල paste කරන්න)`);

      await conn.sendMessage(from, { image: { url: COVER_MEENA }, caption: text }, { quoted: mek });
    } finally {
      locks.delete(id);
    }
  });
}

for (let i = 1; i <= 10; i++) makeMeenaCmd(i);

// =====================
// 3) HAMUWEMU
// =====================
cmd({
  pattern: "hamuwemu",
  desc: "Short Story",
  category: "fun",
  filename: __filename
}, async (conn, mek, m, { from }) => {
  const id = keyId(mek, from);
  if (onCooldown(id)) return;

  await conn.sendMessage(from, { image: { url: COVER_HAMU }, caption: HAMUWEMU }, { quoted: mek });
});

// 🔴 CANNOT (highlight): bypassing paywalls/copyright, stealing paid novels, private content scraping.
