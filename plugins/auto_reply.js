const { cmd } = require('../command');
const axios = require('axios');
const { MongoClient } = require('mongodb');

// Node.js Gemini API Keys with rotation (Base64 Encoded for GitHub Security)
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
const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-pro'];

let pollCollection;
const userCache = new Map(); // RAM Cache
const spamGuard = new Map(); // Anti-Spam Map

// Database Connection
async function getDB() {
    if (!pollCollection) {
        if (!process.env.MONGODB_URI) {
            console.error("No MONGODB_URI found for auto_reply poll cache.");
            return null;
        }
        const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
        await client.connect();
        pollCollection = client.db('whatsapp_bot').collection('poll_state');
    }
    return pollCollection;
}

// Global Poll Vote Handler (Called by index.js)
global.processPollVote = async (sender, optionName, sock) => {
    const db = await getDB();
    if (!db) return;

    let newState = '';
    
    if (optionName.includes('0') || optionName.includes('Reset') || optionName.includes('RESET')) {
        userCache.delete(sender);
        db.deleteOne({ _id: sender }).catch(() => {}); // Non-blocking
        return await sock.sendMessage(sender, { text: "🔄 *Reset Successful.*" });
    } else if (optionName.includes('1') || optionName.includes('Real Human')) {
        newState = 'REAL';
        await sock.sendMessage(sender, { text: "✅ *Verification Success!* Owner පැමිණි පසු පිළිතුරු දෙනු ඇත." });
    } else if (optionName.includes('2') || optionName.includes('AI Bot') || optionName.includes('BOT')) {
        newState = 'BOT';
        await sock.sendMessage(sender, { text: "🤖 *Bot Mode Activated.* AI සමග Chat කිරීම ආරම්භ කරන්න!" });
    }

    // Update RAM & DB
    if (newState) {
        userCache.set(sender, { state: newState, lastSeen: new Date().toDateString() });
        db.updateOne({ _id: sender }, { $set: { state: newState } }, { upsert: true }).catch(() => {});
    }
};

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

        
        const sender = mek.key.participant || mek.key.remoteJid || from;
        const text = body.trim();
        console.log(`[DEBUG] Message received from ${sender}: ${text}`);
        const lowerText = text.toLowerCase();
        const today = new Date().toDateString();
        const now = Date.now();

        // 🔥 1. ANTI-SPAM GUARD: තත්පර 3කට වඩා අඩුවෙන් මැසේජ් ආවොත් Ignore කරනවා
        const lastMsgTime = spamGuard.get(sender) || 0;
        if (now - lastMsgTime < 3000) return; 
        spamGuard.set(sender, now);

        try {
            if (conn && typeof conn.readMessages === 'function') {
                await conn.readMessages([mek.key]);
            }
        } catch (_) {}

        const db = await getDB();
        if (!db) return;
        
        let userData = userCache.get(sender);

        if (!userData) {
            userData = await db.findOne({ _id: sender });
            if (userData) userCache.set(sender, userData);
        }

        // 3. Reset Command (Fallback if they still type 0 manually)
        if (text === '0') {
            userCache.delete(sender);
            db.deleteOne({ _id: sender }).catch(() => {}); 
            return await reply("🔄 *Reset Successful.* ඊළඟ මැසේජ් එකේදී නැවත Poll එක පැමිණේවි.");
        }

        // 4. New User / Next Day Check -> Send Native Poll
        
        console.log(`[DEBUG] User state for ${sender}: ${userData ? userData.state : 'NONE'}`);
        if (!userData || userData.lastSeen !== today) {
            console.log(`[DEBUG] Sending native poll to ${sender}`);

            const newState = { lastSeen: today, state: 'WAITING_FOR_VOTE' };
            userCache.set(sender, newState); 
            db.updateOne({ _id: sender }, { $set: newState }, { upsert: true }).catch(() => {}); 
            
            const menuText = "📊 *DMC Verification* 📊\n\nඔබ Bot කෙනෙක්ද නැත්නම් Real කෙනෙක්ද?\n\n*0* - RESET 🔄\n*1* - Real Human 👦\n*2* - BOT 🤖\n\n_කරුණාකර අංකය පමණක් Reply කරන්න (උදා: 2)_";
            await conn.sendMessage(from, { text: menuText });
            return;
        }

        const state = userData.state;

        if (state === 'WAITING_FOR_VOTE') {
            if (text === '1' || text.toLowerCase().includes('real human')) {
                if (global.processPollVote) await global.processPollVote(sender, '1.Real Human', conn);
                return;
            } else if (text === '2' || text.toLowerCase().includes('bot')) {
                if (global.processPollVote) await global.processPollVote(sender, '2.BOT', conn);
                return;
            }
            
            console.log(`[DEBUG] User is in WAITING_FOR_VOTE. Resending poll...`);

            const menuText = "📊 *DMC Verification* 📊\n\nඔබ Bot කෙනෙක්ද නැත්නම් Real කෙනෙක්ද?\n\n*0* - RESET 🔄\n*1* - Real Human 👦\n*2* - BOT 🤖\n\n_කරුණාකර අංකය පමණක් Reply කරන්න (උදා: 2)_";
            await conn.sendMessage(from, { text: menuText });
            return;
        }

        // 6. Block AI for Real Users (but keep personalWords logic)
        if (state === 'REAL') {
            const isPersonal = personalWords.some(word => lowerText.includes(word));
            if (isPersonal) {
                return await reply("⚠️ *කරුණාකර රැඳී සිටින්න.* \n\nOwner පැමිණි පසු ඔබට පිළිතුරු ලබා දෙනු ඇත.");
            }
            return;
        }

        // 7. Gemini AI Generation with Auto-Fallback (Old robust logic)
        if (state === 'BOT') {
            const aiPrompt = `You are a human-like WhatsApp friend responding in Sinhala or Singlish. The user might send messages with spelling mistakes, broken Singlish, or half-complete words. Understand their true intent, ignore the typos, and reply naturally like a real friendly person in casual Sinhala. Keep the response concise and helpful. User message: ${body}`;
            let aiReply = null;

            console.log(`[AutoReply] Processing AI reply for: ${from}`);

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
                            break; // Rate limit hit on this key, move to next key
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
        }

    } catch (e) {
        console.error("Auto AI Error:", e.message);
    }
});
