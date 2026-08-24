const { cmd } = require('../command');
const axios = require('axios');
const FormData = require('form-data');
const fileType = require('file-type');

// =============================================================
//  FILE UPLOADER
// =============================================================
cmd({
    pattern: "upload",
    alias: ["tourl", "url"],
    desc: "Upload media to internet",
    category: "main",
    filename: __filename
},
    async (conn, mek, m, { from, reply, quoted }) => {
        try {
            if (!quoted) return reply("📤 Reply to a file to upload.");

            await conn.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

            const media = await conn.downloadMediaMessage(quoted);

            const apiKey = global.APIKeys['https://api.stellarwa.xyz'];
            const targetUrl = `${global.api.stellar}/tools/upload?key=${apiKey}`;

            const form = new FormData();
            form.append('file', media, { filename: 'upload.tmp' });

            const res = await axios.post(targetUrl, form, {
                headers: { ...form.getHeaders() }
            });

            const data = res.data;
            if (!data || !data.url) return reply("❌ Upload failed.");

            await reply(`✅ *File Uploaded!*\n\n🔗 ${data.url}`);

        } catch (e) {
            console.error(e);
            reply("❌ Error uploading.");
        }
    });
