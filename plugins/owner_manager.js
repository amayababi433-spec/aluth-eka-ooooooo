const { cmd, commands } = require('../command');
const { MongoClient } = require('mongodb');

let blockCollection;

async function getBlockDB() {
    if (!blockCollection) {
        const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
        await client.connect();
        blockCollection = client.db('whatsapp_bot').collection('blocked_numbers');
        
        // Load existing blocks to RAM
        const blocks = await blockCollection.find({}).toArray();
        blocks.forEach(b => global.blockedUsersCache.set(b._id, b.category));
    }
    return blockCollection;
}

function getTargetJid(q, m) {
    if (m.quoted) {
        return { jid: m.quoted.sender, isManual: false };
    } else if (q) {
        let num = q.replace(/[^0-9]/g, ''); 
        if (num.length > 8) return { jid: num + "@s.whatsapp.net", isManual: true };
    }
    return { jid: null, isManual: false };
}

// 1. Block as CLZ
cmd({ pattern: "bclz", react: "🚫", fromMe: true, desc: "Block as CLZ" }, async (conn, mek, m, { q, reply }) => {
    let target = getTargetJid(q, m);
    if (!target.jid) return reply("⚠️ *Usage:*\nReply to a message with `.bclz` OR Type `.bclz 94713961386`");

    if (target.jid === conn.user.id.split(':')[0] + '@s.whatsapp.net' && !target.isManual) {
        return reply("❌ උඹ Forward කරපු මැසේජ් එකකට Reply කරලා මුල් කෙනාව බ්ලොක් කරන්න බෑ.");
    }

    try {
        const db = await getBlockDB();
        await db.updateOne({ _id: target.jid }, { $set: { category: "clz" } }, { upsert: true });
        global.blockedUsersCache.set(target.jid, "clz");
        reply(`✅ Blocked Successfully!\nNumber: ${target.jid.split('@')[0]}\nCategory: CLZ`);
    } catch (e) { reply("❌ DB Error!"); }
});

// 2. Block as FRIEND
cmd({ pattern: "bfrnd", react: "🚫", fromMe: true, desc: "Block as FRIEND" }, async (conn, mek, m, { q, reply }) => {
    let target = getTargetJid(q, m);
    if (!target.jid) return reply("⚠️ *Usage:*\nReply to a message with `.bfrnd` OR Type `.bfrnd 94713961386`");

    if (target.jid === conn.user.id.split(':')[0] + '@s.whatsapp.net' && !target.isManual) {
        return reply("❌ උඹ Forward කරපු මැසේජ් එකකට Reply කරලා මුල් කෙනාව බ්ලොක් කරන්න බෑ.");
    }

    try {
        const db = await getBlockDB();
        await db.updateOne({ _id: target.jid }, { $set: { category: "friend" } }, { upsert: true });
        global.blockedUsersCache.set(target.jid, "friend");
        reply(`✅ Blocked Successfully!\nNumber: ${target.jid.split('@')[0]}\nCategory: FRIEND`);
    } catch (e) { reply("❌ DB Error!"); }
});

// 3. Remove Block
cmd({ pattern: "rmblock", react: "✅", fromMe: true, desc: "Remove block" }, async (conn, mek, m, { q, reply }) => {
    let target = getTargetJid(q, m);
    if (!target.jid) return reply("⚠️ *Usage:*\nReply to a message with `.rmblock` OR Type `.rmblock 94713961386`");

    try {
        const db = await getBlockDB();
        await db.deleteOne({ _id: target.jid });
        global.blockedUsersCache.delete(target.jid);
        reply(`✅ Removed Block: ${target.jid.split('@')[0]}`);
    } catch (e) { reply("❌ DB Error!"); }
});

// 4. Block List
cmd({ pattern: "blocklist", react: "📋", fromMe: true, desc: "View blocked numbers" }, async (conn, mek, m, { reply }) => {
    if (!global.blockedUsersCache || global.blockedUsersCache.size === 0) return reply("✅ කිසිදු අංකයක් Block කර නොමැත.");
    let listMsg = "📋 *Blocked Numbers*\n\n", count = 1;
    global.blockedUsersCache.forEach((cat, jid) => {
        listMsg += `${count}. ${jid.split('@')[0]} - [${cat}]\n`; count++;
    });
    reply(listMsg);
});

// 5. Owner Menu
cmd({ pattern: "ownermenu", react: "👑", fromMe: true, desc: "View owner commands" }, async (conn, mek, m, { reply }) => {
    let menuMsg = "👑 *Owner Commands List*\n\n", count = 1;
    commands.forEach((cmdInfo) => {
        if (cmdInfo.fromMe || cmdInfo.isOwner) {
            menuMsg += `${count}. .${cmdInfo.pattern} - ${cmdInfo.desc || ""}\n`; count++;
        }
    });
    reply(menuMsg);
});
