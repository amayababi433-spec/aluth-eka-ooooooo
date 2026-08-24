const { cmd } = require('../command');

// ===============================
//  ENGINE: GROUP MANAGEMENT (FAST & SAFE)
// ===============================

const locks = new Set();           // Per-group lock
const cooldown = new Map();        // Per-user cooldown
const CD_MS = 3000;                // 3 Seconds Cooldown
const TAGALL_LIMIT = 100;          // Tag limit (To prevent bans/lag)

function lockKey(from) { return from; }
function userKey(mek, from) { return mek?.key?.participant || mek?.key?.remoteJid || from; }

function onCooldown(uid) {
    const last = cooldown.get(uid) || 0;
    const now = Date.now();
    if (now - last < CD_MS) return true;
    cooldown.set(uid, now);
    return false;
}

// 1. TAG ALL (With Safety Limit)
cmd({
    pattern: "tagall",
    alias: ["tag"],
    desc: "Mention group members",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, q, reply, isGroup, isAdmins, isBotAdmins, participants }) => {
    try {
        if (!isGroup) return reply("❌ Group only.");
        if (!isAdmins) return reply("❌ Admin only.");
        
        const uid = userKey(mek, from);
        if (onCooldown(uid)) return reply("⏳ Please wait...");
        if (locks.has(lockKey(from))) return reply("⏳ Already processing...");

        locks.add(lockKey(from));

        const members = participants.map(p => p.id);
        if (!members.length) return reply("❌ No members found.");

        // Limit tags to avoid ban risks
        const sendList = members.slice(0, TAGALL_LIMIT);

        let teks = `📢 *TAG ALL* 📢\n\n${q ? "Message: " + q : ""}\n\n`;
        for (const id of sendList) {
            teks += `❄️ @${id.split('@')[0]}\n`;
        }
        
        if (members.length > TAGALL_LIMIT) {
            teks += `\n⚠️ *Limit Reached:* Tagged first ${TAGALL_LIMIT} members only.`;
        }

        await conn.sendMessage(from, { text: teks, mentions: sendList }, { quoted: mek });

    } catch (e) {
        reply("❌ Error.");
    } finally {
        locks.delete(lockKey(from));
    }
});

// 2. TAG ADMINS
cmd({
    pattern: "tagadmin",
    alias: ["admins"],
    desc: "Tag group admins",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, reply, isGroup, participants }) => {
    try {
        if (!isGroup) return reply("❌ Group only.");
        
        const groupAdmins = participants.filter(p => p.admin).map(p => p.id);
        let teks = `👑 *GROUP ADMINS* 👑\n\n`;
        
        for (const id of groupAdmins) {
            teks += `👮‍♂️ @${id.split('@')[0]}\n`;
        }
        
        await conn.sendMessage(from, { text: teks, mentions: groupAdmins }, { quoted: mek });
    } catch (e) {
        reply("❌ Error.");
    }
});

// 3. REPORT TO ADMINS
cmd({
    pattern: "report",
    desc: "Report a user",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, q, reply, isGroup, participants, quoted }) => {
    try {
        if (!isGroup) return reply("❌ Group only.");
        if (!quoted) return reply("❌ Reply to a message.");

        const groupAdmins = participants.filter(p => p.admin).map(p => p.id);
        const target = quoted.sender;
        
        let msg = `⚠️ *REPORT ALERT* ⚠️\n\n` +
                  `👤 *User:* @${target.split('@')[0]}\n` +
                  `📝 *Reason:* ${q || "No reason"}\n` +
                  `👮‍♂️ *Admins Notified!*`;

        await conn.sendMessage(from, { text: msg, mentions: [...groupAdmins, target] }, { quoted: mek });
        
    } catch (e) {
        reply("❌ Error.");
    }
});

// 4. CLONE GROUP (Change Subject)
cmd({
    pattern: "clone",
    desc: "Change group subject",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, q, reply, isGroup, isAdmins, isBotAdmins }) => {
    try {
        if (!isGroup || !isAdmins) return reply("❌ Error: Check Permissions.");
        if (!isBotAdmins) return reply("❌ Bot needs Admin.");
        if (!q) return reply("❌ Give a name.");

        await conn.groupUpdateSubject(from, q);
        reply("✅ *Subject Updated!*");
    } catch (e) {
        reply("❌ Error.");
    }
});

// 5. KICK MEMBER
cmd({
    pattern: "kick",
    desc: "Kick a member",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, quoted, reply, isGroup, isAdmins, isBotAdmins }) => {
    try {
        if (!isGroup || !isAdmins) return reply("❌ Admin only.");
        if (!isBotAdmins) return reply("❌ Bot needs Admin.");
        if (!quoted) return reply("❌ Reply to a user.");

        const uid = userKey(mek, from);
        if (onCooldown(uid)) return reply("⏳ Slow down...");

        await conn.groupParticipantsUpdate(from, [quoted.sender], "remove");
        reply("✅ *User Kicked!*");
    } catch (e) {
        reply("❌ Error kicking.");
    }
});

// 6. ADD MEMBER
cmd({
    pattern: "add",
    desc: "Add a member",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, q, reply, isGroup, isAdmins, isBotAdmins }) => {
    try {
        if (!isGroup || !isAdmins || !isBotAdmins) return reply("❌ Check Permissions.");
        if (!q) return reply("❌ Give a number (e.g. 947xxx).");

        let user = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
        await conn.groupParticipantsUpdate(from, [user], "add");
        reply("✅ *User Added!*");
    } catch (e) {
        reply("❌ Error adding.");
    }
});

// 7. PROMOTE
cmd({
    pattern: "promote",
    desc: "Promote a member",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, quoted, reply, isGroup, isAdmins, isBotAdmins }) => {
    if (!isGroup || !isAdmins || !isBotAdmins || !quoted) return reply("❌ Check Permissions/Reply.");
    await conn.groupParticipantsUpdate(from, [quoted.sender], "promote");
    reply("✅ *User Promoted!*");
});

// 8. DEMOTE
cmd({
    pattern: "demote",
    desc: "Demote a member",
    category: "group",
    filename: __filename
},
async (conn, mek, m, { from, quoted, reply, isGroup, isAdmins, isBotAdmins }) => {
    if (!isGroup || !isAdmins || !isBotAdmins || !quoted) return reply("❌ Check Permissions/Reply.");
    await conn.groupParticipantsUpdate(from, [quoted.sender], "demote");
    reply("✅ *User Demoted!*");
});