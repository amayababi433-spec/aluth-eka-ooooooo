/**
 * 👑 DMC ONE PIECE (NETFLIX LIVE-ACTION & ANIME) DEDICATED HUB 👑
 * FEATURES:
 *  - 1-Click HD Shorts & Zoro Edits (In Picture: Zoro Three Swords, Zero Fear)
 *  - Full Episode Browser (Season 1 Episodes 1-8 & Season 2 Episodes)
 *  - Auto 1-Tap Sinhala Subtitle Link for every episode
 *  - High-Speed TG Cloud Engine (Zero load on Azure free tier)
 */

const { cmd } = require('../command');
const { fetchMediaWithFailover, sendMediaSafely, encodeInvisible } = require('./downloader');
const yts = require('yt-search');

// Season 1 Live-Action Episode Guide
const SEASON_1_EPISODES = [
    { ep: 1, title: "Romance Dawn", link: "https://sinhalasub.lk/episodes/one-piece-s01e01/" },
    { ep: 2, title: "The Man in the Straw Hat", link: "https://sinhalasub.lk/episodes/one-piece-s01e02/" },
    { ep: 3, title: "Tell No Tales", link: "https://sinhalasub.lk/episodes/one-piece-s01e03/" },
    { ep: 4, title: "The Pirates Are Coming", link: "https://sinhalasub.lk/episodes/one-piece-s01e04/" },
    { ep: 5, title: "Eat at Baratie!", link: "https://sinhalasub.lk/episodes/one-piece-s01e05/" },
    { ep: 6, title: "The Chef and the Chore Boy", link: "https://sinhalasub.lk/episodes/one-piece-s01e06/" },
    { ep: 7, title: "The Girl with the Sawfish Tattoo", link: "https://sinhalasub.lk/episodes/one-piece-s01e07/" },
    { ep: 8, title: "Worst in the East", link: "https://sinhalasub.lk/episodes/one-piece-s01e08/" }
];

// Helper: 1-Tap WhatsApp Link Generator
function createOneTapLink(botNumber, commandText) {
    const cleanNum = (botNumber || '').split(':')[0].split('@')[0];
    return `https://wa.me/${cleanNum}?text=${encodeURIComponent(commandText)}`;
}

