/**
 * 👑 DMC MOVIE, TV SERIES & 1-TAP SINHALA SUBTITLE SYSTEM 👑
 * FEATURES:
 *  - Sinhala Subtitles (.srt / .zip) directly from Baiscope/Sinhalasub
 *  - 1-Tap Subtitle WhatsApp link auto-fill generator
 *  - Movies & TV Series Search (Hollywood, Bollywood, Kollywood, Sinhala, 2026 releases)
 *  - High-Speed TG Cloud Engine (Keeps Azure Free Tier light and safe)
 */

const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');

// Session store for interactive menu selections
if (!global.movieSessions) global.movieSessions = {};

// Helper: 1-Tap WhatsApp Link Generator
function createOneTapLink(botNumber, commandText) {
    const cleanNum = (botNumber || '').split(':')[0].split('@')[0];
    return `https://wa.me/${cleanNum}?text=${encodeURIComponent(commandText)}`;
}

// ─────────────────────────────────────────────────────────────
// 1. SINHALA SUBTITLE EXTRACTOR (Baiscope Reverse-Engineered Engine)
// ─────────────────────────────────────────────────────────────
async function fetchSinhalaSubtitle(query) {
    try {
        const searchUrl = `https://www.baiscope.lk/?s=${encodeURIComponent(query)}`;
        const searchRes = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 12000
        });

        const $ = cheerio.load(searchRes.data);
        const posts = [];
        $('article').each((i, el) => {
            const link = $(el).find('a').attr('href');
            const title = $(el).find('a').text().trim().replace(/\s+/g, ' ');
            if (link && title && i < 4) {
                const fullUrl = link.startsWith('http') ? link : `https://www.baiscope.lk${link}`;
                posts.push({ title, url: fullUrl });
            }
        });

        if (posts.length === 0) return null;

        const targetPost = posts[0];

        // Fetch post page to locate download gate
        const postRes = await axios.get(targetPost.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            timeout: 12000
        });

        const $p = cheerio.load(postRes.data);
        let downloadGateUrl = null;
        $p('a').each((i, el) => {
            const href = $p(el).attr('href') || '';
            if (href.includes('/download/') && !downloadGateUrl) {
                downloadGateUrl = href.startsWith('http') ? href : `https://www.baiscope.lk${href}`;
            }
        });

        if (!downloadGateUrl) return null;

        // Fetch download gate page
        const gateRes = await axios.get(downloadGateUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': targetPost.url
            },
            timeout: 12000
        });

        const $g = cheerio.load(gateRes.data);
        const gate = $g('[data-gate]');
        const id = Number(gate.attr('data-id'));
        const slug = gate.attr('data-slug') || '';
        const wait = Number(gate.attr('data-wait')) || 5;
        const token = gate.attr('data-token') || '';

        if (!token || !id) return null;

        // Wait countdown requirement
        await new Promise(r => setTimeout(r, (wait + 1) * 1000));

        // Redeem download ticket
        const redeemRes = await axios.post('https://www.baiscope.lk/api/download/redeem', {
            token,
            id,
            post: slug
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': downloadGateUrl,
                'Origin': 'https://www.baiscope.lk',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        if (redeemRes.data && redeemRes.data.data?.url) {
            const relUrl = redeemRes.data.data.url;
            const fullFileUrl = relUrl.startsWith('http') ? relUrl : `https://www.baiscope.lk${relUrl}`;
            const fileName = redeemRes.data.data.file_name || `${query.replace(/[^\w\s-]/gi, '')}_SinhalaSub.zip`;
            const fileSize = redeemRes.data.data.file_size || 0;

            // Fetch the actual subtitle file buffer directly
            const fileRes = await axios.get(fullFileUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Referer': downloadGateUrl
                },
                responseType: 'arraybuffer',
                timeout: 20000
            });

            return {
                title: targetPost.title,
                fileName,
                fileSize: fileSize || fileRes.data.length,
                buffer: Buffer.from(fileRes.data)
            };
        }
    } catch (e) {
        console.error("Subtitle Fetch Error:", e.message);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// 2. MOVIE SCRAPERS (Sinhalasub, Cinesubz, Baiscope)
// ─────────────────────────────────────────────────────────────
async function searchMoviesMulti(query) {
    let results = [];

    // Search Baiscope
    try {
        const res = await axios.get(`https://www.baiscope.lk/?s=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        $('article').each((i, el) => {
            if (i < 3) {
                const title = $(el).find('a').text().trim().replace(/\s+/g, ' ');
                const link = $(el).find('a').attr('href');
                if (title && link) {
                    results.push({
                        title,
                        link: link.startsWith('http') ? link : `https://www.baiscope.lk${link}`,
                        source: 'Baiscope.lk'
                    });
                }
            }
        });
    } catch (e) {}

    // Search Sinhalasub
    try {
        const res = await axios.get(`https://sinhalasub.lk/?s=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        $('a[href*="/movies/"], a[href*="/tvshows/"]').each((i, el) => {
            const h = $(el).attr('href');
            const t = $(el).text().trim() || $(el).attr('title') || '';
            if (h && t && t.length > 3 && !results.some(r => r.link === h) && results.length < 6) {
                results.push({
                    title: t,
                    link: h,
                    source: 'Sinhalasub.lk'
                });
            }
        });
    } catch (e) {}

    // Search Cinesubz
    if (results.length < 3) {
        try {
            const res = await axios.get(`https://cinesubz.co/?s=${encodeURIComponent(query)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
            const $ = cheerio.load(res.data);
            $('a[href*="/movies/"], a[href*="/tvshows/"]').each((i, el) => {
                const h = $(el).attr('href');
                const t = $(el).text().trim() || $(el).attr('title') || '';
                if (h && t && t.length > 3 && !results.some(r => r.link === h) && results.length < 6) {
                    results.push({
                        title: t,
                        link: h,
                        source: 'Cinesubz.co'
                    });
                }
            });
        } catch (e) {}
    }

    return results;
}

