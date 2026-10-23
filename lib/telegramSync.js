require('dotenv').config();
const axios = require('axios');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8870659304:AAE7CJ4B02IoMHiDBxfvVOkmPmy1JNu7aw8';
const CHANNEL_ID = -1004382943539;

let isSyncing = false;
let lastSyncTime = 0;

/**
 * Sync all Collages and Videos from Telegram directly into MongoDB.
 * Uses Telegram Bot API (HTTP) - zero FloodWait risk, zero GitHub dependency.
 */
async function syncFromTelegram(options = {}) {
    if (isSyncing) return { inProgress: true };
    const now = Date.now();
    // Cache for 60 seconds unless forced
    if (!options.force && (now - lastSyncTime < 60000)) {
        return { cached: true };
    }

    isSyncing = true;
    console.log('🔄 [Auto Sync] Scanning channel for Collages & Videos...');

    let mClient = null;
    try {
        mClient = new MongoClient(process.env.MONGODB_URI);
        await mClient.connect();
        const db = mClient.db('whatsapp_bot');
        const collagesCol = db.collection('telegram_collages');
        const videosCol = db.collection('telegram_videos');

        const cacheDir = path.join(__dirname, '../cache_collages');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

        const rawCollages = [];
        const rawVideos = [];

        // Scan messages up to ID 60 (covers all existing + upcoming messages)
        const maxScanId = options.maxId || 60;
        for (let msgId = 5; msgId <= maxScanId; msgId++) {
            try {
                const fwd = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`, {
                    chat_id: CHANNEL_ID,
                    from_chat_id: CHANNEL_ID,
                    message_id: msgId
                }, { timeout: 8000 });

                const m = fwd.data?.result;
                if (!m) continue;
                const text = (m.caption || '').trim();

                // 1. Photo Collage (Obfuscated & Encrypted with AES-256)
                if (m.photo && m.photo.length > 0) {
                    const bestPhoto = m.photo[m.photo.length - 1];
                    const cMatch = text.match(/collage\s*(\d+)/i);
                    const num = cMatch ? parseInt(cMatch[1], 10) : (rawCollages.length + 1);

                    // Fetch photo binary & encrypt to obfuscated binary (.enc)
                    let photoBuf = null;
                    let encBuf = null;
                    try {
                        const fRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${bestPhoto.file_id}`, { timeout: 8000 });
                        if (fRes.data?.ok && fRes.data.result?.file_path) {
                            const pUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fRes.data.result.file_path}`;
                            const pResp = await axios.get(pUrl, { responseType: 'arraybuffer', timeout: 15000 });
                            photoBuf = Buffer.from(pResp.data);

                            const { encryptCollageBuffer } = require('./collageCrypto');
                            encBuf = encryptCollageBuffer(photoBuf);

                            const encFile = path.join(cacheDir, `collage_${num}.enc`);
                            fs.writeFileSync(encFile, encBuf);

                            // Clean up unencrypted file if exists
                            const oldJpg = path.join(cacheDir, `collage_${num}.jpg`);
                            if (fs.existsSync(oldJpg)) {
                                try { fs.unlinkSync(oldJpg); } catch (_) {}
                            }
                        }
                    } catch (_) {}

                    const cDoc = {
                        collageNum: num,
                        messageId: msgId,
                        caption: text || `#General #Collage${num}`,
                        photoBase64: encBuf ? encBuf.toString('base64') : (photoBuf ? photoBuf.toString('base64') : null),
                        isEncrypted: true,
                        fileId: bestPhoto.file_id,
                        updatedAt: new Date()
                    };
                    await collagesCol.updateOne({ collageNum: num }, { $set: cDoc }, { upsert: true });
                    rawCollages.push(cDoc);
                    console.log(`🖼️ [Manual Sync] Collage ${num} synced & encrypted (.enc) (Msg ID: ${msgId})`);
                }

                // 2. Video Document / Video
                if (m.video || m.document) {
                    const item = m.video || m.document;
                    const rawName = item.file_name || '';
                    const combined = (text + ' ' + rawName).trim();
                    const codeMatch = combined.match(/#General\s*(\d+)/i) || combined.match(/\b(\d{1,2})\b/);
                    let code = codeMatch ? codeMatch[1] : '';
                    if (code.length === 1) code = '0' + code;

                    if (code) {
                        const sizeMB = (Number(item.file_size || 0) / (1024 * 1024)).toFixed(1);
                        let title = combined.replace(/#General/gi, '').replace(/\b\d{1,2}\b/, '').replace(/\.[a-zA-Z0-9]{2,4}$/, '').trim();
                        if (!title) title = `Video ${code}`;

                        const cMatch = combined.match(/#Collage\s*(\d+)/i);
                        const explicitCollage = cMatch ? parseInt(cMatch[1], 10) : null;

                        const vDoc = {
                            code: code,
                            title: title,
                            fileName: rawName || `${title}.mp4`,
                            fileId: item.file_id,
                            sizeMB: sizeMB,
                            sizeFmt: `${sizeMB} MB`,
                            explicitCollage: explicitCollage,
                            messageId: msgId,
                            chatId: CHANNEL_ID,
                            mimeType: item.mime_type || 'video/mp4',
                            updatedAt: new Date()
                        };
                        rawVideos.push(vDoc);
                    }
                }

                // Delete temporary forwarded message
                axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
                    chat_id: CHANNEL_ID,
                    message_id: m.message_id
                }).catch(() => {});

            } catch (err) {
                // Message ID does not exist or empty
            }
        }

        // Re-assign collages to videos based on sequence
        rawCollages.sort((a, b) => a.messageId - b.messageId);
        for (const v of rawVideos) {
            if (v.explicitCollage) {
                v.collageNum = v.explicitCollage;
            } else {
                let assigned = 1;
                for (let i = rawCollages.length - 1; i >= 0; i--) {
                    if (v.messageId > rawCollages[i].messageId) {
                        assigned = rawCollages[i].collageNum;
                        break;
                    }
                }
                if (rawCollages.length > 1 && assigned === 1 && parseInt(v.code, 10) >= 10) {
                    assigned = Math.floor((parseInt(v.code, 10) - 1) / 9) + 1;
                }
                v.collageNum = assigned;
            }

            await videosCol.updateOne({ code: v.code }, { $set: v }, { upsert: true });
        }

        for (const c of rawCollages) {
            const vCodes = rawVideos.filter(v => v.collageNum === c.collageNum).map(v => v.code).sort();
            await collagesCol.updateOne({ collageNum: c.collageNum }, { $set: { videoCodes: vCodes } }, { upsert: true });
        }

        lastSyncTime = Date.now();
        console.log(`✅ [Auto Sync Complete] Synced ${rawCollages.length} Collages & ${rawVideos.length} Videos to MongoDB.`);
        return { success: true, collages: rawCollages.length, videos: rawVideos.length };
    } catch (e) {
        console.error('❌ [Auto Sync Error]:', e.message);
        return { success: false, error: e.message };
    } finally {
        if (mClient) await mClient.close();
        isSyncing = false;
    }
}

module.exports = {
    syncFromTelegram
};
