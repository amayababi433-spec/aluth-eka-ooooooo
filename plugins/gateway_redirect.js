/**
 * 👑 DMC ULTIMATE GATEWAY / AD-TASK DISCOVERY & DEEP URL EXTRACTOR 👑
 * WhatsApp Bot Plugin (Baileys / Node.js)
 * Architecture: DMC_MD_MULTI_UPGRADE_FINAL/newwww/
 * 
 * Pipeline:
 * - STEP 1: Initial Page Load & Deep Token/Cookie Extraction
 * - STEP 2: Simulated Ad & Content Task Validation (Delays + Serial Chaining)
 * - STEP 3: Multi-Endpoint Final Target Query (/final, /target, /:uid/:lid/target)
 * - STEP 4: Recursive Deep JSON Search + Base64 Decoded URL Resolution + Mega/Cloud Hunt
 */

const { cmd } = require('../command');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Injects non-expiring/permanent cookies from linkvertise_cookies.txt
 */
function loadPermanentCookies(cookieStore) {
    try {
        const cookieFile = path.join(__dirname, '../linkvertise_cookies.txt');
        if (fs.existsSync(cookieFile)) {
            const lines = fs.readFileSync(cookieFile, 'utf8').split('\n');
            lines.forEach(line => {
                line = line.trim();
                if (!line || line.startsWith('#')) return;
                const parts = line.split('\t');
                if (parts.length >= 7) {
                    const name = parts[5].trim();
                    const value = parts[6].trim();
                    if (name && value) {
                        cookieStore.set(name, value);
                    }
                }
            });
            console.log(`[DMC Gate] Injected ${cookieStore.size} permanent Linkvertise cookies!`);
        }
    } catch (e) {
        console.warn("[DMC Gate] Cookie file load warning:", e.message);
    }
}

