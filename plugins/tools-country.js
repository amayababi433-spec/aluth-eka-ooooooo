const { cmd } = require('../command');
const axios = require('axios');

// =============================================================
//  COUNTRY INFO
// =============================================================
cmd({
    pattern: "country",
    desc: "Get information about a country",
    category: "other",
    filename: __filename
},
    async (conn, mek, m, { from, q, reply }) => {
        try {
            if (!q) return reply("🌍 Please provide a country name.");

            const apiKey = global.APIKeys['https://rest.alyabotpe.xyz'];
            const targetUrl = `${global.api.alyabot}/tools/country?name=${encodeURIComponent(q)}&key=${apiKey}`;

            const res = await axios.get(targetUrl);
            const data = res.data;

            if (!data || !data.result) return reply("❌ Country not found.");

            const info = data.result;
            let txt = `🌍 *country info: ${q.toUpperCase()}*\n\n`;

            // Assuming typical API response structure, adjust fields as needed
            if (info.name) txt += `🏳️ *Name:* ${info.name}\n`;
            if (info.capital) txt += `🏛️ *Capital:* ${info.capital}\n`;
            if (info.population) txt += `👥 *Population:* ${info.population}\n`;
            if (info.region) txt += `📍 *Region:* ${info.region}\n`;
            if (info.currency) txt += `💰 *Currency:* ${info.currency}\n`;
            if (info.languages) txt += `🗣️ *Languages:* ${info.languages}\n`;

            await conn.sendMessage(from, {
                image: { url: info.flag || "https://i.imgur.com/IyH30j8.png" },
                caption: txt
            }, { quoted: mek });

        } catch (e) {
            reply("❌ Error fetching country info.");
        }
    });
