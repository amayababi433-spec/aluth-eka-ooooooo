const { cmd } = require('../command');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

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

const personalWords = ['clz', 'class', 'enawada', 'yanawada', 'bus', 'kiye', 'heta', 'ada'];
const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-pro'];

let pollCollection;
const userCache = new Map(); 
const spamGuard = new Map(); 

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

global.processPollVote = async (sender, optionName, sock) => {};

function getLocalImage() {
    try {
        return fs.readFileSync(path.join(__dirname, '../thumbnail/poll.png')); 
    } catch (e) {
        try {
            return fs.readFileSync(path.join(__dirname, '../thumbnail/menu.png'));
        } catch (err) {
            return null;
        }
    }
}

async function sendVerificationMenu(conn, from) {
    const localImg = getLocalImage();
    const captionText = "📊 *DMC Verification* 📊\n\nඔබ Bot කෙනෙක්ද නැත්නම් Real කෙනෙක්ද?\n\n*1* - Real Human 👦\n*2* - BOT 🤖\n*0* - RESET 🔄\n\n_කරුණාකර අදාළ අංකය පමණක් (1, 2 හෝ 0) පහළින් Type කර එවන්න._";
    
    if (localImg) {
        await conn.sendMessage(from, { image: localImg, mimetype: 'image/png', caption: captionText });
    } else {
        await conn.sendMessage(from, { text: captionText });
    }
}

cmd({
    on: "body"
}, async (conn, mek, m, { from, body, isGroup, isOwner, reply }) => {
    try {
        if (!body || typeof body !== 'string') return;
        if (isGroup || from?.endsWith('@g.us') || mek?.key?.fromMe) return;
        if (body.startsWith('.') || body.startsWith('!') || body.startsWith('/')) return;
        if (isOwner) return;

        // 🔹 ANTI-BOT: Ignore interactive messages completely 🔹
        const msgKeys = Object.keys(mek.message || {});
        const hasInteractive = msgKeys.some(k => ['templateMessage', 'listMessage', 'buttonsMessage', 'interactiveMessage', 'buttonsResponseMessage', 'templateButtonReplyMessage', 'listResponseMessage', 'interactiveResponseMessage'].includes(k));
        if (hasInteractive || mek.message?.viewOnceMessageV2?.message?.interactiveMessage || mek.message?.viewOnceMessage?.message?.interactiveMessage) {
            return; 
        }

        const sender = mek.key.participant || mek.key.remoteJid || from;
        let text = body.trim();
        const lowerText = text.toLowerCase();
        const today = new Date().toDateString();
        const now = Date.now();

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
        
        // 🔹 0, 1, 2 Global Shortcuts 🔹
        if (text === '0' || lowerText === 'reset' || text.includes('0.RESET')) {
            userCache.delete(sender);
            db.deleteOne({ _id: sender }).catch(() => {}); 
            return await reply("🔄 *Reset Successful.* \n\nදැන් ඔබට අවශ්‍ය නම් නැවතත් 1 (Real) හෝ 2 (Bot) ලෙස යවා Mode එක මාරු කළ හැක. නැතහොත් වෙනත් මැසේජ් එකක් යවා Menu එක ලබාගන්න.");
        }

        if (text === '1' || lowerText === 'real' || text.includes('1.Real Human')) {
            const newState = { lastSeen: today, state: 'REAL' };
            userCache.set(sender, newState);
            db.updateOne({ _id: sender }, { $set: newState }, { upsert: true }).catch(() => {});
            return await reply("✅ *Verification Success!* Owner පැමිණි පසු පිළිතුරු දෙනු ඇත.");
        }

        if (text === '2' || lowerText === 'bot' || text.includes('2.BOT')) {
            const newState = { lastSeen: today, state: 'BOT' };
            userCache.set(sender, newState);
            db.updateOne({ _id: sender }, { $set: newState }, { upsert: true }).catch(() => {});
            return await reply("🤖 *Bot Mode Activated.* AI සමග Chat කිරීම ආරම්භ කරන්න!");
        }

        let userData = userCache.get(sender);
        if (!userData) {
            userData = await db.findOne({ _id: sender });
            if (userData) userCache.set(sender, userData);
        }

        // 🔹 ANTI-BOT: Ignore blocked bots forever 🔹
        if (userData && userData.state === 'BLOCKED' && userData.lastSeen === today) {
            return;
        }

        if (!userData || userData.lastSeen !== today) {
            const newState = { lastSeen: today, state: 'WAITING_FOR_VOTE', strikes: 0 };
            userCache.set(sender, newState); 
            db.updateOne({ _id: sender }, { $set: newState }, { upsert: true }).catch(() => {}); 
            await sendVerificationMenu(conn, from);
            return;
        }

        const state = userData.state;
        
        if (state === 'WAITING_FOR_VOTE') {
            // 🔹 ANTI-BOT STRIKE SYSTEM 🔹
            const strikes = (userData.strikes || 0) + 1;
            if (strikes >= 2) {
                userData.state = 'BLOCKED';
                userCache.set(sender, userData);
                db.updateOne({ _id: sender }, { $set: { state: 'BLOCKED' } }).catch(() => {});
                return; // Permanent silence to prevent infinite loops
            }
            
            userData.strikes = strikes;
            userCache.set(sender, userData);
            db.updateOne({ _id: sender }, { $set: { strikes: strikes } }).catch(() => {});

            await reply("⚠️ කරුණාකර ඉහත මෙනුවෙන් නිවැරදි විකල්පයක් තෝරා, ඊට අදාළ අංකය (1, 2 හෝ 0) පමණක් Type කර එවන්න.");
            await sendVerificationMenu(conn, from);
            return;
        }

        if (state === 'REAL') {
            const isPersonal = personalWords.some(word => lowerText.includes(word));
            if (isPersonal) {
                return await reply("⚠️ *කරුණාකර රැඳී සිටින්න.* \n\nOwner පැමිණි පසු එයට පිළිතුරු දෙනු ඇත.");
            }
            return;
        }

        if (state === 'BOT') {
            const aiPrompt = `You are a human-like WhatsApp friend responding in Sinhala or Singlish. The user might send messages with spelling mistakes, broken Singlish, or half-complete words. Understand their true intent, ignore the typos, and reply naturally like a real friendly person in casual Sinhala. Keep the response concise and helpful. User message: ${body}`;
            let aiReply = null;
            for (let i = 0; i < GEMINI_KEYS.length; i++) {
                const currentKey = GEMINI_KEYS[i];
                for (const model of GEMINI_MODELS) {
                    try {
                        const res = await axios.post(
                            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`,
                            { contents: [{ parts: [{ text: aiPrompt }] }] },
                            { timeout: 12000 }
                        );
                        aiReply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (aiReply) break;
                    } catch (err) {
                        if (err?.response?.status === 429) break; 
                    }
                }
                if (aiReply) break;
            }
            if (aiReply) {
                return await reply(`🤖 ${aiReply.trim()}`);
            }
        }

    } catch (e) {
        console.error("Auto AI Error:", e.message);
    }
});
