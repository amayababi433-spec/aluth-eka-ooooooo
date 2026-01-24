const { cmd } = require('../command');
const axios = require('axios');

// =============================================================
//  CHATGPT (Stellar)
// =============================================================
cmd({
    pattern: "gpt",
    alias: ["chatgpt", "openai"],
    desc: "Chat with ChatGPT (Stellar Engine)",
    category: "ai",
    filename: __filename
},
    async (conn, mek, m, { from, q, reply }) => {
        try {
            if (!q) return reply("🤖 Hi! How can I help you?");

            const apiKey = global.APIKeys['https://api.stellarwa.xyz'];
            const targetUrl = `${global.api.stellar}/ai/chatgpt?q=${encodeURIComponent(q)}&key=${apiKey}`;

            const res = await axios.get(targetUrl);
            const data = res.data;

            // Assuming response structure: { status: true, result: "..." } or similar
            const answer = data.result || data.message || data.data;

            if (!answer) return reply("❌ No response from AI.");

            await reply(`🤖 *ChatGPT:*\n\n${answer}`);

        } catch (e) {
            console.error(e);
            reply("❌ AI Error.");
        }
    });
