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

    // =============================================================
    // GLOBAL API CONFIGURATION
    // =============================================================
    global: {
        api: {
            alyabot: 'https://rest.alyabotpe.xyz',
            stellar: 'https://api.stellarwa.xyz',
            brainshop: {
                bid: '161197',
                key: '6SxlHBxznZRVydBQ',
                uid: 'SewQueen'
            }
        },
        apikey: 'stellar-3Tjfq4Rj', // Default key for stellar

        // Detailed Key Mapping by Service
        APIKeys: {
            'https://rest.alyabotpe.xyz': 'stellar-yJFoP0BO', // YouTube / Tools
            'https://api.stellarwa.xyz': 'stellar-3Tjfq4Rj',  // Chat / Upload
            'emojimix': 'stellar-dXXUtmL2',
            'tti': 'stellar-SSfb2OPw',
        }
    }
};