require('dotenv').config();
const { getTelegramClient } = require('./lib/telegramDownloader');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function syncAllFromTelegram() {
    console.log('🔄 Syncing Collages and Videos from Telegram to MongoDB...');
    const client = await getTelegramClient();
    const mClient = new MongoClient(process.env.MONGODB_URI);
    await mClient.connect();
    const db = mClient.db('whatsapp_bot');
    const collagesCol = db.collection('telegram_collages');
    const videosCol = db.collection('telegram_videos');

    const cacheDir = path.join(__dirname, 'cache_collages');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    // Fetch messages up to ID 150
    const ids = Array.from({ length: 150 }, (_, i) => i + 1);
    const msgs = await client.getMessages(-1004382943539, { ids });

    const rawCollages = [];
    const rawVideos = [];

    for (const m of msgs) {
        if (!m || !m.media) continue;
        const text = (m.message || '').trim();

        // 1. Check if Collage Photo
        if (m.media.className === 'MessageMediaPhoto' && (/collage/i.test(text) || !m.replyTo || m.replyTo?.replyToMsgId === 1)) {
            const collageMatch = text.match(/collage\s*(\d+)/i);
            const num = collageMatch ? parseInt(collageMatch[1], 10) : rawCollages.length + 1;
            
            console.log(`📥 Downloading Collage Photo ${num} (Msg ID: ${m.id})...`);
            let photoBuf = null;
            try {
                photoBuf = await client.downloadMedia(m);
            } catch (dlErr) {
                console.log(`⚠️ Download photo warning for Msg ID ${m.id}:`, dlErr.message);
            }

            const localFile = path.join(cacheDir, `collage_${num}.jpg`);
            if (photoBuf) fs.writeFileSync(localFile, photoBuf);

            rawCollages.push({
                collageNum: num,
                messageId: m.id,
                caption: text || `#General #Collage${num}`,
                photoBase64: photoBuf ? photoBuf.toString('base64') : null,
                localPath: localFile,
                updatedAt: new Date()
            });
        }

        // 2. Check if Video Document
        if (m.media.className === 'MessageMediaDocument' && m.media.document) {
            const doc = m.media.document;
            if (doc.mimeType?.startsWith('video/') || doc.mimeType?.includes('quicktime') || doc.mimeType?.includes('matroska')) {
                const fnAttr = (doc.attributes || []).find(a => a.fileName);
                const rawName = fnAttr ? fnAttr.fileName : '';
                const combined = (text + ' ' + rawName).trim();

                // Extract code: 01, 02, ... 10, 11, etc.
                const codeMatch = combined.match(/#General\s*(\d+)/i) || combined.match(/\b(\d{1,2})\b/);
                let code = codeMatch ? codeMatch[1] : '';
                if (code.length === 1) code = '0' + code;

                const sizeMB = (Number(doc.size) / (1024 * 1024)).toFixed(1);
                let title = combined.replace(/#General/gi, '').replace(/\b\d{1,2}\b/, '').replace(/\.[a-zA-Z0-9]{2,4}$/, '').trim();
                if (!title) title = `Video ${code}`;

                // Check if text has explicit collage tag e.g. #Collage1
                const cMatch = combined.match(/#Collage\s*(\d+)/i);
                const explicitCollage = cMatch ? parseInt(cMatch[1], 10) : null;

                rawVideos.push({
                    messageId: m.id,
                    code: code,
                    title: title,
                    fileName: rawName || `${title}.mp4`,
                    sizeMB: sizeMB,
                    sizeFmt: `${sizeMB} MB`,
                    explicitCollage: explicitCollage,
                    chatId: -1004382943539,
                    mimeType: doc.mimeType,
                    updatedAt: new Date()
                });
            }
        }
    }

    // Sort collages by messageId ascending
    rawCollages.sort((a, b) => a.messageId - b.messageId);

    // Re-index collageNum cleanly: 1, 2, 3...
    rawCollages.forEach((c, idx) => {
        if (!c.collageNum) c.collageNum = idx + 1;
    });

    // Dynamically assign videos to collages based on messageId sequence
    for (const v of rawVideos) {
        if (v.explicitCollage) {
            v.collageNum = v.explicitCollage;
        } else {
            // Find the closest collage photo message that came before this video
            let assigned = 1;
            for (let i = rawCollages.length - 1; i >= 0; i--) {
                if (v.messageId > rawCollages[i].messageId) {
                    assigned = rawCollages[i].collageNum;
                    break;
                }
            }
            // Fallback by code if message IDs were unordered
            if (rawCollages.length > 1 && assigned === 1 && parseInt(v.code, 10) >= 10) {
                assigned = Math.floor((parseInt(v.code, 10) - 1) / 9) + 1;
            }
            v.collageNum = assigned;
        }

        await videosCol.updateOne({ code: v.code }, { $set: v }, { upsert: true });
        console.log(`🎬 Video [${v.code}] -> Collage ${v.collageNum} (Msg ID: ${v.messageId}, File: ${v.fileName})`);
    }

    // Upsert collages with assigned video list
    for (const c of rawCollages) {
        const cVideos = rawVideos.filter(v => v.collageNum === c.collageNum).map(v => v.code).sort();
        c.videoCodes = cVideos;
        await collagesCol.updateOne({ collageNum: c.collageNum }, { $set: c }, { upsert: true });
        console.log(`✅ Synced Collage ${c.collageNum} (Msg ID: ${c.messageId}, Videos: [${cVideos.join(', ')}])`);
    }

    console.log(`\n🎉 Total Synced: ${rawCollages.length} Collages, ${rawVideos.length} Videos.`);
    await mClient.close();
    process.exit(0);
}

syncAllFromTelegram().catch(e => {
    console.error('Sync error:', e);
    process.exit(1);
});
