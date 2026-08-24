const { cmd } = require('../command');
const axios = require('axios');
const http = require('http');   // Brainshop is http://
const https = require('https'); // keep-alive for https

const { BOT_NAME, aiResponse } = require('../lib/ai_handler');

// =============================================================
//  AI ENGINE
//   - Primary: Multi-Model Gemini fallback (siputzx -> ryzendesu -> giftedtech)
//   - Backup: Brainshop
//  Branding must be visible in replies.
// =============================================================

// Brainshop fallback settings
// Brainshop fallback settings
// Use global config if available, otherwise fallback to known defaults
const bid = global.api?.brainshop?.bid || '161197';
const key = global.api?.brainshop?.key || '6SxlHBxznZRVydBQ';
const uid = global.api?.brainshop?.uid || 'SewQueen';

// Keep-alive network engine
const commonHeaders = {
  'User-Agent': 'Mozilla/5.0',
  'Accept': 'application/json,text/plain,*/*'
};

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

const httpClient = axios.create({
  timeout: 12000,
  headers: commonHeaders,
  httpAgent,
  httpsAgent,
  maxRedirects: 2,
  validateStatus: () => true,
});

// Cache (TTL 5 min)
const CACHE_TTL = 5 * 60 * 1000;
const replyCache = new Map();

function cacheGet(k) {
  const v = replyCache.get(k);
  if (!v) return null;
  if (Date.now() > v.exp) { replyCache.delete(k); return null; }
  return v.val;
}

function cacheSet(k, val) {
  replyCache.set(k, { exp: Date.now() + CACHE_TTL, val });
}

// Per-user throttle
const userThrottle = new Map();
const THROTTLE_MS = 1500;

function normalizeJid(jid) {
  if (!jid) return '';
  return jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
}

function canRun(jid) {
  const last = userThrottle.get(jid) || 0;
  const now = Date.now();
  if (now - last < THROTTLE_MS) return false;
  userThrottle.set(jid, now);
  return true;
}

function cleanAiText(body) {
  return String(body || '').replace(/^\.(ai|bot|gemini)\b/i, '').trim();
}

async function getWithRetry(url, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await httpClient.get(url);
      if (res.status >= 200 && res.status < 300) return res;
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = res.data;
      throw err;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function brainshopReply(text) {
  const url = `http://api.brainshop.ai/get?bid=${bid}&key=${key}&uid=${uid}&msg=${encodeURIComponent(text)}`;
  const response = await getWithRetry(url, 2);
  return (response?.data?.cnt || '🙂').toString();
}

async function smartAiReply(text) {
  // 1) Multi-model Gemini
  try {
    return await aiResponse(text);
  } catch {
    // 2) Brainshop fallback
    return await brainshopReply(text);
  }
}

// =============================================================
//  1) Text Chat (.ai / .bot / .gemini / Mention / Reply)
// =============================================================
cmd({ on: 'body' }, async (conn, mek, m, { from, body }) => {
  try {
    if (!body) return;

    const lower = body.toLowerCase();
    const isAiCmd = lower.startsWith('.ai') || lower.startsWith('.bot') || lower.startsWith('.gemini');

    // Mentions & Replies
    const botJid = normalizeJid(conn?.user?.id);
    const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const replyParticipant = m?.message?.extendedTextMessage?.contextInfo?.participant || '';

    const isMentioned = mentioned.includes(botJid);
    const isReplyToBot = replyParticipant === botJid;

    if (!isAiCmd && !isMentioned && !isReplyToBot) return;

    const senderJid = normalizeJid(mek?.key?.participant || mek?.key?.remoteJid || from);
    if (!canRun(senderJid)) return;

    const text = cleanAiText(body);
    if (!text) return;

    const cacheKey = `dmc_ai:${text.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      await conn.sendMessage(from, { text: `${BOT_NAME}\n\n${cached}` }, { quoted: mek });
      return;
    }

    const out = await smartAiReply(text);
    cacheSet(cacheKey, out);
    await conn.sendMessage(from, { text: `${BOT_NAME}\n\n${out}` }, { quoted: mek });
  } catch (e) {
    // never crash
    console.log('AI Error:', e?.message);
  }
});

// =============================================================
//  2) Voice Chat (.tellbot / .siri)
// =============================================================
cmd({
  pattern: 'tellbot',
  alias: ['siri', 'voiceai'],
  desc: 'Chat with bot using voice',
  category: 'fun',
  filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply(`${BOT_NAME}\n\n❌ Hi! What do you want to tell me?`);

    const senderJid = normalizeJid(mek?.key?.participant || from);
    if (!canRun(senderJid)) return;

    const cacheKey = `dmc_ai_voice:${q.toLowerCase()}`;
    let replyText = cacheGet(cacheKey);
    if (!replyText) {
      replyText = await smartAiReply(q);
      cacheSet(cacheKey, replyText);
    }

    const safeText = replyText.length > 180 ? replyText.slice(0, 180) : replyText;
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(safeText)}&tl=en&client=tw-ob`;

    await conn.sendMessage(from, {
      audio: { url: ttsUrl },
      mimetype: 'audio/mpeg',
      ptt: true
    }, { quoted: mek });
  } catch {
    reply(`${BOT_NAME}\n\n❌ Error in Voice AI.`);
  }
});
