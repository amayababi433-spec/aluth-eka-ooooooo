const { getContentType } = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { commands } = require('./command');
const { streamToDrive } = require('./lib/drive-engine');
const { addToQueue } = require('./lib/downloader');
const yts = require('yt-search');

// Config load logic
let config;
try { config = require('./settings/config'); } catch (e) { config = require('./config'); }

// Session Stores
if (!global.pendingSessions) global.pendingSessions = {}; // Video
if (!global.movieSessions) global.movieSessions = {};     // Movies
if (!global.songSessions) global.songSessions = {};       // Songs

// Load Plugins
const pluginsDir = path.join(__dirname, 'plugins');
if (fs.existsSync(pluginsDir)) {
    fs.readdirSync(pluginsDir).forEach(file => {
        if (path.extname(file).toLowerCase() === '.js') require(path.join(pluginsDir, file));
    });
}

// YT-DLP Path & Cookies
const YTDLP_PATH = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const COOKIES_PATH = path.join(process.cwd(), 'cookies.txt');

module.exports = async (sock, mek, store) => {
    try {
        if (!mek.message || mek.key.fromMe) return;
        const from = mek.key.remoteJid;
        const sender = mek.key.participant || from;

        // Body Extraction
        const type = getContentType(mek.message);
        let body = '';
        if (type === 'conversation') body = mek.message.conversation;
        else if (type === 'extendedTextMessage') body = mek.message.extendedTextMessage.text;
        else if (type === 'imageMessage') body = mek.message.imageMessage.caption;
        else if (type === 'videoMessage') body = mek.message.videoMessage.caption;
        body = (body || "").trim();
        if (!body) return;

        const reply = (text) => sock.sendMessage(from, { text: text }, { quoted: mek });

        // =================================================================
        // 1. SONG SELECTION (1 = Direct / 2 = Drive)
        // =================================================================
        if (global.songSessions[sender] && ["1", "2"].includes(body)) {
            const session = global.songSessions[sender];
            const choice = body;
            delete global.songSessions[sender];

            // ▶️ CHOICE 1: DIRECT WHATSAPP FILE (Via Queue Engine)
            if (choice === "1") {
                await reply(`👑 *Added to Download Queue...*\nPlease wait! 📥`);

                if (isSongCommand) {
                    let url = q;

                    // 🔍 URL Check & Auto Search
                    if (!url.includes('http')) {
                        await reply(`🔍 Searching for: "${q}"...`);
                        const searchResult = await yts(q);
                        if (searchResult && searchResult.videos.length > 0) {
                            url = searchResult.videos[0].url;
                            await reply(`🎵 Found: *${searchResult.videos[0].title}*\nDownloading...`);
                        } else {
                            return reply("❌ No results found!");
                        }
                    }

                    // දැන් 'url' එකේ තියෙන්නේ නියම YouTube Link එක.
                    // ඒක Downloader එකට යවන්න.
                    addToQueue({ url: url, from: from, mek: mek, reply: reply }, sock, reply);
                }

                // 🔥 අලුත් Engine එකට වැඩේ බාර දෙනවා
                addToQueue({
                    url: session.url,
                    from: from,
                    mek: mek,
                    reply: reply
                }, sock, reply);
            }
            // ▶️ CHOICE 2: GOOGLE DRIVE LINK
            else {
                await reply(`👑 ᴘᴏᴡᴇරෙඩ් ʙʏ ＤＭＣ™ 👑\n☁️ *Processing Drive Link...*`);
                const result = await streamToDrive(session.url, 'audio', 'high', reply);

                if (result.status) {
                    await sock.sendMessage(from, {
                        text: `✅ *Drive Upload Success!* 👑\n\n📄 Name: ${result.name}\n🔗 Link: ${result.link}`
                    }, { quoted: mek });
                } else {
                    reply(`❌ Error: ${result.error}`);
                }
            }
            return;
        }

        // =================================================================
        // 2. VIDEO QUALITY SELECTION
        // =================================================================
        if (global.pendingSessions[sender] && ["1", "2", "3"].includes(body)) {
            const session = global.pendingSessions[sender];
            let quality = body === "1" ? 'max' : (body === "2" ? 'sd' : 'low');
            delete global.pendingSessions[sender];

            await reply(`👑 ᴘᴏᴡᴇරෙඩ් ʙʏ ＤＭＣ™ 👑\n☁️ *Processing Video...*\nQuality: ${quality.toUpperCase()}`);

            const result = await streamToDrive(session.url, 'video', quality, reply);
            if (result.status) {
                await sock.sendMessage(from, {
                    text: `✅ *Drive Upload Success!* 👑\n\n📄 Name: ${result.name}\n📦 Size: ${(result.size / 1024 / 1024).toFixed(2)} MB\n🔗 Link: ${result.link}`
                }, { quoted: mek });
            } else {
                reply(`❌ Error: ${result.error}`);
            }
            return;
        }

        // NORMAL COMMANDS
        const isCmd = body.startsWith('.');
        const command = isCmd ? body.slice(1).trim().split(' ')[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(' ');

        if (isCmd) {
            const cmd = commands.find((c) => c.pattern === command || (c.alias && c.alias.includes(command)));
            if (cmd) await cmd.function(sock, mek, mek, { from, q, reply, args, body, sender, store });
        }

        // Auto Voice
        commands.map(async (cmd) => {
            if (cmd.on === "body" || cmd.on === "text") await cmd.function(sock, mek, mek, { from, q, reply, args, body, sender, store });
        });

    } catch (e) {
        console.log("❌ Main Error:", e);
    }
};
