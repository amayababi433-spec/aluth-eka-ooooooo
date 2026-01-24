const { cmd } = require('../command');
const axios = require('axios');
const fs = require('fs');

// =============================================================
//  IMAGE UPSCALE
// =============================================================
cmd({
    pattern: "upscale",
    alias: ["hd", "enhance"],
    desc: "Enhance image quality to HD",
    category: "editor",
    filename: __filename
},
    async (conn, mek, m, { from, reply, quoted }) => {
        try {
            if (!quoted) return reply("📸 Reply to an image to upscale.");

            // Check if quoted is image
            const mime = quoted.mimetype || "";
            if (!mime.startsWith("image")) return reply("📸 Only images supported.");

            await conn.sendMessage(from, { react: { text: "⚡", key: mek.key } });

            // Download Media
            const media = await conn.downloadMediaMessage(quoted);

            // Prepare FormData
            const FormData = require('form-data');
            const form = new FormData();
            form.append('image', media, { filename: 'image.jpg' });

            const apiKey = global.APIKeys['https://rest.alyabotpe.xyz'];
            const targetUrl = `${global.api.alyabot}/tools/upscale?key=${apiKey}`;

            // Keep-Alive Agent for upload reliability
            const https = require('https');
            const agent = new https.Agent({ keepAlive: true });

            const res = await axios.post(targetUrl, form, {
                headers: {
                    ...form.getHeaders()
                },
                httpsAgent: agent
            });

            const data = res.data;
            if (!data || !data.status) return reply("❌ Upscaling failed.");

            await conn.sendMessage(from, {
                image: { url: data.url || data.result },
                caption: "✨ *AI Enhanced Image* ✨"
            }, { quoted: mek });

        } catch (e) {
            console.error(e);
            reply("❌ Error up-scaling.");
        }
    });