// ─────────────────────────────────────────────────────────────
// 3. COMMAND: .movie / .film / .mv / .cinema
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "movie",
    alias: ["film", "mv", "cinema", "cinedl"],
    desc: "Search & Download Movies, TV Series & 1-Tap Subtitles",
    category: "downloader",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, sender }) => {
    try {
        if (!q) {
            return reply("🎬 *කරුණාකර චිත්‍රපටයේ හෝ කතා මාලාවේ නම ලබා දෙන්න!*\n\nඋදාහරණ:\n*.movie Avatar*\n*.movie Deadpool*\n*.movie One Piece*");
        }

        await conn.sendPresenceUpdate('composing', from);
        await reply("🔎 *Movies & TV Series සොයමින් පවතී... (TG Cloud)*");

        const query = q.trim();
        const results = await searchMoviesMulti(query);

        if (!results || results.length === 0) {
            return reply(`❌ *"${query}" සඳහා චිත්‍රපට හෝ කතාමාලා කිසිවක් සොයාගත නොහැකි විය.*`);
        }

        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';

        let menuText = `🎬 *DMC MOVIE & SERIES HUB* 🎬\n` +
                       `📋 *Query:* "${query}"\n` +
                       `⚡ *Engine:* TG Cloud\n\n` +
                       `─────────────────────────\n`;

        results.slice(0, 5).forEach((item, idx) => {
            const oneTapSub = botNum ? createOneTapLink(botNum, `.sub ${item.title}`) : '';
            menuText += `*${idx + 1}.* 🎥 *${item.title}*\n` +
                        `🌐 *Source:* ${item.source}\n` +
                        (oneTapSub ? `👉 🇸🇮 *1-Tap Subtitle:* ${oneTapSub}\n` : '') +
                        `\n`;
        });

        menuText += `─────────────────────────\n` +
                    `_බාගත කිරීමට හෝ සබැඳි ලබා ගැනීමට අදාළ අංකය (1-${Math.min(5, results.length)}) Reply කරන්න._\n` +
                    `_නැතහොත් කෙලින්ම Subtitle ලබා ගැනීමට 1-Tap Link එක ඔබන්න._`;

        // Save session for interactive reply
        global.movieSessions[sender] = {
            results: results.slice(0, 5),
            timestamp: Date.now()
        };

        return await conn.sendMessage(from, {
            text: menuText
        }, { quoted: mek });

    } catch (err) {
        console.error("Movie Command Error:", err.message);
        reply("❌ *චිත්‍රපට තොරතුරු ලබා ගැනීමට නොහැකි විය.*");
    }
});

