#!/usr/bin/env node

/**
 * 🎬 Universal Video + Subtitle Fast Encoder & Sync Tool
 * Powered by FFmpeg (ffmpeg-static)
 * 
 * Usage:
 *   1. Soft-Sub Muxing (Fastest - 5 to 10 Seconds, 0% Quality Loss):
 *      node tools/encode_sub.js "movie.mp4" "sub.srt"
 * 
 *   2. With Time Shift (Fix out-of-sync subtitles by +/- seconds):
 *      node tools/encode_sub.js "movie.mp4" "sub.srt" --shift 3.5
 *      node tools/encode_sub.js "movie.mp4" "sub.srt" --shift -2.0
 * 
 *   3. Hard-Sub Burn-in (Permanently burn subtitles into video picture):
 *      node tools/encode_sub.js "movie.mp4" "sub.srt" --hardsub
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let ffmpegPath = require('ffmpeg-static');
if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    ffmpegPath = 'ffmpeg';
}

function parseArgs() {
    const args = process.argv.slice(2);
    let videoPath = null;
    let srtPath = null;
    let shiftSec = 0;
    let isHardsub = false;
    let outputPath = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--shift' && args[i + 1]) {
            shiftSec = parseFloat(args[++i]);
        } else if (arg === '--hardsub') {
            isHardsub = true;
        } else if (arg === '--out' && args[i + 1]) {
            outputPath = args[++i];
        } else if (!videoPath) {
            videoPath = arg;
        } else if (!srtPath) {
            srtPath = arg;
        }
    }

    return { videoPath, srtPath, shiftSec, isHardsub, outputPath };
}

function shiftSrt(srtContent, offsetSeconds) {
    const offsetMs = Math.round(offsetSeconds * 1000);

    function toMs(timeStr) {
        const [hms, ms] = timeStr.trim().split(/[,.]/);
        const [h, m, s] = hms.split(':').map(Number);
        return (h * 3600000) + (m * 60000) + (s * 1000) + Number(ms);
    }

    function toTimeStr(totalMs) {
        if (totalMs < 0) totalMs = 0;
        const h = Math.floor(totalMs / 3600000);
        totalMs %= 3600000;
        const m = Math.floor(totalMs / 60000);
        totalMs %= 60000;
        const s = Math.floor(totalMs / 1000);
        const ms = totalMs % 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }

    return srtContent.replace(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/g, (match, start, end) => {
        const newStart = toTimeStr(toMs(start) + offsetMs);
        const newEnd = toTimeStr(toMs(end) + offsetMs);
        return `${newStart} --> ${newEnd}`;
    });
}

async function main() {
    const { videoPath, srtPath, shiftSec, isHardsub, outputPath } = parseArgs();

    if (!videoPath || !srtPath) {
        console.log(`
🎬 *Universal Video + Subtitle Encoder & Sync Tool*
─────────────────────────────────────────────────────────────
භාවිතය (Usage):

1. Fast Muxing (Soft-sub - 5-10 Seconds, 0% Quality Loss):
   node tools/encode_sub.js "video.mp4" "sub.srt"

2. Subtitle Time Shift (වේලාව වෙනස් කර Sync කිරීම):
   node tools/encode_sub.js "video.mp4" "sub.srt" --shift 3.5   (තත්පර 3.5ක් පස්සට)
   node tools/encode_sub.js "video.mp4" "sub.srt" --shift -2.0  (තත්පර 2ක් ඉදිරියට)

3. Hard-Sub Burn-in (වීඩියෝවටම Subtitle අලවා Encode කිරීම):
   node tools/encode_sub.js "video.mp4" "sub.srt" --hardsub

─────────────────────────────────────────────────────────────
`);
        process.exit(1);
    }

    if (!fs.existsSync(videoPath)) {
        console.error(`❌ වීඩියෝ ගොනුව සොයාගත නොහැකි විය: ${videoPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(srtPath)) {
        console.error(`❌ Subtitle (.srt) ගොනුව සොයාගත නොහැකි විය: ${srtPath}`);
        process.exit(1);
    }

    let finalSrtPath = srtPath;

    // Handle Time Shift if requested
    if (shiftSec !== 0) {
        console.log(`⏱️ Subtitle කාලය ${shiftSec > 0 ? '+' : ''}${shiftSec}s කින් වෙනස් කරමින් පවතී...`);
        const origContent = fs.readFileSync(srtPath, 'utf8');
        const shiftedContent = shiftSrt(origContent, shiftSec);
        finalSrtPath = path.join(path.dirname(srtPath), `shifted_${path.basename(srtPath)}`);
        fs.writeFileSync(finalSrtPath, shiftedContent, 'utf8');
        console.log(`✅ Synced Subtitle සකස් කරන ලදී: ${finalSrtPath}`);
    }

    const ext = path.extname(videoPath);
    const baseName = path.basename(videoPath, ext);
    const dir = path.dirname(videoPath);

    let finalOut = outputPath;
    if (!finalOut) {
        const modeSuffix = isHardsub ? '_hardsub' : '_subbed';
        finalOut = path.join(dir, `${baseName}${modeSuffix}.mp4`);
    }

    console.log(`\n🚀 ආරම්භ කරමින් පවතී:`);
    console.log(`📹 Video: ${videoPath}`);
    console.log(`💬 Subtitle: ${finalSrtPath}`);
    console.log(`⚙️ Mode: ${isHardsub ? 'Hard-sub (Burn-in)' : 'Soft-sub (High-Speed Stream Copy - 5-10s)'}`);
    console.log(`📦 Output: ${finalOut}\n`);

    let ffmpegArgs = [];

    if (isHardsub) {
        // Hard-sub: Burn subtitles into video picture
        // Escape backslashes for ffmpeg filter
        const escapedSubPath = finalSrtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        ffmpegArgs = [
            '-y',
            '-i', videoPath,
            '-vf', `subtitles='${escapedSubPath}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2'`,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-c:a', 'copy',
            finalOut
        ];
    } else {
        // Soft-sub: Fast Muxing (Stream copy - 0 quality loss, 5-10 seconds)
        ffmpegArgs = [
            '-y',
            '-i', videoPath,
            '-i', finalSrtPath,
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-c:s', 'mov_text',
            '-metadata:s:s:0', 'language=sin',
            '-metadata:s:s:0', 'title=Sinhala',
            finalOut
        ];
    }

    console.log(`⚡ FFmpeg ක්‍රියාත්මක වෙමින් පවතී...`);
    const startTime = Date.now();

    const proc = spawn(ffmpegPath, ffmpegArgs, { stdio: 'inherit' });

    proc.on('close', (code) => {
        const dur = ((Date.now() - startTime) / 1000).toFixed(1);
        if (code === 0) {
            console.log(`\n🎉 සාර්ථකයි! Subtitles සමඟ වීඩියෝව සකස් කරන ලදී (${dur}s):`);
            console.log(`📁 File: ${finalOut}`);
        } else {
            console.error(`\n❌ FFmpeg දෝෂයක් ඇති විය (Exit Code: ${code}).`);
        }

        // Clean up temporary shifted file if created
        if (shiftSec !== 0 && finalSrtPath !== srtPath && fs.existsSync(finalSrtPath)) {
            try { fs.unlinkSync(finalSrtPath); } catch (e) {}
        }
    });
}

main();
