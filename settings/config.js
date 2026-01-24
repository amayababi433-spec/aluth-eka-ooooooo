const fs = require('fs');
const settings = require('./settings'); // ඔයාගේ settings.js එක ලින්ක් කරනවා

module.exports = {
    SESSION_ID: settings.SESSION_ID,
    ALIVE_IMG: settings.ALIVE_IMG || "https://telegra.ph/file/24fa902ead26340f3df2c.png",
    AUTO_VOICE: settings.AUTO_VOICE || 'true',
    OWNER_NUMBER: settings.OWNER_NUMBER || '94717884174',
    BOT_NAME: settings.BOT_NAME,
    YT_COOKIE: settings.YT_COOKIE,
    // තව ඕන දේවල් මෙතනට දාන්න පුළුවන්
};