// ─────────────────────────────────────────────────────────────
// 4. COMMAND: .sub / .sinhalasub / .subtitle / .srt
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "sub",
    alias: ["sinhalasub", "subtitle", "srt", "subtitles"],
    desc: "Direct Sinhala Subtitle Downloader (.srt / .zip)",
    category: "downloader",
    react: "🇸🇮",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) {
            return reply("🇸🇮 *කරුණාකර Subtitle අවශ්‍ය චිත්‍රපටයේ නම ලබා දෙන්න!*\n\nඋදාහරණ:\n*.sub Deadpool*\n*.sub Avatar S02E07*\n*.sub One Piece*");
        }

        await conn.sendPresenceUpdate('composing', from);
        await reply(`⏳ *"${q.trim()}" සඳහා සිංහල උපසිරැසි (Sinhala Subtitle) සකසමින් පවතී... (TG Cloud)*`);

        const subData = await fetchSinhalaSubtitle(q.trim());

        if (!subData || !subData.buffer) {
            return reply(`❌ *"${q.trim()}" සඳහා Sinhala Subtitle සොයාගත නොහැකි විය. කරුණාකර නම නිවැරදිව පරීක්ෂා කරන්න.*`);
        }

        const sizeKb = (subData.fileSize / 1024).toFixed(1);

        await conn.sendMessage(from, {
            document: subData.buffer,
            mimetype: 'application/zip',
            fileName: subData.fileName,
            caption: `👑 *${subData.title}* 👑\n\n` +
                     `🇱🇰 *Sinhala Subtitles Downloaded*\n` +
                     `📦 *File:* ${subData.fileName} (${sizeKb} KB)\n\n` +
                     `_Downloaded via ＤＭＣ™ (TG Cloud Subtitles)_`
        }, { quoted: mek });

    } catch (err) {
        console.error("Sub Command Error:", err.message);
        reply("❌ *Subtitle ගොනුව ලබා ගැනීමට නොහැකි විය.*");
    }
});

// ─────────────────────────────────────────────────────────────
// 5. INTERACTIVE REPLY LISTENER (Selecting Movie by Number)
// ─────────────────────────────────────────────────────────────
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, reply, sender }) => {
    try {
        if (mek.key.fromMe || !body) return;
        const trimmed = body.trim();

        // Check if numeric reply (1-5) and valid session exists
        const session = global.movieSessions[sender];
        if (!session || !session.results) return;

        // Expire session after 5 minutes
        if (Date.now() - session.timestamp > 300000) {
            delete global.movieSessions[sender];
            return;
        }

        const choice = parseInt(trimmed, 10);
        if (isNaN(choice) || choice < 1 || choice > session.results.length) return;

        const selected = session.results[choice - 1];
        delete global.movieSessions[sender]; // Clear after selection

        await conn.sendPresenceUpdate('composing', from);
        await reply(`⏳ *"${selected.title}" සඳහා තොරතුරු සහ ලින්ක් ලබා ගනිමින් පවතී... (TG Cloud)*`);

        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';
        const oneTapSub = botNum ? createOneTapLink(botNum, `.sub ${selected.title}`) : '';

        let responseMsg = `👑 *${selected.title}* 👑\n` +
                          `🌐 *Source:* ${selected.source}\n` +
                          `🔗 *Web Page:* ${selected.link}\n` +
                          `⚡ *Engine:* TG Cloud\n\n`;

        if (oneTapSub) {
            responseMsg += `👉 🇸🇮 *1-Tap Sinhala Subtitle Link:*\n${oneTapSub}\n\n`;
        }

        responseMsg += `💡 _ඉහත Subtitle ලින්ක් එක Click කිරීමෙන් ක්ෂණිකව Sinhala Subtitle ගොනුව (.zip) ලබා ගත හැක._\n\n` +
                       `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

        await conn.sendMessage(from, {
            text: responseMsg
        }, { quoted: mek });

    } catch (err) {
        console.error("Movie Reply Listener Error:", err.message);
    }
});
