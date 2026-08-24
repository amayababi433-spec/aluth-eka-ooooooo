const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

module.exports = {
    // ✅ ඔයා දුන්න Levanter Session ID එක මෙතනට දැම්මා
    SESSION_ID: process.env.SESSION_ID || 'levanter_161cc31b1ddfd542a79e9939ec88f8a8d8', 
    
    // Voice commands වැඩ කිරීමට මෙය අනිවාර්ය වේ
    AUTO_VOICE: process.env.AUTO_VOICE || 'true',
    
    // ඔයාගේ අංකය
    OWNER_NUMBER: process.env.OWNER_NUMBER || '94717884174',
    
    // Database එක
    POSTGRESQL_URL: process.env.POSTGRESQL_URL || 'postgresql://postgres:@Asitha2005b@db.waiqbrnuxkjebghzhovz.supabase.co:5432/postgres',
};