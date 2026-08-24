const { cmd } = require('../command');

// ===============================
//  ENGINE: STATIC LOCATION CACHE
// ===============================

// බොට්ගේ ස්ථාවර ස්ථානය (මෙතන ඔයාට කැමති තැනක් දාගන්න)
// උදාහරණ: කොළඹ (Colombo)
const BOT_LOCATION = {
    degreesLatitude: 6.9271, 
    degreesLongitude: 79.8612
};

// ===============================
// MAIN COMMAND
// ===============================
cmd({
    pattern: "locate",
    desc: "Get bot location (Fast Mode)",
    category: "main",
    filename: __filename
},
async(conn, mek, m, { from, reply }) => {
    try {
        // Speed: කිසිම calculation එකක් නැතුව කෙලින්ම මෙමරි එකෙන් යවනවා
        await conn.sendMessage(from, { 
            location: BOT_LOCATION 
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        reply("❌ Error sending location.");
    }
});