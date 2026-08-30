const { cmd } = require('../command');
const axios = require('axios');

// Node.js Gemini API Keys with rotation
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

// පෞද්ගලික / Class සම්බන්ධ වචන
const personalWords = ['clz', 'class', 'enawada', 'yanawada', 'bus', 'kiye', 'heta', 'ada'];

// Models to query (Google API strict requirement fallbacks)
const GEMINI_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-pro'];

cmd({
    on: "body"
}, async (conn, mek, m, { from, body, isGroup, isOwner, reply }) => {
    try {
        if (!body || typeof body !== 'string') return;
        
        // Group මැසේජ්, Commands, Bot ගේම මැසේජ් මඟ හැරීම
        if (isGroup || from?.endsWith('@g.us') || mek?.key?.fromMe) return;
        if (body.startsWith('.') || body.startsWith('!') || body.startsWith('/')) return;

        // Owner check: අයිතිකාරයාට auto-reply යවන්නේ නෑ, හැබැයි test කරනවා නම් log එකේ පෙන්නනවා
        if (isOwner) {
            console.log(`[AutoReply] Ignored owner message from: ${from}`);
            return;
        }

        const text = body.toLowerCase().trim();
        if (!text) return;
        
        console.log(`[AutoReply] Processing AI reply for: ${from}`);

        // මැසේජ් එක Auto-Read කිරීම (Blue Tick)
        try {
            if (conn && typeof conn.readMessages === 'function') {
                await conn.readMessages([mek.key]);
            }
        } catch (_) {}

        // පෞද්ගලික වචන තියෙනවද කියලා check කිරීම
        const isPersonal = personalWords.some(word => text.includes(word));

        if (isPersonal) {
            return await reply("⚠️ *කරුණාකර රැඳී සිටින්න.* \n\nOwner පැමිණි පසු ඔබට පිළිතුරු ලබා දෙනු ඇත.");
        }

        // ටයිපින් මිස්ටේක් තේරුම් ගන්න දෙන System Prompt එක
        const aiPrompt = `You are a human-like WhatsApp friend responding in Sinhala or Singlish. The user might send messages with spelling mistakes, broken Singlish, or half-complete words. Understand their true intent, ignore the typos, and reply naturally like a real friendly person in casual Sinhala. Keep the response concise and helpful. User message: ${body}`;
        
        let aiReply = null;

        // Auto Key Rotation Logic
        for (let i = 0; i < GEMINI_KEYS.length; i++) {
            const currentKey = GEMINI_KEYS[i];
            
            for (const model of GEMINI_MODELS) {
                try {
                    const res = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`,
                        {
                            contents: [{ parts: [{ text: aiPrompt }] }]
                        },
                        { timeout: 12000 }
                    );

                    aiReply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (aiReply) break;
                } catch (err) {
                    const status = err?.response?.status || err?.message;
                    console.log(`[AutoReply] Key ${i + 1} (${model}) status: ${status}`);
                    if (status === 429) {
                        break; // Rate limit hit on this key, move to next key immediately
                    }
                }
            }

            if (aiReply) break;
        }

        if (aiReply) {
            console.log(`[AutoReply] Sent reply to ${from}`);
            return await reply(`🤖 ${aiReply.trim()}`);
        } else {
            console.log(`[AutoReply] Failed to get response from all keys.`);
        }

    } catch (e) {
        console.error("Auto AI Error:", e.message);
    }
});
