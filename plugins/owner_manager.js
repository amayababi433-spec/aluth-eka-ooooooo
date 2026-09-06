const { cmd, commands } = require('../command');
const { MongoClient } = require('mongodb');

const PERSONAL_OWNER = "94717884174@s.whatsapp.net";

let blockCollection;

async function getBlockDB() {
    if (!blockCollection) {
        const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
        await client.connect();
        blockCollection = client.db('whatsapp_bot').collection('blocked_numbers');
        
        const blocks = await blockCollection.find({}).toArray();
        blocks.forEach(b => global.blockedUsersCache.set(b._id, b.category));
    }
    return blockCollection;
}

function isAuthorized(mek) {
    const sender = mek.participant || mek.key.participant || mek.key.remoteJid;
    return mek.key.fromMe || sender === PERSONAL_OWNER;
}

async function deleteCommandMsg(conn, mek, from) {
    try {
        await conn.sendMessage(from, { delete: mek.key });
    } catch (e) {
        console.log("Failed to delete command message.");
    }
}

function getTargetJid(q, m, from) {
    if (m.quoted) {
        return { jid: m.quoted.sender, isManual: false }; 
    } else if (q) {
        let num = q.replace(/[^0-9]/g, ''); 
        if (num.length > 8) return { jid: num + "@s.whatsapp.net", isManual: true }; 
    } else if (from && !from.includes('@g.us')) {
        return { jid: from, isManual: false }; 
    }
    return { jid: null, isManual: false };
}

cmd({ pattern: "bclz", react: "🚫", desc: "Block as CLZ" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek, from);

    let target = getTargetJid(q, m, from);
    if (!target.jid) return reply("⚠️ අංකයක් හමුවුණේ නෑ.");
    
    let botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';
    if (target.jid === botJid || target.jid === PERSONAL_OWNER) return reply("❌ Bot ව හෝ Owner ව බ්ලොක් කරගන්න බෑ.");

    try {
        const db = await getBlockDB();
        await db.updateOne({ _id: target.jid }, { $set: { category: "clz" } }, { upsert: true });
        global.blockedUsersCache.set(target.jid, "clz");
        
        if (from !== target.jid) {
            reply(`✅ Blocked Successfully!\nNumber: ${target.jid.split('@')[0]}\nCategory: CLZ`);
        } else {
            await conn.sendMessage(PERSONAL_OWNER, { text: `✅ Auto-Alert: ${target.jid.split('@')[0]} ව CLZ ලෙස Block කරන ලදී.` });
        }
    } catch (e) { reply("❌ DB Error!"); }
});

cmd({ pattern: "bfrnd", react: "🚫", desc: "Block as FRIEND" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek, from);

    let target = getTargetJid(q, m, from);
    if (!target.jid) return reply("⚠️ අංකයක් හමුවුණේ නෑ.");
    
    let botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';
    if (target.jid === botJid || target.jid === PERSONAL_OWNER) return reply("❌ Bot ව හෝ Owner ව බ්ලොක් කරගන්න බෑ.");

    try {
        const db = await getBlockDB();
        await db.updateOne({ _id: target.jid }, { $set: { category: "friend" } }, { upsert: true });
        global.blockedUsersCache.set(target.jid, "friend");
        
        if (from !== target.jid) {
            reply(`✅ Blocked Successfully!\nNumber: ${target.jid.split('@')[0]}\nCategory: FRIEND`);
        } else {
            await conn.sendMessage(PERSONAL_OWNER, { text: `✅ Auto-Alert: ${target.jid.split('@')[0]} ව FRIEND ලෙස Block කරන ලදී.` });
        }
    } catch (e) { reply("❌ DB Error!"); }
});

cmd({ pattern: "rmblock", react: "✅", desc: "Remove block" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek, from);

    let target = getTargetJid(q, m, from);
    if (!target.jid) return reply("⚠️ අංකයක් හමුවුණේ නෑ.");

    try {
        const db = await getBlockDB();
        await db.deleteOne({ _id: target.jid });
        global.blockedUsersCache.delete(target.jid);
        
        if (from !== target.jid) {
            reply(`✅ Removed Block: ${target.jid.split('@')[0]}`);
        } else {
            await conn.sendMessage(PERSONAL_OWNER, { text: `✅ Auto-Alert: ${target.jid.split('@')[0]} ගේ Block එක ඉවත් කරන ලදී.` });
        }
    } catch (e) { reply("❌ DB Error!"); }
});

cmd({ pattern: "blocklist", react: "📋", desc: "View blocked numbers" }, async (conn, mek, m, { from, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek, from);

    if (!global.blockedUsersCache || global.blockedUsersCache.size === 0) return reply("✅ කිසිදු අංකයක් Block කර නොමැත.");
    let listMsg = "📋 *Blocked Numbers*\n\n", count = 1;
    global.blockedUsersCache.forEach((cat, jid) => {
        listMsg += `${count}. ${jid.split('@')[0]} - [${cat}]\n`; count++;
    });
    reply(listMsg);
});

cmd({ pattern: "ownermenu", react: "👑", desc: "View owner commands" }, async (conn, mek, m, { from, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek, from);

    let menuMsg = "👑 *Owner Commands List*\n\n", count = 1;
    commands.forEach((cmdInfo) => {
        if (cmdInfo.desc && (cmdInfo.pattern === "bclz" || cmdInfo.pattern === "bfrnd" || cmdInfo.pattern === "rmblock" || cmdInfo.pattern === "blocklist" || cmdInfo.pattern === "ownermenu")) {
            menuMsg += `${count}. .${cmdInfo.pattern} - ${cmdInfo.desc}\n`; count++;
        }
    });
    reply(menuMsg);
});
