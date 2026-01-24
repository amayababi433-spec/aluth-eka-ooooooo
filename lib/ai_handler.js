// lib/ai_handler.js
// =============================================================
//  Multi-Model AI Engine (Zero-Downtime Fallback)
//  Bot Branding: 👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑
//
//  Priority Chain:
//   1) https://api.siputzx.my.id/api/ai/gemini-pro
//   2) https://api.ryzendesu.vip/api/ai/gemini
//   3) https://api.giftedtech.my.id/api/ai/geminiaipro
//
//  Goals:
//   - Never crash the bot on upstream errors
//   - Fast timeouts + retries
//   - Keep-alive HTTP engine
// =============================================================

'use strict';

const axios = require('axios');
const https = require('https');

const BOT_NAME = '👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑';

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

const http = axios.create({
  timeout: 15000,
  httpsAgent,
  maxRedirects: 2,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Node.js)',
    'Accept': 'application/json,text/plain,*/*'
  },
  validateStatus: () => true,
});

function pickText(payload) {
  // Support multiple provider response shapes
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  const p = payload;

  // common keys
  return (
    p?.result ||
    p?.response ||
    p?.reply ||
    p?.answer ||
    p?.output ||
    p?.data?.result ||
    p?.data?.response ||
    p?.data?.answer ||
    p?.data?.output ||
    p?.message ||
    ''
  ).toString();
}

async function getJson(url) {
  const res = await http.get(url);
  if (res.status >= 200 && res.status < 300) return res.data;
  const err = new Error(`AI upstream status ${res.status}`);
  err.status = res.status;
  err.data = res.data;
  throw err;
}

async function tryOnce(url, query) {
  const full = `${url}?text=${encodeURIComponent(query)}`;
  const data = await getJson(full);
  const text = pickText(data);
  if (!text || text.trim().length < 1) {
    const err = new Error('Empty AI response');
    err.data = data;
    throw err;
  }
  return text.trim();
}

async function tryWithRetry(url, query, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await tryOnce(url, query);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/**
 * aiResponse(query)
 * - Cycles through providers until one succeeds.
 * - Never throws unhandled errors; throws only to caller (who can fallback).
 */
async function aiResponse(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Empty query');

  const providers = [
    'https://api.siputzx.my.id/api/ai/gemini-pro',
    'https://api.ryzendesu.vip/api/ai/gemini',
    'https://api.giftedtech.my.id/api/ai/geminiaipro',
  ];

  let lastErr;
  for (const base of providers) {
    try {
      return await tryWithRetry(base, q, 2);
    } catch (e) {
      lastErr = e;
      // continue to next provider
    }
  }

  const err = new Error('All AI providers failed');
  err.cause = lastErr;
  err.bot = BOT_NAME;
  throw err;
}

module.exports = { BOT_NAME, aiResponse };
