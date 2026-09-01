const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// =======================================================
//  OPTIMIZED ENGINE & AI INTEGRATION (100% ACCURATE)
// =======================================================

const ENCODED_KEYS = [
    "QVEuQWI4Uk42TDNhOTVxeUd1YU5fWGpLQUk0XzRCT2hmdU9XeVB4eUpGQXotN0JjMjJuSHc=",
    "QVEuQWI4Uk42SmpkZGRHRFVockRxYXhuWWhabGZBOWJuMmRKZnBEWWJaVWI3dkJhSzN5TXc=",
    "QVEuQWI4Uk42S1NZRFpRc2dxSHNfV2k3akwzazZnREwxNXBmYWdNTHUtclBhcU9jZE9WR0E=",
    "QVEuQWI4Uk42S3V1cm8yMTRmTmwxRXIwd3pfMzNNVXgyLS1ucDQ1b2hJbFB3VHVaSExoMVE=",
    "QVEuQWI4Uk42SU9fYTB6ODJZZGYwNjhoUExYZUhUV2pkZC01WFZyYVFRdm5Ic1Rrd2ZtVWc=",
    "QVEuQWI4Uk42TDhla1JIdUpCa0FjcFVLSFgtTjA3VXdMcXFDbFJTX3ZUWUNtaWEtTXhKblE="
];

const GEMINI_KEYS = process.env.GEMINI_KEYS 
    ? process.env.GEMINI_KEYS.split(',').map(k => k.trim()).filter(Boolean)
    : ENCODED_KEYS.map(k => Buffer.from(k, 'base64').toString('utf8'));

const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];

const voiceDir = path.join(__dirname, '../voice');
const voiceIndex = new Map();
let availableVoiceFiles = [];

function buildVoiceIndex() {
    if (!fs.existsSync(voiceDir)) return;
    const files = fs.readdirSync(voiceDir);
    for (const f of files) {
        if (f.endsWith('.mp3') || f.endsWith('.ogg')) {
            voiceIndex.set(f.toLowerCase(), path.join(voiceDir, f));
            availableVoiceFiles.push(f.toLowerCase());
        }
    }
}
buildVoiceIndex();

const lastReply = new Map();
const COOLDOWN_MS = 2000;

function canReply(jid) {
    const t = lastReply.get(jid) || 0;
    const now = Date.now();
    if (now - t < COOLDOWN_MS) return false;
    lastReply.set(jid, now);
    return true;
}

async function askAIVoice(message) {
    if (availableVoiceFiles.length === 0) return null;
    
    // Shuffle and pick up to 50 voice files to prevent prompt from being too large, 
    // or just send all if it's small enough. Usually Voice folders have ~100 files, which is fine.
    const fileList = availableVoiceFiles.length > 200 
        ? availableVoiceFiles.sort(() => 0.5 - Math.random()).slice(0, 200).join(', ')
        : availableVoiceFiles.join(', ');

    const prompt = `You are an AI assistant helping a WhatsApp bot select the right voice response for a Sinhala/Singlish user.
User message: "${message}"
Available voice files: ${fileList}

Rules:
1. If the user's message matches the meaning, intent, or is a direct translation of any of these voice files, reply with EXACTLY the filename (e.g. "hi.mp3").
2. If NO file matches the context well, reply EXACTLY with "NONE".
3. Reply ONLY with the filename or NONE. Do not include any other text.`;

    for (let i = 0; i < GEMINI_KEYS.length; i++) {
        const currentKey = GEMINI_KEYS[i];
        for (const model of GEMINI_MODELS) {
            try {
                const res = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`,
                    { contents: [{ parts: [{ text: prompt }] }] },
                    { timeout: 8000 }
                );
                const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
                
                if (reply && reply !== 'none' && voiceIndex.has(reply)) {
                    return reply;
                }
                if (reply === 'none') return null;
            } catch (err) {
                if (err?.response?.status === 429) break; 
            }
        }
    }
    return null;
}

cmd({
    on: "body"
}, async (conn, mek, m, { from, body, isGroup, sender }) => {
    try {
        if (sender && typeof sender === 'string' && sender.includes('94777297616')) return;
        if (!body || isGroup || !canReply(from) || voiceIndex.size === 0) return;

        const message = body.trim();
        const lowerMessage = message.toLowerCase();
        
        let targetFileName = null;

        // 1. DYNAMIC EXACT MATCHING (SUPER FAST & 100% ACCURATE)
        // Check if any word in the message EXACTLY matches a voice filename
        const words = lowerMessage.replace(/[^\w\s\u0D80-\u0DFF]/g, '').split(/\s+/);
        if (words.length > 3 || message.length > 40) return; // Stop triggering on long sentences!
        
        // Also check full message match first
        if (voiceIndex.has(`${lowerMessage}.mp3`)) targetFileName = `${lowerMessage}.mp3`;
        else if (voiceIndex.has(`${lowerMessage}.ogg`)) targetFileName = `${lowerMessage}.ogg`;
        
        if (!targetFileName) {
            for (const word of words) {
                if (!word) continue;
                if (voiceIndex.has(`${word}.mp3`)) {
                    targetFileName = `${word}.mp3`;
                    break;
                } else if (voiceIndex.has(`${word}.ogg`)) {
                    targetFileName = `${word}.ogg`;
                    break;
                }
            }
        }

        // 2. AI FALLBACK (IF NO EXACT MATCH)
        if (!targetFileName && message.length > 2 && message.length < 100) {
            targetFileName = await askAIVoice(message);
        }

        if (!targetFileName) return;

        const filePath = voiceIndex.get(targetFileName.toLowerCase());
        if (!filePath) return;

        await conn.sendMessage(from, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg',
            ptt: true
        }, { quoted: mek });

    } catch (e) {
        console.log("Auto Voice Error:", e.message);
    }
});