// Cloud Platform Matchers
const MEGA_REGEX = /https?:\/\/(?:www\.)?mega\.nz\/(?:file|folder|#)[\w#!?=&%.-]+/i;
const GDRIVE_REGEX = /https?:\/\/drive\.google\.com\/(?:file\/d\/|drive\/folders\/|open\?id=)[^\s"'>]+/i;
const MEDIAFIRE_REGEX = /https?:\/\/(?:www\.)?mediafire\.com\/(?:file|download|folder)?[^\s"'>]+/i;

// Ad / Gateway Domains for Auto-Detection
const AD_GATE_DOMAINS = [
    'linkvertise', 'link-to.net', 'link-target.net', 'up-to-down.net', 'direct-link.net',
    'gplinks', 'shrinkme', 'droplink', 'ouo.io', 'ouo.press', 'adfly', 'adf.ly',
    'sub2get', 'vurl', 'tinyurl', 'bit.ly', 'redirect', 'gate', 'short', 'adlink'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate Dynamic Base64 Serial Token
 */
function generateSerial(linkId) {
    const payload = {
        timestamp: Date.now(),
        random: Math.floor(1000000 + Math.random() * 9000000).toString(),
        link_id: linkId || ""
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Clean URL from tracking parameters
 */
function cleanUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
        const u = new URL(rawUrl);
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
        trackingParams.forEach(p => u.searchParams.delete(p));
        return u.toString();
    } catch (_) {
        return rawUrl;
    }
}

/**
 * STEP 4: Deep Recursive JSON Parser & URL Extractor
 * Recursively scans any depth of JSON response, parses Base64 strings,
 * and searches for hidden destination URLs.
 */
function extractFinalDestinationUrl(responseObj) {
    if (!responseObj) return null;

    // Direct String response check
    if (typeof responseObj === 'string') {
        const megaMatch = responseObj.match(MEGA_REGEX);
        if (megaMatch) return megaMatch[0];

        const gdriveMatch = responseObj.match(GDRIVE_REGEX);
        if (gdriveMatch) return gdriveMatch[0];

        const mfMatch = responseObj.match(MEDIAFIRE_REGEX);
        if (mfMatch) return mfMatch[0];

        const directHttp = responseObj.match(/https?:\/\/[^\s"'>]+/i);
        if (directHttp) return directHttp[0];

        return null;
    }

    if (typeof responseObj !== 'object') return null;

    const targetKeys = [
        'destination_url',
        'destinationUrl',
        'target',
        'target_url',
        'redirect_url',
        'redirectUrl',
        'final_url',
        'finalUrl',
        'url',
        'download_url',
        'link'
    ];

    function deepSearch(obj) {
        if (!obj || typeof obj !== 'object') return null;

        // 1. Direct key inspection
        for (const key of targetKeys) {
            if (typeof obj[key] === 'string' && obj[key].trim() !== '') {
                const candidate = obj[key].trim();

                // Direct HTTP/HTTPS match
                if (/^https?:\/\//i.test(candidate)) {
                    return candidate;
                }

                // Base64 encoded URL detection
                try {
                    const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
                    if (/^https?:\/\//i.test(decoded)) {
                        return decoded;
                    }
                } catch (_) {}
            }
        }

        // 2. Recursive child search
        for (const k of Object.keys(obj)) {
            if (typeof obj[k] === 'object' && obj[k] !== null) {
                const found = deepSearch(obj[k]);
                if (found) return found;
            }
        }

        return null;
    }

    return deepSearch(responseObj);
}

/**
 * CORE EXECUTION ENGINE: Steps 1 -> 2 -> 3 -> 4
 */
async function executeGatewayBypass(inputUrl, reply) {
    let parsedUrl;
    try {
        parsedUrl = new URL(inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`);
    } catch (e) {
        return reply("❌ *Invalid URL format!* Please provide a valid http/https web link.");
    }

    const gateUrl = parsedUrl.href;
    const baseOrigin = parsedUrl.origin;

    // ⚡ Instant parameter decoding for Linkvertise (?r=base64) & similar gates
    try {
        for (const [key, val] of parsedUrl.searchParams.entries()) {
            if (val && val.length > 20) {
                try {
                    let b64clean = val.replace(/\^/g, '+').replace(/_/g, '/');
                    while (b64clean.length % 4 !== 0) b64clean += '=';
                    const decoded = Buffer.from(b64clean, 'base64').toString('utf-8');
                    const cleanMatch = decoded.match(/https?:\/\/[^\s"'<>]+/i);
                    if (cleanMatch) {
                        return await reply(`👑 *GATE UNLOCKED INSTANTLY!* 👑\n\n🎯 *Destination URL:*\n👉 ${cleanUrl(cleanMatch[0])}\n\n_Decoded directly from Linkvertise/Gateway parameter._`);
                    }
                } catch (_) {}
            }
        }
    } catch (_) {}

    await reply(`⚡ *DMC Gate Bypass & Deep Extractor Activated!*\n\n🔗 *Target:* ${gateUrl}\n🌐 *Origin:* ${baseOrigin}\n\n⏳ _Simulating human interaction & discovering endpoints..._`);

    // Cookie Jar
    const cookieStore = new Map();
    loadPermanentCookies(cookieStore); // Inject permanent cookies (valid until 2038)
    const updateCookies = (res) => {
        const setCookie = res.headers && res.headers['set-cookie'];
        if (setCookie && Array.isArray(setCookie)) {
            setCookie.forEach((c) => {
                const [pair] = c.split(';');
                const [k, v] = pair.split('=');
                if (k && v) cookieStore.set(k.trim(), v.trim());
            });
        }
    };

    const getCookieHeader = () => {
        const pairs = [];
        for (const [k, v] of cookieStore.entries()) pairs.push(`${k}=${v}`);
        return pairs.join('; ');
    };

    const defaultHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": baseOrigin,
        "Referer": gateUrl,
        "X-Requested-With": "XMLHttpRequest"
    };

    try {
        // =========================================================================
        // STEP 1: Initial Page Load & Variable/Token Extraction
        // =========================================================================
        console.log(`[DMC Gate] STEP 1: Loading initial gate ${gateUrl}`);
        const step1Res = await axios.get(gateUrl, {
            headers: {
                ...defaultHeaders,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            },
            timeout: 20000,
            maxRedirects: 5,
            validateStatus: () => true
        });

        updateCookies(step1Res);

        // Check if destination was directly redirected or in page
        const initialRedirectUrl = step1Res.request?.res?.responseUrl;
        if (initialRedirectUrl && initialRedirectUrl !== gateUrl && !initialRedirectUrl.includes('gate') && !initialRedirectUrl.includes('redirect')) {
            return await reply(`👑 *GATE UNLOCKED DIRECTLY!* 👑\n\n🎯 *Final Destination:*\n👉 ${cleanUrl(initialRedirectUrl)}\n\n_Bypassed via HTTP redirect tracking._`);
        }

        const html = typeof step1Res.data === 'string' ? step1Res.data : JSON.stringify(step1Res.data || '');

        // Immediate Cloud link hunt
        const immediateTarget = extractFinalDestinationUrl(html);
        if (immediateTarget && (immediateTarget.includes('mega.nz') || immediateTarget.includes('drive.google.com') || immediateTarget.includes('mediafire.com'))) {
            return await reply(`👑 *DESTINATION URL EXTRACTED!* 👑\n\n🎯 *Output Link:*\n👉 ${cleanUrl(immediateTarget)}\n\n_Found directly in page state._`);
        }

        const extractKey = (key) => {
            const match = html.match(new RegExp(`["']?${key}["']?\\s*[:=]\\s*["']([^"']+)["']`, 'i'));
            return match ? match[1] : null;
        };

        let linkId = extractKey('link_id') || parsedUrl.searchParams.get('id') || "sample_link_id";
        let userId = extractKey('user_id') || "";
        let challengeId = extractKey('challenge_id') || "";
        let token = extractKey('token') || parsedUrl.searchParams.get('token') || "sample_token";
        let sessionId = extractKey('session_id') || "";

        console.log(`[DMC Gate] Step 1 State: link_id=${linkId}, token=${token}, user_id=${userId}`);

        // =========================================================================
        // STEP 2: Simulate Ad/Task Discovery & Multi-Step Validation
        // =========================================================================
        const discoverySteps = [
            { name: 'impression_start', endpoint: `${baseOrigin}/api/v1/redirect/link/impressions`, delayMs: 2000 },
            { name: 'discover_articles_validate', endpoint: `${baseOrigin}/api/v1/redirect/link/validate`, delayMs: 5000 },
            { name: 'complete_task_validate', endpoint: `${baseOrigin}/api/v1/redirect/link/complete`, delayMs: 3000 }
        ];

        let unlockedTarget = null;

        for (const step of discoverySteps) {
            console.log(`[DMC Gate] Simulating delay (${step.delayMs / 1000}s) for [${step.name}]...`);
            await sleep(step.delayMs);

            const payload = {
                link_id: linkId,
                challenge_id: challengeId,
                token: token,
                session_id: sessionId,
                step: step.name,
                timestamp: Date.now(),
                serial: generateSerial(linkId)
            };

            const stepRes = await axios.post(step.endpoint, payload, {
                headers: {
                    ...defaultHeaders,
                    "Cookie": getCookieHeader()
                },
                timeout: 12000,
                validateStatus: () => true
            });

            updateCookies(stepRes);
            const resData = stepRes.data || {};

            // Check if step returned destination URL
            const foundUrl = extractFinalDestinationUrl(resData);
            if (foundUrl) {
                unlockedTarget = foundUrl;
                console.log(`[DMC Gate] 🎯 Early target unlock at [${step.name}]: ${foundUrl}`);
                break;
            }

            // Update continuation token
            const newToken = resData?.data?.token || resData?.token;
            if (newToken) {
                token = newToken;
                console.log(`[DMC Gate] 🔄 Continuation token updated: ${token}`);
            }
        }

        // =========================================================================
        // STEP 3: Multi-Endpoint Final Target Query
        // =========================================================================
        if (!unlockedTarget) {
            console.log(`[DMC Gate] STEP 3: Testing final destination endpoints...`);
            await sleep(2000);

            const finalEndpoints = [
                `${baseOrigin}/api/v1/redirect/link/final`,
                `${baseOrigin}/api/v1/redirect/link/target`,
                (userId && linkId) ? `${baseOrigin}/api/v1/redirect/link/${userId}/${linkId}/target` : null,
                linkId ? `${baseOrigin}/api/v1/redirect/link/${linkId}/target` : null
            ].filter(Boolean);

            for (const endpoint of finalEndpoints) {
                try {
                    const finalPayload = {
                        link_id: linkId,
                        challenge_id: challengeId,
                        token: token,
                        session_id: sessionId,
                        timestamp: Date.now(),
                        serial: generateSerial(linkId)
                    };

                    const finalRes = await axios.post(endpoint, finalPayload, {
                        headers: {
                            ...defaultHeaders,
                            "Cookie": getCookieHeader()
                        },
                        timeout: 12000,
                        maxRedirects: 5,
                        validateStatus: () => true
                    });

                    updateCookies(finalRes);

                    // Check HTTP redirect
                    const redirected = finalRes.request?.res?.responseUrl;
                    if (redirected && redirected !== endpoint && !redirected.includes('/api/v1/')) {
                        unlockedTarget = redirected;
                        break;
                    }

                    // Deep Step 4 Extraction on JSON
                    const extracted = extractFinalDestinationUrl(finalRes.data);
                    if (extracted) {
                        unlockedTarget = extracted;
                        break;
                    }
                } catch (e) {
                    console.warn(`[DMC Gate] Endpoint ${endpoint} failed: ${e.message}`);
                }
            }
        }

        // =========================================================================
        // STEP 4: Deliver Clean Unlocked Link to WhatsApp
        // =========================================================================
        if (unlockedTarget) {
            const cleanFinal = cleanUrl(unlockedTarget);
            const isMega = cleanFinal.includes('mega.nz');
            const isDrive = cleanFinal.includes('drive.google.com');
            const isMediaFire = cleanFinal.includes('mediafire.com');

            let platformText = "";
            if (isMega) platformText = "\n📦 *Platform:* 🔴 *MEGA.NZ*";
            else if (isDrive) platformText = "\n📦 *Platform:* 📁 *Google Drive*";
            else if (isMediaFire) platformText = "\n📦 *Platform:* 🔥 *MediaFire*";

            return await reply(`👑 *DMC GATEWAY BYPASS COMPLETED!* 👑\n\n🛡️ *Ad Layers Filtered:* 100% Success${platformText}\n\n🎁 *Final Destination URL:*\n👉 ${cleanFinal}\n\n⏱️ *Completed All 4 Steps:*\n1. Token & Cookie Capture ✅\n2. Simulated Interaction & Task Delay ✅\n3. Multi-Endpoint Resolution ✅\n4. Deep JSON & Base64 URL Extraction ✅`);
        } else {
            return await reply(`⚠️ *Simulation completed, but no direct URL could be resolved.*\n\n_Tip: This link might require human interactive captcha (Turnstile/hCaptcha) that blocks headless execution._`);
        }

    } catch (err) {
        console.error("[DMC Gate Engine Error]", err);
        return reply(`❌ *Execution Error:* ${err.message || 'Unknown network error'}`);
    }
}

// =============================================================================
// 1. MANUAL COMMANDS (.gate, .bypass, .mega, .unshort, .redirect)
// =============================================================================
cmd({
    pattern: "gate",
    alias: ["bypass", "mega", "adtask", "unshort", "redirect", "gatepass"],
    desc: "Simulate Ad/Task discovery and deep extract final destination URL",
    category: "tools",
    filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
    if (!q || !q.trim()) {
        return reply("⚠️ *Please provide a link!*\n\n*Usage:*\n.gate <url>\n\n*Example:*\n.gate https://example.com/gate-link");
    }
    await executeGatewayBypass(q.trim(), reply);
});

// =============================================================================
// 2. PASSIVE LISTENER: Direct Paste in Chat without command
// =============================================================================
cmd({
    on: "body"
},
async (conn, mek, m, { from, body, reply }) => {
    try {
        if (!body) return;

        const trimmed = body.trim();

        // Ignore commands
        if (trimmed.startsWith('.') || trimmed.startsWith('!') || trimmed.startsWith('/')) return;

        // Ignore media services already handled by other plugins (YouTube, TikTok, FB)
        if (/youtube\.com|youtu\.be|tiktok\.com|facebook\.com|fb\.watch|fb\.com/i.test(trimmed)) return;

        // Extract any HTTP/HTTPS URL from message (supports multi-line WhatsApp link previews)
        const urlMatch = body.match(/https?:\/\/[^\s"'<>]+/i);
        if (!urlMatch) return;

        const targetUrl = urlMatch[0];
        const lower = targetUrl.toLowerCase();

        const isAdGate = AD_GATE_DOMAINS.some(domain => lower.includes(domain));
        const hasRedirectParam = lower.includes('/redirect/') || lower.includes('/link/') || lower.includes('gate');

        if (isAdGate || hasRedirectParam) {
            console.log(`[DMC Auto-Listener] Detected Gateway Link: ${targetUrl}`);
            await executeGatewayBypass(targetUrl, reply);
        }
    } catch (err) {
        console.error("[DMC Auto-Listener Error]", err.message);
    }
});
