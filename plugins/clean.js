const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');

cmd({
    pattern: "clean",
    alias: ["cleartmp", "resetstorage"],
    desc: "Clean server storage (tmp files & session junk)",
    category: "owner",
    react: "🧹",
    filename: __filename
}, async (conn, mek, m, { from, reply, isOwner }) => {
    // 1. Owner Check
    if (!isOwner) return reply("❌ මේක Owner ට විතරයි!");

    try {
        await reply("🧹 *Cleaning Storage...*");

        const rootDir = process.cwd();
        const sessionDir = path.join(rootDir, 'auth_info_baileys');
        let deletedCount = 0;

        // A. අනවශ්ය Media Files මැකීම (.mp3, .mp4, .jpg, .png)
        // (Download වෙලා ඉතුරු වුණ ඒවා)
        const rootFiles = fs.readdirSync(rootDir);
        rootFiles.forEach(file => {
            if (file.endsWith('.mp3') || file.endsWith('.mp4') || file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp')) {
                // 'menu.png' වගේ වැදගත් ඒවා මකන්න එපා
                if (file !== 'menu.png' && file !== 'menu.jpg') {
                    fs.unlinkSync(path.join(rootDir, file));
                    deletedCount++;
                }
            }
        });

        // B. Session Junk මැකීම (Session එක හිර කරන ෆයිල්)
        if (fs.existsSync(sessionDir)) {
            const sessionFiles = fs.readdirSync(sessionDir);
            sessionFiles.forEach(file => {
                // creds.json අතහරින්න (Main Login File)
                if (file !== 'creds.json') {
                    if (file.startsWith('pre-key') || file.startsWith('sender-key') || file.startsWith('session-') || file.startsWith('app-state')) {
                        fs.unlinkSync(path.join(sessionDir, file));
                        deletedCount++;
                    }
                }
            });
        }

        await conn.sendMessage(from, {
            text: `✅ *System Cleaned Successfully!* 🗑️\n\n📂 Deleted Files: ${deletedCount}\n🚀 Server Space: Optimized`
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        reply(`❌ Error: ${e.message}`);
    }
});
