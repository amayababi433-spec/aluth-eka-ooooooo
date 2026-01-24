const { cmd, commands } = require('../command');
const { streamToDrive } = require('../lib/drive-engine');
const axios = require('axios');
const cheerio = require('cheerio');

// Session Store
if (!global.movieSessions) global.movieSessions = {};

// --- SCRAPER FUNCTIONS ---
async function searchSinhalasub(query) {
    try {
        const { data } = await axios.get(`https://sinhalasub.lk/?s=${query}`);
        const $ = cheerio.load(data);
        let results = [];
        $('.result-item').each((i, el) => {
            if (i < 5) { // Top 5 results
                results.push({
                    title: $(el).find('.title a').text().trim(),
                    link: $(el).find('.title a').attr('href'),
                    date: $(el).find('.meta .date').text().trim()
                });
            }
        });
        return results;
    } catch (e) { return []; }
}

async function searchCinesubz(query) {
    try {
        const { data } = await axios.get(`https://cinesubz.co/?s=${query}`);
        const $ = cheerio.load(data);
        let results = [];
        $('.movie-item-style-2').each((i, el) => {
            if (i < 5) {
                results.push({
                    title: $(el).find('.mv-item-infor h6 a').text().trim(),
                    link: $(el).find('.mv-item-infor h6 a').attr('href'),
                    rating: $(el).find('.rate').text().trim()
                });
            }
        });
        return results;
    } catch (e) { return []; }
}

// --- COMMAND ---
cmd({
    pattern: "movie",
    alias: ["film", "mv"],
    desc: "Download Movies from Sinhalasub/Cinesubz",
    category: "downloader",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, sender }) => {
    try {
        if (!q) return reply("⚠️ ෆිල්ම් එකේ නමක් දෙන්න. (Example: .movie Spider Man)");

        await reply("🔎 *Searching Sinhalasub & Cinesubz...*");

        // 1. Search Logic (Random Switch or Priority)
        let results = await searchSinhalasub(q);
        let source = "Sinhalasub.lk";

        if (results.length === 0) {
            results = await searchCinesubz(q);
            source = "Cinesubz.co";
        }

        if (results.length === 0) return reply("❌ ෆිල්ම් එක හොයාගන්න බැරි වුනා. නම වෙනස් කරලා බලන්න.");

        // 2. Build Menu
        let msg = `🎬 *DMC MOVIE DOWNLOADER* 🎬\n\n🔎 Source: ${source}\n📋 Query: "${q}"\n\n`;
        results.forEach((r, i) => {
            msg += `*${i + 1}.* ${r.title}\n📅 ${r.date || r.rating || ''}\n\n`;
        });
        msg += `_Reply with the number (1-${results.length}) to download._`;

        // 3. Save Session
        global.movieSessions[sender] = { results, step: 'select_movie' };

        return await conn.sendMessage(from, {
            image: { url: "https://telegra.ph/file/9c4768390b1e4a0558169.jpg" }, // Movie Cover Image
            caption: msg
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        reply(`❌ Error: ${e.message}`);
    }
});
