/**
 * 👑 DMC MOVIE, TV SERIES & 1-TAP SINHALA SUBTITLE SYSTEM (AUTO-MIND CORE) 👑
 * FEATURES:
 *  - 100% Dynamic Live Scraping (NO Hardcoded Episodes or Arrays - 100% Real-time Auto Mind)
 *  - One Piece Live-Action & Anime Dynamic Episode Resolver
 *  - Universal TV Series Engine (.series / .tv for ANY TV series)
 *  - 1-Tap Subtitle WhatsApp link auto-fill generator for every episode
 *  - Direct Sinhala Subtitle (.srt / .zip) Extractor via Baiscope Redeem API
 *  - Live HD Shorts & Zoro Edits Player (In Picture: Zoro Three Swords, Zero Fear)
 *  - Safe TG Cloud Engine (Zero load on Azure free tier)
 */

const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const yts = require('yt-search');

// Session store for interactive menu selections
if (!global.movieSessions) global.movieSessions = {};

// Helper: 1-Tap WhatsApp Link Generator
function createOneTapLink(botNumber, commandText) {
    const cleanNum = (botNumber || '').split(':')[0].split('@')[0];
    return `https://wa.me/${cleanNum}?text=${encodeURIComponent(commandText)}`;
}

// ─────────────────────────────────────────────────────────────
// 1. SINHALA SUBTITLE EXTRACTOR (Baiscope Live Redeem Engine)
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
// 2. AUTO-MIND DYNAMIC SERIES SCRAPER (Zero Hardcoding)
// ─────────────────────────────────────────────────────────────
async function getLiveSeriesData(query) {
    try {
        // 1. Search for TV Show on Sinhalasub
        const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}`;
        const searchRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });
        const $ = cheerio.load(searchRes.data);

        let showUrl = null;
        let showTitle = null;

        $('a[href*="/tvshows/"]').each((i, el) => {
            const h = $(el).attr('href');
            const t = $(el).text().trim() || $(el).attr('title') || '';
            if (h && !showUrl && !h.endsWith('/tvshows/')) {
                showUrl = h;
                showTitle = t;
            }
        });

        if (!showUrl) {
            // Fallback: search Baiscope for TV episodes
            return await getBaiscopeLiveSeries(query);
        }

        // 2. Fetch the live TV show page and extract ALL seasons and episodes dynamically
        const pageRes = await axios.get(showUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });
        const $p = cheerio.load(pageRes.data);
        const seriesTitle = $p('h1').text().trim() || showTitle;
        const episodes = [];

        $p('a[href*="/episodes/"]').each((i, el) => {
            const link = $p(el).attr('href');
            if (!link) return;

            const sMatch = link.match(/s(\d+)e(\d+)/i) || link.match(/season-(\d+)-episode-(\d+)/i);
            const season = sMatch ? parseInt(sMatch[1], 10) : 1;
            const epNum = sMatch ? parseInt(sMatch[2], 10) : (episodes.length + 1);

            let rawText = $p(el).text().trim().replace(/\s+/g, ' ');
            let epTitle = `Episode ${epNum}`;
            const epNameMatch = rawText.match(/Episode\s*\d+\s*(?:\[[^\]]+\])?/i);
            if (epNameMatch) epTitle = epNameMatch[0];

            if (!episodes.some(e => e.link === link)) {
                episodes.push({
                    season,
                    episode: epNum,
                    title: epTitle,
                    link
                });
            }
        });

        episodes.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);

        return {
            title: seriesTitle,
            showUrl,
            totalEpisodes: episodes.length,
            episodes
        };

    } catch (e) {
        console.error("Live Series Scraper Error:", e.message);
        return null;
    }
}

async function getBaiscopeLiveSeries(query) {
    try {
        const searchUrl = `https://www.baiscope.lk/?s=${encodeURIComponent(query)}`;
        const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        const episodes = [];
        $('article').each((i, el) => {
            const h = $(el).find('a').attr('href') || '';
            const t = $(el).find('a').text().trim().replace(/\s+/g, ' ');
            if (h.includes('/tv/') || t.toLowerCase().includes('s0') || t.toLowerCase().includes('season')) {
                const sMatch = t.match(/\[S(\d+)\s*:\s*E(\d+)\]/i) || h.match(/s(\d+)-e(\d+)/i);
                const season = sMatch ? parseInt(sMatch[1], 10) : 1;
                const epNum = sMatch ? parseInt(sMatch[2], 10) : (i + 1);
                episodes.push({
                    season,
                    episode: epNum,
                    title: t,
                    link: h.startsWith('http') ? h : `https://www.baiscope.lk${h}`
                });
            }
        });
        return {
            title: query,
            showUrl: searchUrl,
            totalEpisodes: episodes.length,
            episodes
        };
    } catch (e) {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// 3. MOVIE SCRAPERS (Sinhalasub, Cinesubz, Baiscope)
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

    return results;
}

