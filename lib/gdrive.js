const { google } = require('googleapis');
const stream = require('stream');

// 👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑
// Drive configuration - Reads from Environment Variables (No credentials.json needed)

function getAuthClient() {
    const CLIENT_ID = process.env.G_CLIENT_ID;
    const CLIENT_SECRET = process.env.G_CLIENT_SECRET;
    const REFRESH_TOKEN = process.env.G_REFRESH_TOKEN;

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        // If keys are missing, don't crash, just log warning
        console.warn("⚠️ Google Drive Credentials missing! Drive upload will not work.");
        return null;
    }

    const oAuth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    );

    oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    return oAuth2Client;
}

async function uploadToDrive(dataStream, fileName, mimeType) {
    try {
        const authClient = getAuthClient();
        if (!authClient) {
            console.log("Skipping Drive Upload (No Auth)");
            return null;
        }

        console.log(`[👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑] Starting Upload Stream: ${fileName}`);
        const drive = google.drive({ version: 'v3', auth: authClient });

        const requestBody = {
            name: fileName,
            parents: process.env.G_ROOT_FOLDER_ID ? [process.env.G_ROOT_FOLDER_ID] : [],
        };

        const media = {
            mimeType: mimeType,
            body: dataStream,
        };

        const response = await drive.files.create({
            requestBody,
            media: media,
            fields: 'id, name, webViewLink',
        });

        console.log(`[👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑] Upload Success! File ID: ${response.data.id}`);
        return response.data;

    } catch (error) {
        console.error('[👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑] Upload Error:', error.message);
        // Don't throw error to prevent bot crash
        return null;
    }
}

module.exports = { uploadToDrive };
