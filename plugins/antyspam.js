const { cmd } = require('../command');
const config = require('../config');

// ===============================
// SPEED ENGINE: Anti-Lag Protection
// ===============================
const userCooldown = new Map(); // Admin Cooldown
const COOLDOWN_MS = 5000; // තත්පර 5ක විවේකයක් (Spam වැළැක්වීමට)

function canRun(sender) {
    const last = userCooldown.get(sender) || 0;
    const now = Date.now();
    if (now - last < COOLDOWN_MS) return false;
    userCooldown.set(sender, now);
    return true;
}

cmd({
    pattern: "antispam",
    desc: "Close group and clear chat instantly (FAST MODE)",
    category: "group",
    filename: __filename
},
async(conn, mek, m, { from, isGroup, isAdmins, isBotAdmins, reply, sender }) => {
    try {
        // 1. FAST EXIT (Check Permissions First)
        if (!isGroup) return reply("❌ This command is only for Groups.");
        if (!isAdmins) return reply("❌ You must be an Admin to use this.");
        if (!isBotAdmins) return reply("❌ Please give me Admin Privileges first!");

        // 2. THROTTLE (Prevent Spamming the Bot)
        if (!canRun(sender)) {
            return reply("⏳ Please wait a few seconds before using Anti-Spam again.");
        }

        // 3. ACTION START
        await conn.sendMessage(from, { text: "🚨 *Anti-Spam Logic Activated!* \n🔒 Closing Group & Purging Chat..." }, { quoted: mek });

        // Step 1: Close Group (Instant Mute)
        await conn.groupSettingUpdate(from, 'announcement');

        // Step 2: Chat Clear (Invisible Text Exploit)
        // පේන්නේ නැති අකුරු 400ක් යවලා චැට් එක උඩට තල්ලු කරනවා
        const invisible = '‎'.repeat(400); 
        const clearMsg = `🛑 *SECURITY ACTION* 🛑\n\n${invisible}\n\n♻️ *Chat Surface Cleared*`;

        // මැසේජ් 2ක් යැවීම ප්‍රමාණවත් (Lag නොවී වැඩේ වෙන්න)
        await conn.sendMessage(from, { text: clearMsg });
        await conn.sendMessage(from, { text: clearMsg });

        await conn.sendMessage(from, { text: "✅ *Done! Group Closed & Secured.* \n(Admins can reopen manually)" }, { quoted: mek });

    } catch (e) {
        console.log(e);
        reply("❌ Error activating Anti-Spam.");
    }
});