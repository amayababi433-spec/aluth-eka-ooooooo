const { getContentType } = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { commands } = require('./command');
const { streamToDrive } = require('./lib/drive-engine');
const { addToQueue } = require('./lib/downloader'); // Queue එක Import කළා
const yts = require('yt-search'); // Search එක Import කළා

// Config load logic
let config;
try { config = require('./settings/config'); } catch (e) { config = require('./config'); }

// Session Stores
if (!global.pendingSessions) global.pendingSessions = {};
if (!global.movieSessions) global.movieSessions = {};
if (!global.songSessions) global.songSessions = {};

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

        // 🔥 1. COMMAND හඳුනාගැනීම (මේ ටික තමයි අඩුවෙලා තිබුණේ)
        const isCmd = body.startsWith('.');
        const command = isCmd ? body.slice(1).trim().split(' ')[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(' ');

        // 🔥 2. SONG COMMAND CHECK
        const isSongCommand = ['song', 'audio', 'play', 'mp3'].includes(command);

        // =================================================================
        // 🎵 AUTO SONG DOWNLOADER (Queue + Search)
        // =================================================================
        if (isSongCommand) {
            let url = q;
            if (!url) return reply("⚠️ සින්දුවේ නමක් හෝ ලින්ක් එකක් දෙන්න!");

            // URL එකක් නෙවෙයි නම් Search කරන්න
            if (!url.includes('http')) {
                await reply(`🔍 Searching for: "${q}"...`);
                try {
                    const searchResult = await yts(q);
                    if (searchResult && searchResult.videos.length > 0) {
                        url = searchResult.videos[0].url;
                        await reply(`🎵 Found: *${searchResult.videos[0].title}*\nDownloading...`);
                    } else {
                        return reply("❌ No results found!");
                    }
                } catch (e) {
                    return reply("❌ Search Error. Link එකක් දෙන්න.");
                }
            }

            // කෙලින්ම Queue එකට යවනවා (Reply 1/2 අහන්නේ නෑ, Direct එනවා)
            addToQueue({ url: url, from: from, mek: mek, reply: reply }, sock, reply);
            return; // මෙතනින් නවතින්න
        }

        // =================================================================
        // NORMAL COMMANDS RUNNER
        // =================================================================
        if (isCmd) {
            const cmd = commands.find((c) => c.pattern === command || (c.alias && c.alias.includes(command)));
            if (cmd) await cmd.function(sock, mek, mek, { from, q, reply, args, body, sender, store });
        }

    } catch (e) {
        console.log("❌ Main Error:", e);
    }
};