// Helper: YouTube Video Downloader for Shorts/Clips
async function fetchYouTubeShortStream(query) {
    try {
        const searchResults = await yts(query);
        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) return null;
        const targetVideo = searchResults.videos[0];

        // Fetch direct stream via Tier 3 Master Safety Net
        const res = await axios.get(`https://apis.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(targetVideo.url)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 20000
        });

        if (res.data && res.data.success && res.data.result?.download_url) {
            return {
                title: res.data.result.title || targetVideo.title,
                download_url: res.data.result.download_url,
                targetUrl: targetVideo.url
            };
        }
    } catch (e) {
        console.error("YouTube Short Fetch Error:", e.message);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// 4. COMMAND: .oplive (Auto-Mind One Piece Hub)
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "oplive",
    alias: ["onepiece", "opnetflix", "zoro"],
    react: "⚔️",
    desc: "Auto-Mind One Piece Live-Action Episodes & HD Shorts",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        const input = q ? q.trim() : "";
        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';

        // Case A: Shorts, Clips, Trailers, Teasers & Recaps (As shown in user's photo!)
        const lowerInput = input.toLowerCase();
        const isTrailerOrTeaser = lowerInput.includes("trailer") || lowerInput.includes("teaser") || lowerInput.includes("recap");
        const isClip = input && !input.toLowerCase().startsWith("ep") && !input.toLowerCase().startsWith("s0") && !/^\d+$/.test(input) && (
            isTrailerOrTeaser ||
            lowerInput.includes("zoro") || 
            lowerInput.includes("sword") || 
            lowerInput.includes("clip") || 
            lowerInput.includes("short") ||
            lowerInput.includes("fear") ||
            lowerInput.includes("fight") ||
            lowerInput.includes("luffy")
        );

        if (isClip) {
            await conn.sendPresenceUpdate('composing', from);
            const searchKeyword = isTrailerOrTeaser 
                ? `ONE PIECE Netflix ${input}`
                : `One Piece Netflix Live Action ${input} HD shorts`;

            await reply(`⚔️ *One Piece Live-Action Video සොයමින් පවතී: "${input}"... (TG Cloud)*`);

            const clipData = await fetchYouTubeShortStream(searchKeyword);
            if (clipData && clipData.download_url) {
                const oneTapSub = botNum ? `\n╰┈➤ 👆 🇸🇮 *1-Tap Subtitle Link:* https://wa.me/${botNum}?text=.sub%20One%20Piece` : '';
                const oneTapMp3 = botNum ? `\n╰┈➤ 👆 🎵 *1-Tap MP3 Link:* https://wa.me/${botNum}?text=.mp3%20${encodeURIComponent(clipData.targetUrl)}` : '';

                return await conn.sendMessage(from, {
                    video: { url: clipData.download_url },
                    caption: `👑 *${clipData.title}* ⚔️\n#onepiece #netflix #liveaction\n\n_Downloaded via ＤＭＣ™ (TG Engine)_` + oneTapMp3 + oneTapSub
                }, { quoted: mek });
            }
        }

        // Case B: Specific Episode (.oplive ep 1, .oplive 1, .oplive s2 ep 3, etc.)
        const isEpisodeRequest = input && (input.toLowerCase().startsWith("ep") || input.toLowerCase().startsWith("s0") || /^\d+$/.test(input));
        if (isEpisodeRequest) {
            const epMatch = input.match(/(?:ep|episode|s0?1e|s)?\s*(\d+)/i);
            const targetEp = epMatch ? parseInt(epMatch[1], 10) : 1;
            const isSeason2 = input.toLowerCase().includes("s2") || input.toLowerCase().includes("s02");
            const targetSeason = isSeason2 ? 2 : 1;
            const seasonStr = `S0${targetSeason}`;
            const epStr = targetEp < 10 ? `0${targetEp}` : `${targetEp}`;

            await conn.sendPresenceUpdate('composing', from);
            await reply(`⚔️ *One Piece Live-Action [${seasonStr}E${epStr}] සොයමින් පවතී... (Auto Mind)*`);

            // Dynamically resolve show data
            const liveData = await getLiveSeriesData("One Piece 2023");
            let foundEp = null;
            if (liveData && liveData.episodes) {
                foundEp = liveData.episodes.find(e => e.season === targetSeason && e.episode === targetEp);
            }

            const epTitle = foundEp ? foundEp.title : `Episode ${targetEp}`;
            const epLink = foundEp ? foundEp.link : `https://sinhalasub.lk/episodes/one-piece-s0${targetSeason}e${epStr}/`;
            const oneTapSub = botNum ? createOneTapLink(botNum, `.sub One Piece ${seasonStr}E${epStr}`) : '';

            // Dynamically extract download servers from the episode page
            let serverLinks = [];
            try {
                const epPageRes = await axios.get(epLink, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 8000
                });
                const $ep = cheerio.load(epPageRes.data);
                $ep('a').each((i, el) => {
                    const h = $ep(el).attr('href') || '';
                    const t = $ep(el).text().trim();
                    if (h.includes('/links/') && (t.includes('DLServer') || t.includes('Telagram') || t.includes('Telegram') || t.includes('Server') || t.includes('Download') || t.includes('Pixeldrain'))) {
                        if (!serverLinks.some(s => s.url === h)) {
                            serverLinks.push({ name: t, url: h });
                        }
                    }
                });
            } catch (e) {}

            let serversText = "";
            if (serverLinks.length > 0) {
                serversText = "📥 *Direct Download Servers:*\n";
                serverLinks.slice(0, 5).forEach(srv => {
                    serversText += `• 🚀 *${srv.name}:* ${srv.url}\n`;
                });
                serversText += "\n";
            }

            const cardMsg = `👑 *ONE PIECE (NETFLIX LIVE-ACTION)* 👑\n` +
                            `🎬 *${seasonStr}E${epStr} - ${epTitle}*\n` +
                            `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                            serversText +
                            `🔗 *Watch / Download Page:*\n${epLink}\n\n` +
                            (oneTapSub ? `👉 🇸🇮 *1-Tap Sinhala Subtitle Link:*\n${oneTapSub}\n\n` : '') +
                            `💡 _ඉහත Subtitle ලින්ක් එක Click කිරීමෙන් ක්ෂණිකව මෙම Episode එකේ Sinhala Subtitle ගොනුව (.zip / .srt) WhatsApp එකට ලබා ගත හැක._\n\n` +
                            `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

            return await conn.sendMessage(from, {
                text: cardMsg
            }, { quoted: mek });
        }

        // Case C: Menu Mode (Live Dynamically Scraped on the fly!)
        await conn.sendPresenceUpdate('composing', from);
        await reply("🔎 *One Piece Live-Action Episodes සජීවීව පරීක්ෂා කරමින් පවතී... (Auto Mind)*");

        const seriesData = await getLiveSeriesData("One Piece 2023");

        if (!seriesData || !seriesData.episodes || seriesData.episodes.length === 0) {
            return reply("❌ *One Piece Episodes සජීවීව සොයාගත නොහැකි විය. කරුණාකර පසුව උත්සාහ කරන්න.*");
        }

        let menuText = `👑 *ONE PIECE (NETFLIX LIVE-ACTION) HUB* 👑\n` +
                       `📺 *Series:* ${seriesData.title}\n` +
                       `📦 *Total Episodes Live:* ${seriesData.totalEpisodes}\n` +
                       `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                       `─────────────────────────\n`;

        // Group dynamically by season
        const seasons = {};
        seriesData.episodes.forEach(e => {
            if (!seasons[e.season]) seasons[e.season] = [];
            seasons[e.season].push(e);
        });

        Object.keys(seasons).forEach(s => {
            menuText += `⚔️ *SEASON ${s} EPISODES:*\n`;
            seasons[s].forEach(e => {
                const subLink = botNum ? createOneTapLink(botNum, `.sub One Piece S0${s}E${e.episode < 10 ? '0' + e.episode : e.episode}`) : '';
                menuText += `• *Ep ${e.episode}:* ${e.title}\n` +
                            `  📥 Download: *.oplive ${s > 1 ? 's' + s + ' ' : ''}ep ${e.episode}*\n` +
                            (subLink ? `  👉 🇸🇮 Subtitle: ${subLink}\n` : '') +
                            `\n`;
            });
        });

        menuText += `─────────────────────────\n` +
                    `🎬 *OFFICIAL TRAILERS & TEASERS (In Photo):*\n` +
                    `• *.oplive season 2 trailer* (Season 2 Trailer)\n` +
                    `• *.oplive season 2 teaser* (Season 2 Teaser 1)\n` +
                    `• *.oplive season 2 teaser 2* (Season 2 Teaser 2)\n` +
                    `• *.oplive season 1 recap* (Season 1 Recap)\n\n` +
                    `⚔️ *POPULAR 4K/HD SHORTS & EDITS:*\n` +
                    `• *.oplive Three Swords Zero Fear* (Zoro in photo)\n` +
                    `• *.oplive zoro fight*\n` +
                    `• *.oplive luffy*\n\n` +
                    `💡 _ඕනෑම Episode එකක් හෝ Trailer එකක් ලබා ගැනීමට අදාළ Command එක හෝ 1-Tap Subtitle Link එක ඔබන්න._`;

        return await conn.sendMessage(from, {
            image: { url: "https://images.alphacoders.com/132/1329583.jpeg" },
            caption: menuText
        }, { quoted: mek });

    } catch (err) {
        console.error("OPLive Auto-Mind Error:", err.message);
        reply("❌ *One Piece තොරතුරු ලබා ගැනීමට නොහැකි විය.*");
    }
});

// ─────────────────────────────────────────────────────────────
// 5. COMMAND: .series / .tv (Universal Auto-Mind for ANY TV Series)
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "series",
    alias: ["tv", "tvshow", "season"],
    react: "📺",
    desc: "Universal Dynamic TV Series & Episode Extractor (Auto Mind)",
    category: "downloader",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) {
            return reply("📺 *කරුණාකර TV Series එකේ නම ලබා දෙන්න!*\n\nඋදාහරණ:\n*.series One Piece*\n*.series Loki*\n*.series Wednesday*\n*.series Stranger Things*");
        }

        await conn.sendPresenceUpdate('composing', from);
        await reply(`🔎 *"${q.trim()}" සඳහා Seasons සහ Episodes සජීවීව සොයමින් පවතී... (Auto Mind)*`);

        const data = await getLiveSeriesData(q.trim());
        if (!data || !data.episodes || data.episodes.length === 0) {
            return reply(`❌ *"${q.trim()}" සඳහා කතාමාලා සොයාගත නොහැකි විය.*`);
        }

        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';

        let menu = `📺 *${data.title}* 📺\n` +
                   `📦 *Total Episodes:* ${data.totalEpisodes}\n` +
                   `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                   `─────────────────────────\n`;

        data.episodes.slice(0, 15).forEach(e => {
            const epCode = `S0${e.season}E${e.episode < 10 ? '0' + e.episode : e.episode}`;
            const subLink = botNum ? createOneTapLink(botNum, `.sub ${q.trim()} ${epCode}`) : '';
            menu += `• *[${epCode}]* ${e.title}\n` +
                    `  🔗 Watch: ${e.link}\n` +
                    (subLink ? `  👉 🇸🇮 Subtitle: ${subLink}\n` : '') +
                    `\n`;
        });

        if (data.episodes.length > 15) {
            menu += `_...සහ තවත් Episodes ${data.episodes.length - 15} ක් ඇත._\n`;
        }

        menu += `─────────────────────────\n` +
                `💡 _Subtitle එකක් ලබා ගැනීමට අදාළ 1-Tap Subtitle Link එක ඔබන්න._`;

        await conn.sendMessage(from, {
            text: menu
        }, { quoted: mek });

    } catch (err) {
        console.error("Series Command Error:", err.message);
        reply("❌ *Series තොරතුරු ලබා ගැනීමට නොහැකි විය.*");
    }
});

// ─────────────────────────────────────────────────────────────
// 6. COMMAND: .movie / .film / .mv / .cinema
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
// 7. COMMAND: .sub / .sinhalasub / .subtitle / .srt
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
            return reply("🇸🇮 *කරුණාකර Subtitle අවශ්‍ය චිත්‍රපටයේ හෝ Episode එකේ නම ලබා දෙන්න!*\n\nඋදාහරණ:\n*.sub Deadpool*\n*.sub One Piece S01E01*\n*.sub Avatar S02E07*");
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
// 8. INTERACTIVE REPLY LISTENER (Selecting Movie by Number)
// ─────────────────────────────────────────────────────────────
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, reply, sender }) => {
    try {
        if (mek.key.fromMe || !body) return;
        const trimmed = body.trim();

        const session = global.movieSessions[sender];
        if (!session || !session.results) return;

        if (Date.now() - session.timestamp > 300000) {
            delete global.movieSessions[sender];
            return;
        }

        const choice = parseInt(trimmed, 10);
        if (isNaN(choice) || choice < 1 || choice > session.results.length) return;

        const selected = session.results[choice - 1];
        delete global.movieSessions[sender];

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
