const { cmd, commands } = require('../command');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

// Gemini API Key for summarizing long prompts
const ENCODED_KEY = "QVEuQWI4Uk42TDNhOTVxeUd1YU5fWGpLQUk0XzRCT2hmdU9XeVB4eUpGQXotN0JjMjJuSHc="; // Using one of his keys

cmd({
    pattern: "sticker1",
    react: "✨",
    desc: "Generate highly realistic Animated AI Sticker from text",
    category: "sticker",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    if (!q) return reply("⚠️ *Usage:* .sticker1 <your prompt>\nExample: .sticker1 beautiful sri lankan girl smiling");

    reply("⏳ *Analyzing prompt & Generating AI Animation...* (Please wait ~15s)");

    try {
        let sdPrompt = q;

        // 1. Use Gemini to convert ANY language / long text into a perfect Stable Diffusion prompt
        const geminiKey = Buffer.from(ENCODED_KEY, 'base64').toString('utf8');
        const geminiPrompt = `The user wants to generate a high quality image. Their request is in Sinhala/Singlish (e.g. adana kollek = crying boy). Their request: "${q}". 
Extract their intent and write a highly detailed, realistic, comma-separated English prompt for Stable Diffusion. 
Make it beautiful and hyper-realistic. 
DO NOT include any conversational text like "Here is the prompt", ONLY output the final prompt. Maximum 40 words.`;

        try {
            const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`, {
                contents: [{ parts: [{ text: geminiPrompt }] }]
            }, { timeout: 8000 });
            const aiText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (aiText && aiText.length > 5) sdPrompt = aiText.trim();
        } catch (e) {
            console.log("Gemini prompt enhancement failed, using original prompt.");
        }

        console.log("Final Image Prompt:", sdPrompt);

        // 2. Generate Static High-Quality AI Image using Pollinations AI (FREE, NO AUTH)
        const encodedPrompt = encodeURIComponent(sdPrompt);
        const imgUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true`;
        
        const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        const tempImgPath = path.join(__dirname, `../temp_ai_base_${Date.now()}.jpg`);
        const tempWebpPath = path.join(__dirname, `../temp_ai_anim_${Date.now()}.webp`);
        
        fs.writeFileSync(tempImgPath, imgRes.data);

        // 3. Create Local Animation using FFmpeg (Zoom Pan Effect)
        await new Promise((resolve, reject) => {
            ffmpeg(tempImgPath)
                .inputOptions(['-loop 1'])
                .outputOptions([
                    '-vcodec libwebp',
                    '-vf zoompan=z=\'min(zoom+0.015,1.5)\':d=45:s=512x512', // Slow zoom-in animation
                    '-t 3', // 3 seconds long
                    '-r 15' // 15 fps
                ])
                .save(tempWebpPath)
                .on('end', resolve)
                .on('error', reject);
        });

        // 4. Send the Animated Sticker
        await conn.sendMessage(from, { sticker: { url: tempWebpPath } }, { quoted: mek });

        // 5. Clean up temp files
        setTimeout(() => {
            try {
                if (fs.existsSync(tempImgPath)) fs.unlinkSync(tempImgPath);
                if (fs.existsSync(tempWebpPath)) fs.unlinkSync(tempWebpPath);
            } catch (e) {}
        }, 2000);

    } catch (e) {
        console.log(e);
        reply("❌ *Failed to generate AI Animation.* Try a different prompt.");
    }
});