cmd({
    pattern: "oplive",
    alias: ["onepiece", "opnetflix", "zoro"],
    react: "⚔️",
    desc: "One Piece Netflix Live-Action Episodes & HD Shorts",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        const input = q ? q.trim() : "";
        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';

        // ─────────────────────────────────────────────────────────────
        // 1. MENU MODE (No query supplied: Show all episodes & clips)
        // ─────────────────────────────────────────────────────────────
        if (!input) {
            let menuText = `👑 *ONE PIECE (NETFLIX LIVE-ACTION) HUB* 👑\n` +
                           `⚡ *Engine:* TG Cloud\n\n` +
                           `⚔️ *SEASON 1 (Episodes 1 - 8):*\n`;

            SEASON_1_EPISODES.forEach(item => {
                const subLink = botNum ? createOneTapLink(botNum, `.sub One Piece S01E0${item.ep}`) : '';
                menuText += `*Ep ${item.ep}:* ${item.title}\n` +
                            `  📥 Download: *.oplive ep ${item.ep}*\n` +
                            (subLink ? `  👉 🇸🇮 Subtitle: ${subLink}\n` : '') +
                            `\n`;
            });

            menuText += `⚔️ *SEASON 2 (2026 Releases):*\n` +
                        `• Season 2 Episode 1-8: *.oplive s2 ep 1*\n\n` +
                        `⚔️ *POPULAR 4K/HD SHORTS & EDITS:*\n` +
                        `• *.oplive Three Swords Zero Fear* (Zoro in photo)\n` +
                        `• *.oplive zoro fight*\n` +
                        `• *.oplive luffy*\n\n` +
                        `💡 _ඕනෑම Episode එකක් හෝ Clip එකක් ලබා ගැනීමට ඉහත Command එකක් හෝ 1-Tap Subtitle Link එක ඔබන්න._`;

            return await conn.sendMessage(from, {
                image: { url: "https://images.alphacoders.com/132/1329583.jpeg" }, // One Piece Live Action poster
                caption: menuText
            }, { quoted: mek });
        }

        // ─────────────────────────────────────────────────────────────
        // 2. EPISODE MODE (.oplive ep 1, .oplive 1, .oplive s01e01, etc.)
        // ─────────────────────────────────────────────────────────────
        const epMatch = input.match(/(?:ep|episode|s0?1e|s)?\s*(\d+)/i);
        const isExplicitEpisode = input.toLowerCase().startsWith("ep") || input.toLowerCase().startsWith("s0") || /^\d+$/.test(input);

        if (isExplicitEpisode && epMatch) {
            const epNum = parseInt(epMatch[1], 10);
            const isSeason2 = input.toLowerCase().includes("s2") || input.toLowerCase().includes("s02");
            const seasonStr = isSeason2 ? "S02" : "S01";
            const paddedEp = epNum < 10 ? `0${epNum}` : `${epNum}`;
            const epInfo = !isSeason2 && epNum >= 1 && epNum <= 8 ? SEASON_1_EPISODES[epNum - 1] : null;
            const epTitle = epInfo ? epInfo.title : `Episode ${epNum}`;

            await conn.sendPresenceUpdate('composing', from);
            await reply(`⚔️ *One Piece Live-Action [${seasonStr}E${paddedEp}] සකසමින් පවතී... (TG Cloud)*`);

            const oneTapSub = botNum ? createOneTapLink(botNum, `.sub One Piece ${seasonStr}E${paddedEp}`) : '';
            const webLink = isSeason2 
                ? `https://sinhalasub.lk/episodes/one-piece-s02e${paddedEp}/`
                : (epInfo ? epInfo.link : `https://sinhalasub.lk/episodes/one-piece-s01e${paddedEp}/`);

            const cardMsg = `👑 *ONE PIECE (NETFLIX LIVE-ACTION)* 👑\n` +
                            `🎬 *${seasonStr}E${paddedEp} - ${epTitle}*\n` +
                            `⚡ *Engine:* TG Cloud\n\n` +
                            `🔗 *Watch / Download Page:*\n${webLink}\n\n` +
                            (oneTapSub ? `👉 🇸🇮 *1-Tap Sinhala Subtitle Link:*\n${oneTapSub}\n\n` : '') +
                            `💡 _ඉහත Subtitle ලින්ක් එක Click කිරීමෙන් ක්ෂණිකව මෙම Episode එකේ Sinhala Subtitle ගොනුව (.zip / .srt) WhatsApp එකට ලබා ගත හැක._\n\n` +
                            `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

            return await conn.sendMessage(from, {
                text: cardMsg
            }, { quoted: mek });
        }

        // ─────────────────────────────────────────────────────────────
        // 3. SHORTS / CLIPS MODE (In Picture: Zoro Three Swords, Zero Fear!)
        // ─────────────────────────────────────────────────────────────
        await conn.sendPresenceUpdate('composing', from);
        await reply(`⚔️ *One Piece Live-Action Clip සොයමින් පවතී: "${input}"...*`);

        const searchQuery = `One Piece Netflix Live Action ${input} HD shorts`;
        const searchResults = await yts(searchQuery);

        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
            return reply(`❌ *"One Piece ${input}" සඳහා Video Clip එකක් සොයාගත නොහැකි විය.*`);
        }

        const targetVideo = searchResults.videos[0];
        const videoData = await fetchMediaWithFailover(targetVideo.url, 'video');

        if (!videoData || !videoData.download_url) {
            return reply("❌ *Direct Video Link එක ලබා ගැනීමට නොහැකි විය.*");
        }

        const cleanTitle = videoData.title || targetVideo.title || "One Piece Live Action";
        const secretCode = encodeInvisible("DMC_AUDIO:" + targetVideo.url);
        const swipePrompt = "\n\n╰┈➤ ⏩ 🎵 *MP3 Audio සඳහා මේ මැසේජ් එක දකුණට Swipe කරන්න*" + secretCode;
        const oneTapPrompt = botNum ? `\n╰┈➤ 👆 🎵 *1-Tap MP3 Link:* https://wa.me/${botNum}?text=.mp3%20${encodeURIComponent(targetVideo.url)}` : '';
        const oneTapSub = botNum ? `\n╰┈➤ 👆 🇸🇮 *1-Tap Subtitle Link:* https://wa.me/${botNum}?text=.sub%20One%20Piece` : '';

        const isLargeFile = videoData.size_bytes && videoData.size_bytes > 55 * 1024 * 1024;
        const sizeMb = videoData.size_bytes ? (videoData.size_bytes / (1024 * 1024)).toFixed(1) + " MB" : "";
        const sizeTag = sizeMb ? `\n📦 *File Size:* ${sizeMb}` : "";

        if (isLargeFile) {
            await sendMediaSafely(conn, from, {
                document: { url: videoData.download_url },
                mimetype: 'video/mp4',
                fileName: `${cleanTitle.replace(/[^\w\s-]/gi, '')}.mp4`,
                caption: `👑 *${cleanTitle}* ⚔️` + sizeTag + `\n#shorts #onepiece #netflix\n\n_Downloaded via ＤＭＣ™ (TG Engine)_` + swipePrompt + oneTapPrompt + oneTapSub
            }, { quoted: mek });
        } else {
            // Sends directly playing in WhatsApp Video Player (just like the user's photo!)
            await sendMediaSafely(conn, from, {
                video: { url: videoData.download_url },
                caption: `👑 *${cleanTitle}* ⚔️😤` + sizeTag + `\n#shorts #onepiece #netflix\n\n_Downloaded via ＤＭＣ™ (TG Engine)_` + swipePrompt + oneTapPrompt + oneTapSub
            }, { quoted: mek });
        }

    } catch (err) {
        console.error("One Piece Hub Error:", err.message);
        reply("❌ *One Piece Video හෝ Episode ලබා ගැනීමට නොහැකි විය.*");
    }
});
