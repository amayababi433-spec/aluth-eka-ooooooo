const { google } = require('googleapis');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const path = require('path');
const fs = require('fs');

// =========================================================
// 🌐 PROXY SETTINGS (Optional)
// =========================================================
const PROXY_URL = '';

// =========================================================
// 🔐 GOOGLE DRIVE CREDENTIALS
// =========================================================
const CLIENT_ID = '327496389009-f63uhfqtkhd2th5t82u755dtvv7tddra.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04-NUW9xju25-CgYIARAAGAQSNwF-L9IrefJM6hflUKllmq6oqaIEYp328GxhyCfw084o4LHaiG4znAnCoAd7JwWogkAXDHMR1dg';
const MAIN_ROOT_ID = '1U2dzeihKajwB-zrJ3okhjTK_ZoCqIynI';

// PATHS
const YTDLP_PATH = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const COOKIES_PATH = path.join(process.cwd(), 'cookies.txt');

// AUTH
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// 📂 FOLDER MANAGER
async function getFolderID(folderName) {
    try {
        const res = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${MAIN_ROOT_ID}' in parents and trashed=false`,
            fields: 'files(id, name)',
        });
        if (res.data.files.length > 0) return res.data.files[0].id;

        const file = await drive.files.create({
            resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [MAIN_ROOT_ID] },
            fields: 'id'
        });
        return file.data.id;
    } catch (err) {
        return MAIN_ROOT_ID;
    }
}

// 🚀 MAIN STREAMING ENGINE
async function streamToDrive(url, type, quality, reply) {
    try {
        const input = url.startsWith('http') ? url : `ytsearch1:${url}`;

        // 1. GET TITLE (Fastest Method)
        let title = `DMC_Media_${Date.now()}`;
        try {
            const infoArgs = [
                '--get-filename', '-o', '%(title)s',
                '--no-warnings',
                '--force-ipv6', // IPv6 for Title Check too
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                input
            ];
            if (PROXY_URL) infoArgs.push('--proxy', PROXY_URL);

            const infoProc = spawn(YTDLP_PATH, infoArgs);
            let tempTitle = '';
            infoProc.stdout.on('data', c => tempTitle += c);
            await new Promise((resolve) => infoProc.on('close', resolve));
            if (tempTitle.trim()) title = tempTitle.trim().replace(/[^\w\s-]/gi, '');
        } catch (e) { }

        const filename = `${title}.${type === 'audio' ? 'mp3' : 'mp4'}`;
        const folderName = type === 'audio' ? 'DMC_Songs' : 'DMC_Movies';
        const targetFolderID = await getFolderID(folderName);

        await reply(`🚀 *Cloud Pipe Started...*\n📂 Folder: ${folderName}\n🎞️ File: ${filename}`);

        // 2. CONFIGURE YT-DLP (SPEED & VIDEO FIX) ⚡
        const args = [
            input, '-o', '-',
            '--no-playlist',
            '--no-check-certificates',
            '--force-ipv6', // 🔥 BLOCK BYPASS (Important)
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--referer', 'https://www.youtube.com/',
            '--no-progress',
            '--no-warnings',
            '--quiet',
            // 🔥 SPEED BOOSTERS
            '--buffer-size', '16k', // Optimize Buffer
            '--http-chunk-size', '10M'
        ];

        if (PROXY_URL) args.push('--proxy', PROXY_URL);
        if (fs.existsSync(COOKIES_PATH)) args.push('--cookies', COOKIES_PATH);

        // 3. SMART QUALITY SELECTION (VIDEO FIX) 🎥
        // මෙතන තමයි වෙනස. අපි Video+Audio එකට තියෙන Format බලෙන් ඉල්ලනවා.
        if (type === 'audio') {
            args.push('-f', 'bestaudio/best');
        } else {
            // Video ඉල්ලද්දි "තනි ෆයිල්" (pre-merged) එව්වා ඉල්ලනවා (18, 22). 
            // නැත්නම් 720p ට අඩු ඒවා ගන්නවා. (1080p ගත්තොත් RAM එක පිරිලා හිර වෙනවා)
            if (quality === 'low') args.push('-f', '18/worst'); // 360p (Fastest)
            else args.push('-f', '22/18/best[height<=720][ext=mp4]/best'); // 720p Max (Speed & Stability)
        }

        // 4. START STREAM
        const ytProc = spawn(YTDLP_PATH, args);
        const pass = new PassThrough();

        // Timeout 5 Minutes
        const timeout = setTimeout(() => {
            ytProc.kill();
        }, 300000);

        ytProc.stdout.pipe(pass);

        ytProc.on('close', () => {
            clearTimeout(timeout);
        });

        // 5. UPLOAD
        const res = await drive.files.create({
            requestBody: { name: filename, parents: [targetFolderID] },
            media: { mimeType: type === 'audio' ? 'audio/mpeg' : 'video/mp4', body: pass },
            fields: 'webViewLink, size'
        });

        if (parseInt(res.data.size) < 1000) {
            return { status: false, error: "Download Failed. YouTube Blocked IP." };
        }

        return { status: true, link: res.data.webViewLink, name: filename, size: res.data.size };

    } catch (e) {
        console.error("Stream Error:", e);
        return { status: false, error: e.message };
    }
}

module.exports = { streamToDrive };
