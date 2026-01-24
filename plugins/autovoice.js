const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');

// =======================================================
//  OPTIMIZED ENGINE: PRE-INDEXING & CACHING
// =======================================================

const voiceDir = path.join(__dirname, '../voice');
const voiceIndex = new Map();

function buildVoiceIndex() {
    if (!fs.existsSync(voiceDir)) {
        console.log("⚠️ Voice folder not found!");
        return;
    }
    const files = fs.readdirSync(voiceDir);
    for (const f of files) {
        voiceIndex.set(f.toLowerCase(), path.join(voiceDir, f));
    }
    console.log(`✅ Loaded ${voiceIndex.size} voice files into memory.`);
}
buildVoiceIndex();

// Anti-Spam Throttle
const lastReply = new Map();
const COOLDOWN_MS = 2000;

function canReply(jid) {
    const t = lastReply.get(jid) || 0;
    const now = Date.now();
    if (now - t < COOLDOWN_MS) return false;
    lastReply.set(jid, now);
    return true;
}

function getSimilarity(s1, s2) {
    let longer = s1.length < s2.length ? s2 : s1;
    let shorter = s1.length < s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    const editDistance = (s1, s2) => {
        s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
        let costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i == 0) costs[j] = j;
                else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue; lastValue = newValue;
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    };
    return (longer.length - editDistance(longer, shorter)) / parseFloat(longer.length);
}

// Voice Map
const voiceMap = {
    'hi': 'hi.mp3',
    'hello': 'hello.mp3',
    'helo': 'helo.mp3',
    'hey': 'hey.mp3',
    'hy': 'hy.mp3',
    'bye': 'bye.mp3',
    'i love you': 'i love you.mp3',
    'merilada': 'marilada.mp3',
    'sewmaker': 'sewmaker.mp3',
    'bitch': 'bitch.mp3',
    'sepak': 'sapak.mp3',
    'sapak': 'sapak.mp3',
    'bich': 'bich.mp3',
    'y ban': 'y ban.mp3',
    'y bn': 'y bn.mp3',
    'why ban': 'why ban.mp3',
    'uddika': 'uddika.mp3',
    'sindu': 'sindu.mp3',
    'seen': 'seen.mp3',
    'note': 'notes.mp3',
    'notes': 'notes.mp3',
    'pinn': 'pinn.mp3',
    'modaya': 'modaya.mp3',
    'moda': 'moda.mp3',
    'pissu': 'pissu.mp3',
    'pissuda': 'pissuda.mp3',
    'pissa': 'pissa.mp3',
    'pissi': 'pissi.mp3',
    'nida gannawada': 'nida gannawada.mp3',
    'nidida': 'nidida.mp3',
    'ban': 'ban.mp3',
    'bang': 'bang.mp3',
    'baduwa': 'baduwa.mp3',
    'belli': 'balli.mp3',
    'balli': 'balli.mp3',
    'denawada': 'denawada.mp3',
    'hukanna': 'hukanna.mp3',
    'hukanni': 'hukanni.mp3',
    'huththa': 'huththa.mp3',
    'huththi': 'huththi.mp3',
    'keriya': 'kariya.mp3',
    'kariya': 'kariya.mp3',
    'kellekda': 'kellekda.mp3',
    'love': 'love.mp3',
    'namaskaram': 'namaskaram.mp3',
    'namasthe': 'namasthe.mp3',
    'nangi': 'namgi.mp3',
    'namgi': 'namgi.mp3',
    'pakaya': 'pakaya.mp3',
    'ponnaya': 'ponnaya.mp3',
    'ponni': 'ponni.mp3',
    'u girl': 'u girl.mp3',
    'umma': 'umma.mp3',
    'ummah': 'ummah.mp3',
    'ummma': 'ummma.mp3',
    'vesawi': 'vesawi.mp3',
    'vesavi': 'vesavi.mp3',
    'wesi': 'wesi.mp3',
    'you girl': 'you girl.mp3',
    'mk': 'mk.mp3',
    'mokek': 'mokek.mp3',
    'mokada karanne': 'mk.mp3',
    'mokada krnne': 'mk.mp3',
    'mokada': 'mk.mp3',
    'kohomada': 'kohomada.mp3',
    'kohomd': 'kohomd.mp3',
    'na na': 'na na.mp3',
    'nah': 'nah.mp3',
    'fuck': 'fuck.mp3',
    'gahanawa': 'gahanawa.mp3',
    'gahano': 'gahano.mp3',
    'gothaya': 'gothaya.mp3',
    'guti': 'guti.mp3',
    'pala': 'pala.mp3',
    'paraya': 'paraya.mp3',
    'pinnaya': 'pinnaya.mp3',
    'raviya': 'raviya.mp3',
    'hako': 'hako.mp3',
    'hmm': 'hmm.mp3',
    'hum': 'hum.mp3',
    'natahan': 'natahan.mp3',
    'natanna': 'natanna.mp3',
    'robo': 'robo.mp3',
    'gm': 'good morning.mp3',
    'good morning': 'good morning.mp3',
    'gn': 'good night.mp3',
    'good night': 'good night.mp3',
    'adarei': 'adarei.mp3',
    'adarey': 'adarey.mp3',
    'බුදු සරණයි': 'budu saranai.mp3',
    'budu saranai': 'budu saranai.mp3',
    'එල': 'ela.mp3',
    'ela': 'ela.mp3',
    'maru': 'maru.mp3',
    'super': 'maru.mp3'
};

const voiceKeys = Object.keys(voiceMap);

// =======================================================
//  MAIN COMMAND (UPDATED LOGIC)
// =======================================================
cmd({
    on: "body"
},
    async (conn, mek, m, { from, body, isGroup, sender }) => {
        try {
            // 1. Block Specific User (+94 77 729 7616)
            if (sender.includes('94777297616')) return;

            if (!body) return;

            // 2. Group Filtering Logic
            if (isGroup) {
                // Group එකක නම් නම චෙක් කරන්න
                try {
                    const groupMetadata = await conn.groupMetadata(from);
                    const groupName = groupMetadata.subject;

                    // "KMV 2026 science and Maths" ගෲප් එකේ විතරක් වැඩ කරන්න
                    if (groupName !== "KMV 2026 science and Maths") {
                        return; // වෙනත් ගෲප් එකක් නම් නවතින්න
                    }
                } catch (e) {
                    return; // Error එකක් ආවොත් ආරක්ෂාවට නවතින්න
                }
            }
            // ගෲප් එකක් නොවේ නම් (Private Chat), කෙලින්ම පහළට යයි (Auto Voice වැඩ කරයි)

            // Anti-Spam Check
            if (!canReply(from)) return;

            if (voiceIndex.size === 0) return;

            const message = body.toLowerCase().trim();
            if (!message) return;

            let foundKey = voiceMap[message] ? message : null;

            if (!foundKey) {
                foundKey = voiceKeys.find(k => message.includes(k));
            }

            if (!foundKey && message.length <= 30) {
                foundKey = voiceKeys.find(k => getSimilarity(message, k) > 0.85);
            }

            if (!foundKey) return;

            const targetFileName = voiceMap[foundKey];
            const filePath = voiceIndex.get(targetFileName.toLowerCase());

            if (!filePath) return;

            await conn.sendMessage(from, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                ptt: true
            }, { quoted: mek });

        } catch (e) {
            console.log("Auto Voice Error:", e);
        }
    });