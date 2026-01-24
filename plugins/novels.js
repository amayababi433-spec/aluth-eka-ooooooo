const { cmd } = require('../command');
const axios = require('axios');

// 1. Novel Menu (කතා මෙනුව)
cmd({
    pattern: "novel",
    desc: "Show available novels",
    category: "fun",
    filename: __filename
},
async(conn, mek, m, { from, reply }) => {
    let msg = `👑 *NOVELS & STORIES* 👑\n\n` +
              `*1. 😍 මීන නුවන් 😍*\n` +
              `_(අසීමාන්තික ආදරයේ උත්තරීතර ආමන්ත්‍රණය)_\n` +
              `Commands:\n` +
              `.1meena, .2meena, .3meena ... to .10meena\n\n` +
              `*2. 😍 හමුවෙමු මතු බවයේ 😍*\n` +
              `(කෙටිකතාවකි)\n` +
              `Command: .hamuwemu\n\n` +
              `📚 *Read and Enjoy!*`;
    
    // Cover Image එකක් එක්ක යවමු
    await conn.sendMessage(from, { 
        image: { url: "https://i.ibb.co/hWMT88G/IMG-20210709-160347.png" }, 
        caption: msg 
    }, { quoted: mek });
});

// 2. Meena Nuwan (කොටස් වශයෙන්)
// ඔයාගේ ලිස්ට් එකේ තිබුණ කොටස් 10ම මෙතනට දාන්න පුළුවන්.
// උදාහරණයක් විදිහට කොටස් 2ක් දාන්නම්. (දිග වැඩි වෙන නිසා).
// ඔයාට පුළුවන් අර පරණ ෆයිල් එකේ තිබුණ Text ටික මෙතනට කොපි කරගන්න.

cmd({
    pattern: "1meena",
    desc: "Meena Nuwan Episode 1",
    category: "fun",
    filename: __filename
},
async(conn, mek, m, { from, reply }) => {
    let text = `*මීන නුවන් 01*\n🧎🏻‍♀️❤️🧎\n\n"චූටී😲😲😲.....ඒයි මේ....තමුසෙ අද ක්ලාස් යන්නෙ නැද්ද ඕයි?......\n\n(මෙතනට ඔයාගේ දිග කතාවේ කොටස Paste කරන්න)...\n\nWrote By Sewwandi`;
    
    await conn.sendMessage(from, { 
        image: { url: "https://i.ibb.co/hWMT88G/IMG-20210709-160347.png" }, 
        caption: text 
    }, { quoted: mek });
});

cmd({
    pattern: "hamuwemu",
    desc: "Short Story",
    category: "fun",
    filename: __filename
},
async(conn, mek, m, { from, reply }) => {
    let text = `කෙටිකතාවකි.....\n\nහමුවෙමු මතු භවයේ❤️❤️❤️❤️❤️❤️❤️\n\n(මෙතනට ඔයාගේ දිග කතාවේ කොටස Paste කරන්න)...\n\n✍️Asanjana sumangi`;
    
    await conn.sendMessage(from, { 
        image: { url: "https://i.ibb.co/16Xvtnr/IMG-20210719-WA0473.jpg" }, 
        caption: text 
    }, { quoted: mek });
});