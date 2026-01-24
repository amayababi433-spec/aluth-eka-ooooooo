const { cmd } = require('../command');
const axios = require('axios');
const fs = require('fs');

// =============================================================
//  TEXT TO IMAGE (TTI)
// =============================================================
cmd({
    pattern: "tti",
    alias: ["texttoimage", "imagine"],
    desc: "Generate AI images from text",
    category: "ai",
    filename: __filename
},
    async (conn, mek, m, { from, q, reply }) => {
        try {
            if (!q) return reply("🎨 Please describe the image you want (e.g., .tti cat in space)");

            const targetUrl = `${global.api.alyabot}/ai/texttoimage?prompt=${encodeURIComponent(q)}&key=${global.APIKeys['tti']}`;
            await conn.sendMessage(from, { react: { text: "🎨", key: mek.key } });

            const res = await axios.get(targetUrl);
            const data = res.data;

            // Error handling 
            if (!data || data.status === false) return reply("❌ Error generating image.");

            // Output might be URL or Base64 depending on API version
            // Assuming JSON response with 'url' or similar
            const imageUrl = data.url || data.result;

            if (!imageUrl) return reply("❌ No image received.");

            await conn.sendMessage(from, {
                image: { url: imageUrl },
                caption: `🎨 *AI Image Generator*\n\n"${q}"\n\n> Powered by DMC™`
            }, { quoted: mek });

        } catch (e) {
            console.error(e);
            reply("❌ Service unavailable.");
        }
    });
