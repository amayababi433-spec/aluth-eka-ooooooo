const { cmd } = require('../command');
const axios = require('axios');

// =============================================================
//  AI COPILOT
// =============================================================
cmd({
    pattern: "copilot",
    alias: ["bing", "microsoft"],
    desc: "Chat with AI Copilot",
    category: "ai",
    filename: __filename
},
    async (conn, mek, m, { from, q, reply }) => {
        try {
            if (!q) return reply("🤖 Ask me anything!");

            await conn.sendMessage(from, { react: { text: "🧠", key: mek.key } });

            const apiKey = global.APIKeys['emojimix']; // User listed this key for copilot too in desc? Or similar? 
            // User map: Copilot -> 'stellar-dXXUtmL2' (Same as emoji mix?)
            // Let's use the explicit map logic or fallback

            const key = 'stellar-dXXUtmL2';
            const targetUrl = `${global.api.alyabot}/ai/copilot?q=${encodeURIComponent(q)}&key=${key}`;

            const res = await axios.get(targetUrl);
            const data = res.data;

            if (!data || !data.result) return reply("❌ No response from Copilot.");

            await reply(`🤖 *Copilot Reference:*\n\n${data.result}`);

        } catch (e) {
            console.log(e);
            reply("❌ AI Error.");
        }
    });
