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
    const sender = mek.key.participant || mek.key.remoteJid;
    return mek.key.fromMe || (sender && sender.split('@')[0] === "94717884174");
}

async function deleteCommandMsg(conn, mek) {
    try { await conn.sendMessage(mek.key.remoteJid, { delete: mek.key }); } catch (_) {}
}

// FIX: Get the ACTUAL customer JID from the chat, NOT from `from` variable
// When owner sends command from Linked Device inside Customer's chat:
//   mek.key.remoteJid = customer's JID (the chat we are inside)
//   mek.key.fromMe = true (because it's from owner device)
function getTargetJids(q, m, mek) {
    let jids = [];

    // Priority 1: Quoted message - get the quoted person
    if (m.quoted && m.quoted.sender) {
        jids.push({ jid: m.quoted.sender, isManual: false });
    }

    // Priority 2: Manual number in argument (e.g. .bclz 94771234567)
    if (q) {
        const matches = q.match(/\d{9,}/g);
        if (matches) {
            matches.forEach(num => jids.push({ jid: num + "@s.whatsapp.net", isManual: true }));
        }
    }

    // Priority 3: Use the ACTUAL CHAT JID (the customer's chat we are inside!)
    // This is the fix - mek.key.remoteJid is always the chat we are in
    if (jids.length === 0) {
        const chatJid = mek.key.remoteJid;
        if (chatJid && !chatJid.endsWith('@g.us') && chatJid !== PERSONAL_OWNER) {
            jids.push({ jid: chatJid, isManual: false });
        }
    }

    return jids;
}

cmd({ pattern: "bclz", react: "🚫", desc: "Block as CLZ" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek);

    let targets = getTargetJids(q, m, mek);
    let botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';

    if (targets.length === 0) return reply("⚠️ Customer ගේ Chat එකේ ඉඳලා ගහන්න, නැත්නම් .bclz 94771234567 ලෙස ගහන්න.");

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
            // If stealth mode (command from inside customer chat)
            if (mek.key.fromMe && !targets[0].isManual) {
                await conn.sendMessage(PERSONAL_OWNER, { text: `🚫 Stealth Block: ${blockedNums.join(', ')} ව CLZ ලෙස Block කරන ලදී.` });
            } else {
                reply(`✅ Blocked!\nNumbers: ${blockedNums.join(', ')}\nCategory: CLZ`);
            }
        } else {
            reply("❌ Bot ව හෝ Owner ව Block කරගන්න බෑ.");
        }
    } catch (e) { reply("❌ DB Error: " + e.message); }
});

cmd({ pattern: "bfrnd", react: "🚫", desc: "Block as FRIEND" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek);

    let targets = getTargetJids(q, m, mek);
    let botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';

    if (targets.length === 0) return reply("⚠️ Customer ගේ Chat එකේ ඉඳලා ගහන්න, නැත්නම් .bfrnd 94771234567 ලෙස ගහන්න.");

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
            // Stealth mode
            if (mek.key.fromMe && !targets[0].isManual) {
                await conn.sendMessage(PERSONAL_OWNER, { text: `🚫 Stealth Block: ${blockedNums.join(', ')} ව FRIEND ලෙස Block කරන ලදී.` });
            } else {
                reply(`✅ Blocked!\nNumbers: ${blockedNums.join(', ')}\nCategory: FRIEND`);
            }
        } else {
            reply("❌ Bot ව හෝ Owner ව Block කරගන්න බෑ.");
        }
    } catch (e) { reply("❌ DB Error: " + e.message); }
});

cmd({ pattern: "rmblock", react: "✅", desc: "Remove block (.rmblock 1 / .rmblock all / .rmblock 947...)" }, async (conn, mek, m, { from, q, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek);

    try {
        const db = await getBlockDB();

        // .rmblock all
        if (q && q.toLowerCase() === 'all') {
            if (global.blockedUsersCache.size === 0) return reply("⚠️ Block List එක හිස්!");
            await db.deleteMany({});
            global.blockedUsersCache.clear();
            return reply("✅ Block List සම්පූර්ණයෙන්ම හිස් කළා!");
        }

        // .rmblock 1 / .rmblock 2 (index based)
        if (q && /^\d{1,3}$/.test(q.trim())) {
            let index = parseInt(q.trim()) - 1;
            let keys = Array.from(global.blockedUsersCache.keys());
            if (index >= 0 && index < keys.length) {
                let targetJid = keys[index];
                await db.deleteOne({ _id: targetJid });
                global.blockedUsersCache.delete(targetJid);
                return reply(`✅ Removed: ${targetJid.split('@')[0]}`);
            } else {
                return reply(`⚠️ Index ${index + 1} නෑ. .blocklist ගසලා check කරන්න.`);
            }
        }

        // .rmblock 94771234567 (number based)
        if (q) {
            const matches = q.match(/\d{9,}/g);
            if (matches) {
                let removed = [];
                for (let num of matches) {
                    const jid = num + "@s.whatsapp.net";
                    await db.deleteOne({ _id: jid });
                    global.blockedUsersCache.delete(jid);
                    removed.push(num);
                }
                return reply(`✅ Removed: ${removed.join(', ')}`);
            }
        }

        return reply("⚠️ Usage:\n.rmblock 1  (index)\n.rmblock 94771234567  (number)\n.rmblock all  (clear all)");
    } catch (e) { reply("❌ DB Error: " + e.message); }
});

cmd({ pattern: "blocklist", react: "📋", desc: "View blocked numbers list" }, async (conn, mek, m, { from, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek);

    if (!global.blockedUsersCache || global.blockedUsersCache.size === 0) {
        return reply("✅ Block List හිස්ය. කිසිවෙකු Block කර නොමැත.");
    }

    let listMsg = "📋 *Blocked Numbers*\n\n", count = 1;
    global.blockedUsersCache.forEach((cat, jid) => {
        listMsg += `${count}. ${jid.split('@')[0]} - [${cat.toUpperCase()}]\n`;
        count++;
    });
    listMsg += `\n_Total: ${global.blockedUsersCache.size}_\n\n_Use .rmblock 1 to remove by index_`;
    reply(listMsg);
});

cmd({ pattern: "ownermenu", react: "👑", desc: "Owner commands menu" }, async (conn, mek, m, { from, reply }) => {
    if (!isAuthorized(mek)) return;
    await deleteCommandMsg(conn, mek);

    const menuMsg = `👑 *DMC Owner Commands*

🚫 *Block Commands:*
▸ .bclz - Block as CLZ (Inside Customer chat)
▸ .bfrnd - Block as FRIEND (Inside Customer chat)
▸ .bclz 947XXXXXXX - Block by number
▸ .bfrnd 947XXXXXXX - Block by number

✅ *Unblock Commands:*
▸ .rmblock 1 - Remove by list index
▸ .rmblock 947XXXXXXX - Remove by number
▸ .rmblock all - Clear entire block list

📋 *View Commands:*
▸ .blocklist - View all blocked numbers

🌍 *Mode Commands:*
▸ .public - Set bot to Public Mode
▸ .private - Set bot to Private Mode (Owner only)

👑 *Menu:*
▸ .ownermenu - This menu`;

    reply(menuMsg);
});
