/**
 * 👑 ᴘᴏᴡᴇරෙඩ් ʙʏ ＤＭＣ™ 👑
 * FILE: /lib/cookie-manager.js
 * VERSION: v14.1 (Identity Engine)
 */

const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, '../cookies.txt');

const RAW_COOKIES = `
# Netscape HTTP Cookie File
# https://curl.haxx.se/rfc/cookie_spec.html
.youtube.com	TRUE	/	TRUE	1784404435	VISITOR_INFO1_LIVE	OH-KX663pDU
.youtube.com	TRUE	/	TRUE	1784404435	VISITOR_PRIVACY_METADATA	CgJMSxIEGgAgLw%3D%3D
.youtube.com	TRUE	/	TRUE	1803413232	LOGIN_INFO	AFmmF2swRQIgDNYYjz9lJLdH67pUY2lwBlM5Ez-geDy7_s06PpoQ2W8CIQCc8txPkoVPYmIepkg37DN-2ksbL9cq8zpvBr1GArgDvg:QUQ3MjNmeC1NZ29nV1pjWGFmZDFPZzAtbmNWN1VZT1VDZk53cnhPWUlBY01td2l1Q2FESExDZ3VoZHZzRG5EYnVjUEtqUjRqYVk3YlBjdVdYUVZCdlNvdWNKb0l3UVZWTW4xTzJtd3V3QzA0Sk1Yc1gxcGJzRUo1R3RINmRabEhBdVpyVUdWald3TkhXX1EweU1GT2JmRHY0bDdPdkRYbWF3
.youtube.com	TRUE	/	FALSE	1803479482	SID	g.a0005wiTCVxHkPIdIXHqnSVywRzPxQkf7TNlyOvy0vOIs5sEx_Umh4VkyfRfNTgPafSuuysyHgACgYKAQcSARYSFQHGX2Miy3Xodo_hDajCPUpTdlmYTRoVAUF8yKqC-sX3hqIUUfWcqETR6gQH0076
.youtube.com	TRUE	/	TRUE	1803479482	__Secure-1PSID	g.a0005wiTCVxHkPIdIXHqnSVywRzPxQkf7TNlyOvy0vOIs5sEx_Umnh0D8SsBmifr2-OXMOZ4NQACgYKAeESARYSFQHGX2MigikcKor6dvhBY0gebHT3mBoVAUF8yKryYT2_iT2TVwYoeRKBvz7O0076
.youtube.com	TRUE	/	TRUE	1803479482	__Secure-3PSID	g.a0005wiTCVxHkPIdIXHqnSVywRzPxQkf7TNlyOvy0vOIs5sEx_UmmfrKE6y-lYsAul40wrJJMgACgYKAZ0SARYSFQHGX2MicfrPkZ5k4Vu4E1BUTNwVMBoVAUF8yKqmD-ejWm5I0sfoB-9fRPRL0076
.youtube.com	TRUE	/	TRUE	1803522776	PREF	tz=Asia.Colombo&f7=100
.youtube.com	TRUE	/	TRUE	0	YSC	b85Go9FC_cw
`;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'
];

let currentIdentity = {};

function rotateDMCIdentity() {
    const randomVisitorID = `CgJMSxIEGgAg${Math.floor(Math.random() * 999999)}%3D%3D`;
    const randomAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    if (!fs.existsSync(COOKIES_PATH)) {
        fs.writeFileSync(COOKIES_PATH, RAW_COOKIES.trim());
    }

    currentIdentity = {
        agent: randomAgent,
        visitorId: randomVisitorID,
        cookieFile: COOKIES_PATH,
        referer: 'https://youtube.com'
    };
}

setInterval(rotateDMCIdentity, 10 * 60 * 1000);
rotateDMCIdentity();

module.exports = {
    getIdentity: () => currentIdentity,
    refreshNow: () => rotateDMCIdentity()
};
