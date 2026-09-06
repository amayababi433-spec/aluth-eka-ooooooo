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

function getTargetJids(q, m, from) {
    let jids = [];
    if (m.quoted) {
        jids.push({ jid: m.quoted.sender, isManual: false });
    }
    
    if (q) {
        const matches = q.match(/\d{9,}/g);
        if (matches) {
            matches.forEach(num => jids.push({ jid: num + "@s.whatsapp.net", isManual: true }));
        }
    }
    
    if (jids.length === 0 && from && !from.includes('@g.us')) {
        jids.push({ jid: from, isManual: false });
    }
    return jids;
}

cmd({ pattern: "bclz", react: "🚫", desc: "Block as CLZ" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek, from);

    let targets = getTargetJids(q, m, from);
    if (targets.length === 0) return reply("⚠️ අංකයක් හමුවුණේ නෑ.");
    
    let botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';

    try {
        const db = await getBlockDB();
        let blockedNums = [];

        for (let t of targets) {
            if (t.jid === botJid || t.jid === PERSONAL_OWNER) continue;
            await db.updateOne({ _id: t.jid }, { $set: { category: "clz" } }, { upsert: true });
            global.blockedUsersCache.set(t.jid, "clz");
            blockedNums.push(t.jid.split('@')[0]);
        }
        
        if (blockedNums.length > 0) {
            if (targets.length === 1 && from === targets[0].jid && !targets[0].isManual) {
                await conn.sendMessage(PERSONAL_OWNER, { text: `✅ Auto-Alert: ${blockedNums[0]} ව CLZ ලෙස Block කරන ලදී.` });
            } else {
                reply(`✅ Blocked Successfully!\nNumbers:\n${blockedNums.join('\n')}\nCategory: CLZ`);
            }
        } else {
            reply("❌ Bot ව හෝ Owner ව බ්ලොක් කරගන්න බෑ.");
        }
    } catch (e) { reply("❌ DB Error!"); }
});

cmd({ pattern: "bfrnd", react: "🚫", desc: "Block as FRIEND" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek, from);

    let targets = getTargetJids(q, m, from);
    if (targets.length === 0) return reply("⚠️ අංකයක් හමුවුණේ නෑ.");
    
    let botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';

    try {
        const db = await getBlockDB();
        let blockedNums = [];

        for (let t of targets) {
            if (t.jid === botJid || t.jid === PERSONAL_OWNER) continue;
            await db.updateOne({ _id: t.jid }, { $set: { category: "friend" } }, { upsert: true });
            global.blockedUsersCache.set(t.jid, "friend");
            blockedNums.push(t.jid.split('@')[0]);
        }
        
        if (blockedNums.length > 0) {
            if (targets.length === 1 && from === targets[0].jid && !targets[0].isManual) {
                await conn.sendMessage(PERSONAL_OWNER, { text: `✅ Auto-Alert: ${blockedNums[0]} ව FRIEND ලෙස Block කරන ලදී.` });
            } else {
                reply(`✅ Blocked Successfully!\nNumbers:\n${blockedNums.join('\n')}\nCategory: FRIEND`);
            }
        } else {
            reply("❌ Bot ව හෝ Owner ව බ්ලොක් කරගන්න බෑ.");
        }
    } catch (e) { reply("❌ DB Error!"); }
});

cmd({ pattern: "rmblock", react: "✅", desc: "Remove block" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek, from);

    let targets = getTargetJids(q, m, from);
    if (targets.length === 0) return reply("⚠️ කරුණාකර අංකයක් ලබාදෙන්න (උදා: .rmblock 9471XXXXXXX).");

    try {
        const db = await getBlockDB();
        let unblockedNums = [];

        for (let t of targets) {
            await db.deleteOne({ _id: t.jid });
            global.blockedUsersCache.delete(t.jid);
            unblockedNums.push(t.jid.split('@')[0]);
        }
        
        if (unblockedNums.length > 0) {
            if (targets.length === 1 && from === targets[0].jid && !targets[0].isManual) {
                await conn.sendMessage(PERSONAL_OWNER, { text: `✅ Auto-Alert: ${unblockedNums[0]} ගේ Block එක ඉවත් කරන ලදී.` });
            } else {
                reply(`✅ Removed Block for:\n${unblockedNums.join('\n')}`);
            }
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
