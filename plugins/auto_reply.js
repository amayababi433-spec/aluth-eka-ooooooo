const { cmd } = require('../command');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

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
        return fs.readFileSync(path.join(__dirname, '../thumbnail/alive.jpg')); 
    } catch (e) {
        try {
            return fs.readFileSync(path.join(__dirname, '../thumbnail/menu.jpg'));
        } catch (err) {
            return null;
        }
    }
}

async function sendInteractiveUI(conn, from) {
    const localImg = getLocalImage();
    if (localImg) {
        await conn.sendMessage(from, { image: localImg, caption: "✨ *Welcome to DMC!*" });
    }
    
    const pollMessage = {
        poll: {
            name: "📊 DMC Verification Poll 📊\nඔබ Bot කෙනෙක්ද නැත්නම් Real කෙනෙක්ද?\n\n(කරුණාකර ඉහත Poll එකෙහි අදාළ තේරීම Click කර, ඉන්පසු එයට අදාළ අංකය 1 හෝ 2 ලෙස පහළින් Type කර එවන්න)",
            values: ["0.RESET 🔄", "1.Real Human 👦", "2.BOT 🤖"],
            selectableCount: 1
        }
    };
    await conn.sendMessage(from, pollMessage);
}

cmd({
    on: "body"
}, async (conn, mek, m, { from, body, isGroup, isOwner, reply }) => {
    try {
        if (!body || typeof body !== 'string') return;
        if (isGroup || from?.endsWith('@g.us') || mek?.key?.fromMe) return;
        if (body.startsWith('.') || body.startsWith('!') || body.startsWith('/')) return;
        if (isOwner) return;

        const sender = mek.key.participant || mek.key.remoteJid || from;
        let text = body.trim();
        
        const interactiveRes = mek.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        if (interactiveRes) {
            try { text = JSON.parse(interactiveRes).id; } catch (e) {}
        }
        
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
        
        let userData = userCache.get(sender);
        if (!userData) {
            userData = await db.findOne({ _id: sender });
            if (userData) userCache.set(sender, userData);
        }

        if (text === '0' || lowerText === 'reset' || text.includes('0.RESET')) {
            userCache.delete(sender);
            db.deleteOne({ _id: sender }).catch(() => {}); 
            return await reply("🔄 *Reset Successful.* ඊළඟ මැසේජ් එකේදී නැවත මෙනුව පැමිණේවි.");
        }

        if (!userData || userData.lastSeen !== today) {
            const newState = { lastSeen: today, state: 'WAITING_FOR_VOTE' };
            userCache.set(sender, newState); 
            db.updateOne({ _id: sender }, { $set: newState }, { upsert: true }).catch(() => {}); 
            await sendInteractiveUI(conn, from);
            return;
        }

        const state = userData.state;
        
        if (state === 'WAITING_FOR_VOTE') {
            if (text === '1' || lowerText.includes('real human')) {
                userData.state = 'REAL';
                db.updateOne({ _id: sender }, { $set: { state: 'REAL' } }).catch(() => {});
                return await reply("✅ *Verification Success!* Owner පැමිණි පසු පිළිතුරු දෙනු ඇත.");
            } else if (text === '2' || lowerText.includes('bot')) {
                userData.state = 'BOT';
                db.updateOne({ _id: sender }, { $set: { state: 'BOT' } }).catch(() => {});
                return await reply("🤖 *Bot Mode Activated.* AI සමග Chat කිරීම ආරම්භ කරන්න!");
            } else {
                return await reply("⚠️ කරුණාකර ඉහත Poll එකෙන් නිවැරදි විකල්පයක් තෝරා, ඊට අදාළ අංකය (1 හෝ 2) පහළින් Type කර එවන්න.");
            }
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
