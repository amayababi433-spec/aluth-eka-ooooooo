const { cmd } = require('../command');
const axios = require('axios');
const https = require('https');

// ===========================================
//  ENGINE: FAST HTTP & CACHING
// ===========================================

// 1. High-Performance Network Agent
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

const http = axios.create({
    timeout: 8000, // 8 Seconds Timeout
    httpsAgent,
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    maxRedirects: 2
});

// 2. Caching System (API බර අඩු කිරීමට)
const cache = new Map();
const TTL = 45 * 1000; // තත්පර 45ක Cache එකක්

function cacheGet(key) {
    const v = cache.get(key);
    if (!v) return null;
    if (Date.now() > v.exp) { cache.delete(key); return null; }
    return v.text;
}

function cacheSet(key, text) {
    cache.set(key, { exp: Date.now() + TTL, text });
}

// 3. Anti-Spam Cooldown
const cooldown = new Map();
const CD_MS = 2000;

function onCooldown(id) {
    const last = cooldown.get(id) || 0;
    if (Date.now() - last < CD_MS) return true;
    cooldown.set(id, Date.now());
    return false;
}

function idKey(mek, from) {
    return mek?.key?.participant || mek?.key?.remoteJid || from;
}

// ===========================================
// 1. JOKE COMMAND
// ===========================================
cmd({
    pattern: "joke",
    desc: "Get a random joke",
    category: "fun",
    filename: __filename
}, async (conn, mek, m, { from, reply }) => {
    const kid = idKey(mek, from);
    if (onCooldown(kid)) return; // Spam වැළැක්වීම

    // Cache Check
    const ckey = `joke:${from}`;
    const cached = cacheGet(ckey);
    if (cached) return reply(cached);

    try {
        const res = await http.get('https://official-joke-api.appspot.com/random_joke');
        const joke = res.data;

        const msg = `😂 *JOKE OF THE DAY* 😂\n\n` +
                    `🗣️ *Setup:* ${joke.setup}\n` +
                    `😆 *Punchline:* ${joke.punchline}`;

        cacheSet(ckey, msg); // Save to Cache
        return reply(msg);

    } catch (e) {
        reply("❌ Error fetching joke. Try again.");
    }
});

// ===========================================
// 2. QUOTE COMMAND
// ===========================================
cmd({
    pattern: "quote",
    desc: "Get a random motivational quote",
    category: "fun",
    filename: __filename
}, async (conn, mek, m, { from, reply }) => {
    const kid = idKey(mek, from);
    if (onCooldown(kid)) return;

    // Cache Check
    const ckey = `quote:${from}`;
    const cached = cacheGet(ckey);
    if (cached) return reply(cached);

    try {
        const res = await http.get('https://api.quotable.io/random');
        const quote = res.data;

        const msg = `💡 *QUOTE OF THE DAY* 💡\n\n` +
                    `_"${quote.content}"_\n\n` +
                    `✒️ *- ${quote.author}*`;

        cacheSet(ckey, msg); // Save to Cache
        return reply(msg);

    } catch (e) {
        reply("❌ Error fetching quote.");
    }
});