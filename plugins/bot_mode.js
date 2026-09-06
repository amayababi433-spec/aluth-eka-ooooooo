const { cmd } = require('../command');
const { MongoClient } = require('mongodb');

let modeCollection;

async function getModeDB() {
    if (!modeCollection) {
        const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
        await client.connect();
        modeCollection = client.db('whatsapp_bot').collection('bot_settings');
        
        const settings = await modeCollection.findOne({ _id: "bot_mode" });
        if (settings && settings.mode) {
            global.BOT_MODE = settings.mode;
        } else {
            global.BOT_MODE = "public"; // Default
        }
    }
    return modeCollection;
}

// Load it on startup
getModeDB().catch(console.error);

cmd({
    pattern: "public",
    react: "🌍",
    desc: "Set bot to public mode (Anyone can use)",
    category: "owner",
    filename: __filename
}, async (conn, mek, m, { from, reply, isOwner }) => {
    if (!isOwner) return reply("❌ Owner only command.");
    
    try {
        const db = await getModeDB();
        await db.updateOne({ _id: "bot_mode" }, { $set: { mode: "public" } }, { upsert: true });
        global.BOT_MODE = "public";
        reply("🌍 *Bot is now in PUBLIC MODE.*\nAnyone can use commands.");
    } catch (e) {
        reply("❌ DB Error!");
    }
});

cmd({
    pattern: "private",
    react: "🔒",
    desc: "Set bot to private mode (Only owner can use)",
    category: "owner",
    filename: __filename
}, async (conn, mek, m, { from, reply, isOwner }) => {
    if (!isOwner) return reply("❌ Owner only command.");
    
    try {
        const db = await getModeDB();
        await db.updateOne({ _id: "bot_mode" }, { $set: { mode: "private" } }, { upsert: true });
        global.BOT_MODE = "private";
        reply("🔒 *Bot is now in PRIVATE MODE.*\nOnly the Owner can use commands.");
    } catch (e) {
        reply("❌ DB Error!");
    }
});
