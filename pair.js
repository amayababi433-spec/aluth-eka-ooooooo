const { makeWASocket, useMultiFileAuthState, delay, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");

(async function start() {
    // Session එක save කරන්න තැනක් හදාගැනීම
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // QR කෝඩ් එක එපා
        logger: pino({ level: "silent" }), // අනවශ්‍ය messages පෙන්නන්න එපා
        browser: Browsers.macOS("Desktop"), // Windows/Mac ඕනෑම එකක් හරියනවා
    });

    // දැනටමත් register වෙලා නැත්නම් විතරක් code එක ඉල්ලන්න
    if (!sock.authState.creds.registered) {
        
        // ✅ ඔයාගේ නම්බර් එක (94 එක්ක)
        const PN = "94717884174"; 
        
        console.log("⏳ Pairing Code එක ගන්න ටිකක් ඉන්න...");
        await delay(3000); // තත්පර 3ක් ඉන්නවා

        try {
            const pairCode = await sock.requestPairingCode(PN);
            // කෝඩ් එක පැහැදිලිව පෙන්වන්න
            console.log("\n==============================");
            console.log("🔐 YOUR PAIRING CODE: " + pairCode);
            console.log("==============================\n");
        } catch (err) {
            console.log("❌ Error: නම්බර් එක වැරදියි හෝ බාධා කිරීමක්. නැවත උත්සාහ කරන්න.");
        }
    }

    // Credentials save කිරීම (Session ID එක හැදෙන්න මේක ඕනේ)
    sock.ev.on("creds.update", saveCreds);

    // බොට් connect වෙන හැටි බලාගන්න
    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "open") {
            console.log("✅ සාර්ථකව සම්බන්ධ වුනා! (Login Successful)");
        } else if (connection === "close") {
            console.log("❌ සම්බන්ධතාවය විසන්ධි විය.");
        }
    });
})();