const { cmd, commands } = require('../command');
const config = require('../config');

// 1. GLOBAL VARIABLES
let afkData = {
    isAfk: false,
    reason: null,
    lastseen: 0
};

// Spam නවත්වන්න (Throttle Map)
const afkThrottle = new Map(); 

// 2. AFK ON COMMAND
cmd({
    pattern: "afk",
    desc: "Turn on AFK mode",
    category: "main",
    filename: __filename
},
async(conn, mek, m, { from, q, reply, sender, isOwner }) => {
    try {
        if (!isOwner) return; // Owner only
        
        afkData.isAfk = true;
        afkData.reason = q ? q : "Busy";
        afkData.lastseen = Date.now();

        return await reply(`✅ *AFK Mode Activated*\n\nReason: ${afkData.reason}\n(Send any message to disable)`);
    } catch (e) {
        console.log(e);
        reply("Error activating AFK.");
    }
});

// 3. AFK LISTENER (FAST & THROTTLED)
cmd({
    on: "body" 
},
async(conn, mek, m, { from, sender, isOwner, reply }) => {
    try {
        // FAST EXIT: AFK නැත්නම් මෙතනින්ම නවතින්න (Speed Up)
        if (!afkData.isAfk) return;

        // A) Owner මැසේජ් එකක් දැම්මොත් AFK අයින් කරන්න
        if (isOwner && !m.key.fromMe) {
            afkData.isAfk = false;
            afkData.reason = null;
            await reply("👋 *Welcome Back!* AFK mode disabled.");
            return;
        }

        // B) කවුරුහරි මාව Mention කළාද? (Safety Check)
        const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        // Owner ව Mention කරලා නම් + Owner නෙවෙයි නම් Reply කරන්න
        // (සටහන: ඔයාගේ බොට්ගේ නම්බර් එක මෙතනට දාන්න ඕන හරිනම්, නමුත් මේක සාමාන්‍ය ක්‍රමයයි)
        if (mentioned.length > 0 && !isOwner) {
             
            // Throttle: තත්පර 60ක් ඇතුළත ආයේ රිප්ලයි කරන්නේ නෑ
            const last = afkThrottle.get(from) || 0;
            if (Date.now() - last < 60 * 1000) return; 
            afkThrottle.set(from, Date.now());

            // කාලය හදමු
            const seconds = Math.floor((Date.now() - afkData.lastseen) / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);

            let timeString = `${seconds}s`;
            if (minutes > 0) timeString = `${minutes}m`;
            if (hours > 0) timeString = `${hours}h`;

            await reply(`📵 *Owner is currently AFK*\n\n👤 *Reason:* ${afkData.reason}\n⏳ *Last Seen:* ${timeString} ago\n\n_Please wait until they return._`);
        }

    } catch (e) {
        // Error ආවොත් ගණන් ගන්නේ නෑ (Crash නොවී දුවන්න)
        // console.log(e); 
    }
});