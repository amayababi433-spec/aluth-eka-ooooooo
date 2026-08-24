const { cmd } = require('../command');
const axios = require('axios');

// =============================================================
//  LYRICS FINDER
// =============================================================
cmd({
    pattern: "lyrics",
    alias: ["lyric"],
    desc: "Get song lyrics",
    category: "search",
    filename: __filename
},
    async (conn, mek, m, { from, q, reply }) => {
        try {
            if (!q) return reply("🎵 Give me a song name.");

            const apiKey = global.APIKeys['https://rest.alyabotpe.xyz']; // Using general key
            const targetUrl = `${global.api.alyabot}/tools/lyrics?text=${encodeURIComponent(q)}&key=${apiKey}`;

            const res = await axios.get(targetUrl);
            const data = res.data;

            if (!data || !data.result || !data.result.lyrics) return reply("❌ Lyrics not found.");

            const info = data.result;
            const msg = `🎵 *LYRICS SEARCH* 🎵\n\n` +
                `📀 *Title:* ${info.title || q}\n` +
                `👤 *Artist:* ${info.artist || "Unknown"}\n\n` +
                `──────────────────\n` +
                `${info.lyrics}\n` +
                `──────────────────\n` +
                `> Powered by DMC™`;

            await conn.sendMessage(from, {
                image: { url: info.image || "https://i.imgur.com/IyH30j8.png" },
                caption: msg
            }, { quoted: mek });

        } catch (e) {
            console.log(e);
            reply("❌ Error finding lyrics.");
        }
    });
