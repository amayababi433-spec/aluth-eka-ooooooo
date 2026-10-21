/**
 * 👑 DMC MOVIE, TV SERIES & 1-TAP SINHALA SUBTITLE SYSTEM (UNIVERSAL AUTO-MIND) 👑
 * FEATURES:
 *  - Universal Dynamic Live Series Engine (.series / .tv / .oplive for ANY Series/Category)
 *  - 100% Real-Time Live Scraping (NO Hardcoded Arrays, Zero Stock Data)
 *  - 1-Tap Episode Download Link & 1-Tap Subtitle Link for EVERY Single Episode
 *  - Specific Season Filtering (e.g. "ONE PIECE season 2", "Loki season 1")
 *  - Dedicated .ep Command for 1-Tap Episode Extraction (Direct Servers, Telegram, Links)
 *  - Live Baiscope Subtitle Redeem Engine (.srt / .zip directly to WhatsApp Document)
 *  - Safe TG Cloud Engine (Zero load on Azure free tier, No image 403 crashes)
 */

const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const yts = require('yt-search');
const DownloadGuard = require('../lib/downloadGuard');
const { fetchMediaWithFailover } = require('./downloader');

// Session store for interactive menu selections
if (!global.movieSessions) global.movieSessions = {};

// Helper: 1-Tap WhatsApp Link Generator
function createOneTapLink(botNumber, commandText) {
    const cleanNum = (botNumber || '').split(':')[0].split('@')[0];
    return `https://wa.me/${cleanNum}?text=${encodeURIComponent(commandText)}`;
}

// Helper: Clean Title For Display
function cleanTitleForDisplay(rawTitle) {
    if (!rawTitle) return "TV Series";
    return rawTitle
        .replace(/Sinhala\s*Subtitles.*/i, '')
        .replace(/සිංහල\s*උපසිරැ?සි.*/i, '')
        .replace(/\|\s*$/g, '')
        .replace(/-\s*$/g, '')
        .trim();
}

// Helper: Sanitize search query for robust tolerance against typos and symbols
function sanitizeSearchQuery(raw) {
    if (!raw) return "";
    return raw
        .replace(/[\(\)\[\]\{\}<>]/g, ' ')
        .replace(/[!?,;:@#$%^&*+=~`]/g, ' ')
        .replace(/\b(?:19|20)\d{2}\b/g, '')
        .replace(/\b(?:season|series|s)\s*\d+/gi, '')
        .replace(/\b(?:episode|ep)\s*\d+/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Helper: Google Suggest Real-time Typo-Correction & Query Expansion
async function getSearchEngineSuggestions(query) {
    const list = [query];
    try {
        const urls = [
            `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query + ' movie')}`,
            `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`
        ];
        for (const u of urls) {
            const res = await axios.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 4000 });
            if (res.data && Array.isArray(res.data[1])) {
                res.data[1].forEach(s => {
                    const clean = s.replace(/\bmovie\b/gi, '').replace(/\bfilm\b/gi, '').trim();
                    if (clean.length >= 2 && !list.includes(clean)) {
                        list.push(clean);
                    }
                });
            }
            if (list.length >= 5) break;
        }
    } catch (e) {}
    return list;
}

// Helper: Clean Movie Title (Noise & metadata strip)
function cleanMovieTitle(raw) {
    if (!raw) return '';
    return raw
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/\|.*/g, '')
        .replace(/-\s*(?:Starring|Full Movie|Official|Hindi|Tamil|Telugu|Malayalam|Kannada|English|Sinhala|Korean|Chinese|Japanese).*/gi, '')
        .replace(/\b(?:Hindi|Tamil|Telugu|Malayalam|Kannada|English|Sinhala|Korean|Chinese|Japanese)\s+(?:Full\s+)?(?:Movie|Film|Cinema)\b.*/gi, '')
        .replace(/\b(?:Full\s+Movie|Full\s+Film|4K\s+UHD|4K|UHD|1080p|720p|480p|HDRip|WEB-DL|BluRay|BRRip|DVDRip|x264|x265|HEVC)\b.*/gi, '')
        .replace(/\[.*?\]|\(.*?\)/g, ' ')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─────────────────────────────────────────────────────────────
// 1. UNIVERSAL SUBTITLE ENGINE (Multi-Tier: Baiscope + SubtitleCat + YTS)
// ─────────────────────────────────────────────────────────────
async function fetchBaiscope(baseTitle, year = '', targetSeason = null, targetEp = null) {
    try {
        const searchTerms = [
            targetSeason && targetEp ? `${baseTitle} S0${targetSeason}E0${targetEp}` : null,
            year ? `${baseTitle} ${year}` : null,
            baseTitle
        ].filter(Boolean);

        let posts = [];
        for (const st of searchTerms) {
            try {
                const searchRes = await axios.get(`https://www.baiscope.lk/search?q=${encodeURIComponent(st)}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    timeout: 6000
                });

                const $ = cheerio.load(searchRes.data);
                $('article').each((i, el) => {
                    const link = $(el).find('a').attr('href');
                    const title = $(el).find('a').text().trim().replace(/\s+/g, ' ');
                    if (link && title && posts.length < 8) {
                        const fullUrl = link.startsWith('http') ? link : `https://www.baiscope.lk${link}`;
                        if (!posts.some(p => p.url === fullUrl)) {
                            posts.push({ title, url: fullUrl });
                        }
                    }
                });
                if (posts.length > 0) break;
            } catch (e) {}
        }

        if (posts.length === 0) return null;

        const searchKeywords = baseTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'with'].includes(w));
        let targetPost = null;
        let bestScore = 0;

        posts.forEach(p => {
            const lower = p.title.toLowerCase();
            let score = 0;
            searchKeywords.forEach(w => {
                if (lower.includes(w)) score += 2;
            });
            if (year && lower.includes(year)) score += 3;
            if (targetSeason && targetEp) {
                const sStr = `s0${targetSeason}`.toLowerCase();
                const eStr = `e0${targetEp}`.toLowerCase();
                if (lower.includes(sStr) && lower.includes(eStr)) score += 5;
            }
            if (score > bestScore) {
                bestScore = score;
                targetPost = p;
            }
        });

        if (!targetPost || bestScore === 0) return null;

        const postRes = await axios.get(targetPost.url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000
        });

        const $p = cheerio.load(postRes.data);
        let downloadGateUrl = null;
        $p('a').each((i, el) => {
            const href = $p(el).attr('href') || '';
            if (href.includes('/download/') && !downloadGateUrl) {
                downloadGateUrl = href.startsWith('http') ? href : `https://www.baiscope.lk${href}`;
            }
        });

        if (!downloadGateUrl) return null;

        const gateRes = await axios.get(downloadGateUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': targetPost.url },
            timeout: 8000
        });

        const $g = cheerio.load(gateRes.data);
        const gate = $g('[data-gate]');
        const id = Number(gate.attr('data-id'));
        const slug = gate.attr('data-slug') || '';
        const wait = Number(gate.attr('data-wait')) || 5;
        const token = gate.attr('data-token') || '';

        if (!token || !id) return null;

        await new Promise(r => setTimeout(r, (wait + 1) * 1000));

        const redeemRes = await axios.post('https://www.baiscope.lk/api/download/redeem', {
            token, id, post: slug
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': downloadGateUrl,
                'Origin': 'https://www.baiscope.lk',
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (redeemRes.data?.data?.url) {
            const relUrl = redeemRes.data.data.url;
            const fullFileUrl = relUrl.startsWith('http') ? relUrl : `https://www.baiscope.lk${relUrl}`;
            const fileName = redeemRes.data.data.file_name || `${baseTitle.replace(/[^\w\s-]/gi, '')}_SinhalaSub.zip`;
            const fileRes = await axios.get(fullFileUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': downloadGateUrl },
                responseType: 'arraybuffer',
                timeout: 15000
            });

            return {
                title: targetPost.title,
                fileName,
                fileSize: fileRes.data.length,
                buffer: Buffer.from(fileRes.data),
                source: 'Baiscope (Sinhala)',
                language: 'Sinhala',
                mimetype: 'application/zip',
                isSinhala: true
            };
        }
    } catch (e) {
        console.error('[Baiscope] Error:', e.message);
    }
    return null;
}

async function fetchSubtitleCat(title, year = '', season = null, ep = null) {
    try {
        const queryVariants = [
            season && ep ? `${title} S${season < 10 ? '0' + season : season}E${ep < 10 ? '0' + ep : ep}` : null,
            year ? `${title} ${year}` : null,
            title
        ].filter(Boolean);

        for (const q of queryVariants) {
            const searchUrl = 'https://www.subtitlecat.com/index.php?search=' + encodeURIComponent(q);
            const res = await axios.get(searchUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 8000
            });
            const $ = cheerio.load(res.data);
            const items = [];
            $('table.table tr').each((i, el) => {
                const link = $(el).find('a').attr('href');
                const t = $(el).find('a').text().trim();
                if (link && t) items.push({ title: t, link });
            });

            if (items.length === 0) continue;

            const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            let bestItem = null;
            let bestScore = -1;

            for (const item of items) {
                const lower = item.title.toLowerCase();
                let score = 0;
                titleWords.forEach(w => {
                    if (lower.includes(w)) score += 3;
                });
                if (year && lower.includes(year.toString())) score += 5;
                if (season && ep) {
                    const epTag1 = `s0${season}e0${ep}`.toLowerCase();
                    const epTag2 = `s${season}e${ep}`.toLowerCase();
                    const epTag3 = `${season}x${ep}`.toLowerCase();
                    if (lower.includes(epTag1) || lower.includes(epTag2) || lower.includes(epTag3)) score += 10;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestItem = item;
                }
            }

            if (!bestItem || bestScore <= 0) continue;

            const pageUrl = bestItem.link.startsWith('http') ? bestItem.link : 'https://www.subtitlecat.com/' + bestItem.link;
            const pRes = await axios.get(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 8000
            });

            const $p = cheerio.load(pRes.data);
            let siLink = null;
            let enLink = null;
            let firstLink = null;

            $p('a').each((i, el) => {
                const href = $p(el).attr('href') || '';
                if (href.endsWith('.srt')) {
                    if (!firstLink) firstLink = href;
                    if (href.includes('-si.srt')) siLink = href;
                    if (href.includes('-en.srt')) enLink = href;
                }
            });

            const targetLink = siLink || enLink || firstLink;
            if (targetLink) {
                const fullDl = targetLink.startsWith('http') ? targetLink : 'https://www.subtitlecat.com' + targetLink;
                const isSinhala = targetLink.includes('-si.srt');
                const langName = isSinhala ? 'Sinhala' : (targetLink.includes('-en.srt') ? 'English' : 'Multi');

                const srtRes = await axios.get(fullDl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    responseType: 'arraybuffer',
                    timeout: 15000
                });

                const buffer = Buffer.from(srtRes.data);
                const safeName = title.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_');
                return {
                    title: bestItem.title,
                    fileName: `${safeName}_${langName}Sub.srt`,
                    fileSize: buffer.length,
                    buffer,
                    source: `SubtitleCat (${langName})`,
                    language: langName,
                    mimetype: 'text/plain',
                    isSinhala
                };
            }
        }
    } catch (e) {
        console.error('[SubtitleCat] Error:', e.message);
    }
    return null;
}

async function fetchYtsSubs(title, year = '') {
    try {
        const searchUrl = 'https://yts-subs.com/search/' + encodeURIComponent(title);
        const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        const $ = cheerio.load(res.data);
        const movies = [];
        $('.media-movie-clickable').each((i, el) => {
            const t = $(el).find('h3').text().trim();
            const h = $(el).find('a').attr('href');
            if (t && h) movies.push({ title: t, href: h });
        });

        if (movies.length === 0) return null;

        const lowerTitle = title.toLowerCase();
        let targetMovie = movies[0];
        for (const m of movies) {
            const mLower = m.title.toLowerCase();
            if (year && mLower.includes(year)) { targetMovie = m; break; }
            if (mLower === lowerTitle) { targetMovie = m; break; }
        }

        const moviePageUrl = 'https://yts-subs.com' + targetMovie.href;
        const mRes = await axios.get(moviePageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });

        const $m = cheerio.load(mRes.data);
        const subs = [];
        $m('tr').each((i, el) => {
            const lang = $m(el).find('.sub-lang').text().trim();
            const a = $m(el).find('a[href*="/subtitles/"]');
            if (lang && a.length) {
                subs.push({ lang, href: a.attr('href') });
            }
        });

        if (subs.length === 0) return null;

        const siSub = subs.find(s => s.lang.toLowerCase().includes('sinhala'));
        const enSub = subs.find(s => s.lang.toLowerCase().includes('english'));
        const chosen = siSub || enSub || subs[0];

        const subPageUrl = 'https://yts-subs.com' + chosen.href;
        const subRes = await axios.get(subPageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });

        const $s = cheerio.load(subRes.data);
        const dataLink = $s('#btn-download-subtitle, .download-subtitle').attr('data-link');
        if (!dataLink) return null;

        const downloadUrl = Buffer.from(dataLink, 'base64').toString('utf8');
        const zipRes = await axios.get(downloadUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            responseType: 'arraybuffer',
            timeout: 15000
        });

        const buffer = Buffer.from(zipRes.data);
        const safeName = title.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_');
        const isSinhala = chosen.lang.toLowerCase().includes('sinhala');
        return {
            title: targetMovie.title,
            fileName: `${safeName}_${isSinhala ? 'Sinhala' : chosen.lang}Sub.zip`,
            fileSize: buffer.length,
            buffer,
            source: `YTS (${chosen.lang})`,
            language: chosen.lang,
            mimetype: 'application/zip',
            isSinhala
        };
    } catch (e) {
        console.error('[YTS] Error:', e.message);
    }
    return null;
}

async function fetchSinhalaSubtitle(rawQuery) {
    try {
        const cleaned = cleanMovieTitle(rawQuery);
        const yearMatch = rawQuery.match(/\b(19\d\d|20\d\d)\b/);
        const year = yearMatch ? yearMatch[1] : '';

        const sMatch = rawQuery.match(/s(\d+)\s*e(\d+)/i) || rawQuery.match(/season\s*(\d+).*?episode\s*(\d+)/i);
        const season = sMatch ? parseInt(sMatch[1], 10) : null;
        const ep = sMatch && sMatch[2] ? parseInt(sMatch[2], 10) : null;

        const baseTitle = cleaned || sanitizeSearchQuery(rawQuery);

        // Tier 1: Baiscope Live Redeem Engine (Local Sri Lankan Sinhala Subtitles)
        const baiscopeSub = await fetchBaiscope(baseTitle, year, season, ep);
        if (baiscopeSub && baiscopeSub.buffer) return baiscopeSub;

        // Tier 2: SubtitleCat Universal Engine (100+ languages, prioritizing Sinhala)
        const catSub = await fetchSubtitleCat(baseTitle, year, season, ep);
        if (catSub && catSub.buffer) return catSub;

        // Tier 3: YTS Subtitle Archives (Global movies in Sinhala / English)
        const ytsSub = await fetchYtsSubs(baseTitle, year);
        if (ytsSub && ytsSub.buffer) return ytsSub;

    } catch (e) {
        console.error("Universal Subtitle Fetch Error:", e.message);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// 1.5 AUTO-VERIFY PORTAL BYPASS & SERVER FORMATTER (Image 2 -> Image 3)
// ─────────────────────────────────────────────────────────────
async function bypassPortalAndResolve(portalUrl) {
    try {
        let directUrl = null;
        let fileName = null;
        let sizeBytes = 0;
        let sizeMb = 0;
        let sizeFormatted = 'Direct Stream';
        let quality = 'HD';
        let contentType = 'video/mp4';

        if (portalUrl.includes('cdn.sinhalasub.net') || portalUrl.includes('ddl.sinhalasub.net') || portalUrl.endsWith('.mp4')) {
            directUrl = portalUrl;
        } else {
            const res = await axios.get(portalUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Referer': 'https://sinhalasub.lk/'
                },
                timeout: 10000
            });

            // Auto-verify Image 2: bypass 3 decoy verification buttons & extract real stream
            const m = res.data.match(/var\s+zluFinalLink\s*=\s*['"]([^'"]+)['"]/i);
            if (m && m[1]) {
                directUrl = m[1].trim();
            } else {
                const $ = cheerio.load(res.data);
                const found = $('a[href*="cdn.sinhalasub.net"], a[href*="ddl.sinhalasub.net"], a[href*="pixeldrain.com/u/"]').first().attr('href');
                if (found) {
                    directUrl = found;
                }
            }
        }

        if (!directUrl) {
            return { success: false, error: "Direct stream link not found in portal." };
        }

        if (directUrl.includes('pixeldrain.com/u/')) {
            const pdId = directUrl.split('/u/')[1].split('/')[0].split('?')[0];
            directUrl = `https://pixeldrain.com/api/file/${pdId}?download`;
        }

        if (directUrl.includes('1080p') || directUrl.toLowerCase().includes('1080')) quality = '1080p FHD';
        else if (directUrl.includes('720p') || directUrl.toLowerCase().includes('720')) quality = '720p HD';
        else if (directUrl.includes('480p') || directUrl.toLowerCase().includes('480')) quality = '480p SD';

        try {
            const head = await axios.head(directUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': 'https://sinhalasub.lk/'
                },
                timeout: 5000
            });

            if (head.headers['content-type']) {
                contentType = head.headers['content-type'];
            }

            const bytes = parseInt(head.headers['content-length'] || '0', 10);
            if (bytes > 0) {
                sizeBytes = bytes;
                sizeMb = bytes / (1024 * 1024);
                if (sizeMb >= 1024) {
                    sizeFormatted = (sizeMb / 1024).toFixed(2) + ' GB';
                } else {
                    sizeFormatted = sizeMb.toFixed(1) + ' MB';
                }

                if (quality === 'HD') {
                    if (sizeMb > 1100) quality = '1080p FHD';
                    else if (sizeMb > 500) quality = '720p HD';
                    else quality = '480p SD';
                }
            }

            const disp = head.headers['content-disposition'];
            if (disp) {
                const fnMatch = disp.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\n]+)['"]?/i);
                if (fnMatch && fnMatch[1]) {
                    fileName = decodeURIComponent(fnMatch[1].replace(/['"]/g, '').trim());
                }
            }
        } catch (e) {}

        if (sizeMb === 0) {
            if (quality === '1080p FHD' || directUrl.toLowerCase().includes('1080')) {
                sizeMb = 1250;
                sizeFormatted = '1.25 GB (HD)';
            } else if (quality === '720p HD' || directUrl.toLowerCase().includes('720')) {
                sizeMb = 750;
                sizeFormatted = '750 MB (HD)';
            } else {
                sizeMb = 350;
                sizeFormatted = 'Direct Stream (HD)';
            }
        }

        if (!fileName) {
            try {
                const urlParts = directUrl.split('?')[0].split('/');
                const lastPart = urlParts[urlParts.length - 1];
                if (lastPart && (lastPart.includes('.mp4') || lastPart.includes('.mkv'))) {
                    fileName = decodeURIComponent(lastPart);
                }
            } catch (e) {}
        }

        if (!fileName) {
            fileName = `Video_${Date.now()}.mp4`;
        }

        if (!fileName.toLowerCase().endsWith('.mp4') && !fileName.toLowerCase().endsWith('.mkv')) {
            fileName += '.mp4';
        }

        return {
            success: true,
            portalUrl,
            directUrl,
            fileName,
            sizeBytes,
            sizeMb,
            sizeFormatted,
            quality,
            contentType
        };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function formatEpisodeServers(serverLinks, botNum) {
    if (!serverLinks || serverLinks.length === 0) return "";

    const topServers = serverLinks.slice(0, 5);
    const resolved = await Promise.all(topServers.map(async (srv) => {
        try {
            const res = await Promise.race([
                bypassPortalAndResolve(srv.url),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2500))
            ]);
            if (res && res.success) {
                return {
                    name: srv.name,
                    url: srv.url,
                    quality: res.quality,
                    sizeFormatted: res.sizeFormatted
                };
            }
        } catch (e) {}
        return { name: srv.name, url: srv.url };
    }));

    let text = "📥 *Direct Download Servers (Auto-Mind 1-Tap):*\n";
    resolved.forEach((srv) => {
        const tapDl = botNum ? createOneTapLink(botNum, `.dlep ${srv.url}`) : '';
        const badge = srv.quality ? ` [${srv.quality}]` : '';
        const sizeBadge = srv.sizeFormatted && srv.sizeFormatted !== 'Direct Stream' ? ` (${srv.sizeFormatted})` : '';

        text += `• 🚀 *${srv.name}${badge}${sizeBadge}:*\n`;
        if (tapDl) {
            text += `  ╰┈➤ 👆 📥 *1-Tap Download Video (MP4 Document):*\n  ${tapDl}\n`;
        }
        text += `  🌐 *Portal Link:* ${srv.url}\n\n`;
    });

    return text;
}

// ─────────────────────────────────────────────────────────────
// 1.8 WORKING DIRECT SERVER AUTO-PICKER & SCRAPER HELPERS
// ─────────────────────────────────────────────────────────────
async function extractServersFromPage(pageUrl) {
    try {
        const res = await axios.get(pageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        const servers = [];
        $('a').each((i, el) => {
            const h = $(el).attr('href') || '';
            const t = $(el).text().trim();
            if (h.includes('/links/') && (
                t.includes('DLServer') || 
                t.includes('Server') || 
                t.includes('Download') || 
                t.includes('Pixeldrain') || 
                t.includes('Direct')
            )) {
                if (!servers.some(s => s.url === h)) {
                    let priority = 10;
                    if (t.includes('DLServer-01') || t.includes('DLServer 01')) priority = 1;
                    else if (t.includes('Pixeldrain')) priority = 2;
                    else if (t.includes('DLServer-02')) priority = 3;
                    else if (t.includes('720p')) priority = 4;
                    else if (t.includes('1080p')) priority = 5;

                    servers.push({ name: t, url: h, priority });
                }
            }
        });

        servers.sort((a, b) => a.priority - b.priority);
        return servers;
    } catch (e) {
        return [];
    }
}

async function autoPickWorkingServer(servers) {
    if (!servers || servers.length === 0) return null;

    for (const srv of servers) {
        try {
            const resolved = await bypassPortalAndResolve(srv.url);
            if (resolved.success && resolved.directUrl) {
                return {
                    serverName: srv.name,
                    ...resolved
                };
            }
        } catch (e) {}
    }
    return null;
}

// Helper: Extract accurate file size and formatted string from YouTube Media Data
function extractSizeFromYtData(ytData) {
    let sizeMb = 0;
    let sizeFormatted = 'HD Stream';

    // 1. Check clen in download_url (Content-Length bytes from googlevideo)
    const clenMatch = (ytData?.download_url || '').match(/clen(?:%3D|=)(\d+)/i);
    if (clenMatch && clenMatch[1]) {
        const bytes = parseInt(clenMatch[1], 10);
        sizeMb = parseFloat((bytes / (1024 * 1024)).toFixed(1));
        sizeFormatted = `${sizeMb} MB`;
    } else if (ytData?.filesize_mb) {
        sizeMb = parseFloat(ytData.filesize_mb);
        sizeFormatted = `${sizeMb} MB`;
    } else if (ytData?.size_bytes) {
        sizeMb = parseFloat((ytData.size_bytes / (1024 * 1024)).toFixed(1));
        sizeFormatted = `${sizeMb} MB`;
    } else if (ytData?.duration) {
        // Full movie estimate ~3.8MB/min for 720p/1080p
        const durSec = typeof ytData.duration === 'number' ? ytData.duration : (parseInt(ytData.duration, 10) || 0);
        if (durSec > 0) {
            sizeMb = parseFloat(((durSec / 60) * 3.8).toFixed(1));
            sizeFormatted = `~${sizeMb} MB`;
        }
    }

    return { sizeMb, sizeFormatted };
}

async function findWorkingMovieDirectServer(movieQuery) {
    const suggestions = await getSearchEngineSuggestions(movieQuery);
    const cleanQ = sanitizeSearchQuery(movieQuery) || movieQuery;
    const searchTerms = [...new Set([movieQuery, cleanQ, ...suggestions])].filter(Boolean);

    for (const term of searchTerms.slice(0, 4)) {
        try {
            const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(term)}`;
            const searchRes = await axios.get(searchUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 8000
            });
            const $ = cheerio.load(searchRes.data);
            let movieUrl = null;
            let movieTitle = null;

            $('a').each((i, el) => {
                const h = $(el).attr('href') || '';
                const isMovie = h.match(/\/movies\/([^\/]+)\/?$/i);
                if (isMovie && !movieUrl) {
                    const slug = isMovie[1].toLowerCase();
                    if (!['movies', 'language', 'genre', 'year', 'quality'].includes(slug)) {
                        movieUrl = h;
                        movieTitle = $(el).attr('title') || $(el).find('img').attr('alt') || $(el).text().trim();
                    }
                }
            });

            if (movieUrl) {
                const servers = await extractServersFromPage(movieUrl);
                if (servers.length > 0) {
                    const picked = await autoPickWorkingServer(servers);
                    if (picked) {
                        return {
                            title: cleanTitleForDisplay(movieTitle || term),
                            movieUrl,
                            ...picked
                        };
                    }
                }
            }
        } catch (e) {}
    }

    // Fallback: Check YouTube Cinema TG Cloud Engine
    try {
        const ytResults = await searchYouTubeCinema(movieQuery);
        if (ytResults && ytResults.length > 0) {
            const bestYt = ytResults[0];
            const ytData = await fetchMediaWithFailover(bestYt.link, 'video');
            if (ytData && ytData.download_url) {
                const sizeInfo = extractSizeFromYtData(ytData);
                return {
                    success: true,
                    title: ytData.title || bestYt.title,
                    fileName: (ytData.title || bestYt.title).replace(/[^\w\s-]/gi, '') + '.mp4',
                    directUrl: ytData.download_url,
                    sizeMb: sizeInfo.sizeMb,
                    sizeFormatted: sizeInfo.sizeFormatted,
                    quality: ytData.quality || '1080p / 720p HD',
                    serverName: ytData.engineUsed || 'TG Cloud Cinema Engine',
                    contentType: 'video/mp4'
                };
            }
        }
    } catch (ytErr) {}

    return null;
}

async function findWorkingEpisodeDirectServer(seriesName, targetSeason, targetEp) {
    const sNum = parseInt(targetSeason, 10) || 1;
    const eNum = parseInt(targetEp, 10) || 1;
    const seasonStr = `s0${sNum}`;
    const epStr = `e${eNum < 10 ? '0' + eNum : eNum}`;

    const cleanSlug = seriesName.toLowerCase().replace(/[^\w\s-]/gi, '').replace(/\s+/g, '-');
    const directEpUrls = [
        `https://sinhalasub.lk/episodes/${cleanSlug}-${seasonStr}${epStr}/`,
        `https://sinhalasub.lk/episodes/${cleanSlug}-season-${sNum}-episode-${eNum}/`
    ];

    for (const epUrl of directEpUrls) {
        try {
            const servers = await extractServersFromPage(epUrl);
            if (servers.length > 0) {
                const picked = await autoPickWorkingServer(servers);
                if (picked) {
                    return {
                        title: `${seriesName} S0${sNum}E${eNum < 10 ? '0' + eNum : eNum}`,
                        epUrl,
                        ...picked
                    };
                }
            }
        } catch (e) {}
    }

    try {
        const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(seriesName)}`;
        const searchRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000
        });
        const $ = cheerio.load(searchRes.data);
        let showUrl = null;
        $('a').each((i, el) => {
            const h = $(el).attr('href') || '';
            const isTv = h.match(/\/tvshows\/([^\/]+)\/?$/i);
            if (isTv && !showUrl) {
                const slug = isTv[1].toLowerCase();
                if (!['tvshows', 'language', 'genre', 'year', 'quality'].includes(slug)) {
                    showUrl = h;
                }
            }
        });

        if (showUrl) {
            const showRes = await axios.get(showUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 8000
            });
            const $s = cheerio.load(showRes.data);
            let targetEpUrl = null;
            $s('a[href*="/episodes/"]').each((i, el) => {
                const h = $s(el).attr('href') || '';
                const m = h.match(/s(\d+)e(\d+)/i) || h.match(/season-(\d+)-episode-(\d+)/i);
                if (m) {
                    const s = parseInt(m[1], 10);
                    const e = parseInt(m[2], 10);
                    if (s === sNum && e === eNum && !targetEpUrl) {
                        targetEpUrl = h;
                    }
                }
            });

            if (targetEpUrl) {
                const servers = await extractServersFromPage(targetEpUrl);
                if (servers.length > 0) {
                    const picked = await autoPickWorkingServer(servers);
                    if (picked) {
                        return {
                            title: `${seriesName} S0${sNum}E${eNum < 10 ? '0' + eNum : eNum}`,
                            epUrl: targetEpUrl,
                            ...picked
                        };
                    }
                }
            }
        }
    } catch (e) {}

    return null;
}

// ─────────────────────────────────────────────────────────────
// 2. AUTO-MIND DYNAMIC SERIES SCRAPER (Zero Hardcoding)
// ─────────────────────────────────────────────────────────────
async function getLiveSeriesData(query) {
    try {
        const sMatch = query.match(/season\s*(\d+)/i) || query.match(/s(\d+)/i);
        const filterSeason = sMatch ? parseInt(sMatch[1], 10) : null;

        // Strip season and episode parts
        let baseQuery = query
            .replace(/season\s*\d+/gi, '')
            .replace(/s\d+/gi, '')
            .replace(/(?:ep|episode)\s*\d+/gi, '')
            .trim();

        if (!baseQuery) baseQuery = query.trim();

        // Tier 1: base query
        // Tier 2: sanitized query (no years, parens, symbols, e.g. "The Manipulated (2025))" -> "The Manipulated")
        const sanitized = sanitizeSearchQuery(baseQuery);
        // Tier 3: core words (words > 3 chars, e.g. "Manipulated")
        const coreWords = sanitized.split(/\s+/).filter(w => w.length > 3).join(' ');

        const searchTiers = [baseQuery, sanitized, coreWords].filter((q, idx, arr) => q && q.length >= 2 && arr.indexOf(q) === idx);

        let showUrl = null;
        let showTitle = null;

        // Cascading search on Sinhalasub
        for (const term of searchTiers) {
            try {
                const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(term)}`;
                const searchRes = await axios.get(searchUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 8000
                });
                const $ = cheerio.load(searchRes.data);

                $('a[href*="/tvshows/"]').each((i, el) => {
                    const h = $(el).attr('href') || '';
                    const t = $(el).text().replace(/\s+/g, ' ').trim() || $(el).attr('title') || '';
                    if (h && !showUrl && !h.endsWith('/tvshows/') && !h.includes('/tv-lanuage/')) {
                        showUrl = h;
                        showTitle = t;
                    }
                });

                if (showUrl) break;
            } catch (err) {}
        }

        // If not found in TV shows, check if it's a standalone movie on Sinhalasub
        if (!showUrl) {
            for (const term of searchTiers) {
                try {
                    const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(term)}`;
                    const searchRes = await axios.get(searchUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                        timeout: 8000
                    });
                    const $ = cheerio.load(searchRes.data);

                    $('a[href*="/movies/"]').each((i, el) => {
                        const h = $(el).attr('href') || '';
                        const t = $(el).text().replace(/\s+/g, ' ').trim() || $(el).attr('title') || '';
                        if (h && !showUrl && !h.endsWith('/movies/') && !h.includes('/movie-lanuage/')) {
                            showUrl = h;
                            showTitle = t;
                        }
                    });

                    if (showUrl) {
                        const movieTitle = showTitle ? cleanTitleForDisplay(showTitle) : (sanitized || baseQuery);
                        return {
                            title: movieTitle,
                            cleanName: sanitized || baseQuery,
                            filterSeason: 1,
                            showUrl,
                            totalEpisodes: 1,
                            isMovie: true,
                            episodes: [{
                                season: 1,
                                episode: 1,
                                title: `${movieTitle} (Full Movie)`,
                                link: showUrl
                            }]
                        };
                    }
                } catch (err) {}
            }
        }

        if (!showUrl) {
            // Fallback: search Baiscope for TV episodes using modern /search?q=
            return await getBaiscopeLiveSeries(sanitized || baseQuery, filterSeason);
        }

        // 2. Fetch the live TV show page and extract ALL seasons and episodes dynamically
        const pageRes = await axios.get(showUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });
        const $p = cheerio.load(pageRes.data);
        const seriesTitle = showTitle ? cleanTitleForDisplay(showTitle) : (sanitized || baseQuery);
        const episodes = [];

        $p('a[href*="/episodes/"]').each((i, el) => {
            const link = $p(el).attr('href');
            if (!link) return;

            const sm = link.match(/s(\d+)e(\d+)/i) || link.match(/season-(\d+)-episode-(\d+)/i);
            const season = sm ? parseInt(sm[1], 10) : 1;
            const epNum = sm ? parseInt(sm[2], 10) : (episodes.length + 1);

            let rawText = $p(el).text().trim().replace(/\s+/g, ' ');
            let epTitle = `Episode ${epNum}`;
            const epNameMatch = rawText.match(/Episode\s*\d+\s*(?:\[[^\]]+\])?/i);
            if (epNameMatch) epTitle = epNameMatch[0];

            if (!episodes.some(e => e.link === link)) {
                episodes.push({
                    season,
                    episode: epNum,
                    title: epTitle,
                    link
                });
            }
        });

        episodes.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);

        let resultEpisodes = episodes;
        if (filterSeason) {
            const seasonFiltered = episodes.filter(e => e.season === filterSeason);
            if (seasonFiltered.length > 0) resultEpisodes = seasonFiltered;
        }

        const cleanName = sanitized || baseQuery;

        return {
            title: seriesTitle,
            cleanName,
            filterSeason,
            showUrl,
            totalEpisodes: resultEpisodes.length,
            episodes: resultEpisodes
        };
    } catch (e) {
        console.error("Live Series Scraper Error:", e.message);
        return null;
    }
}

async function getBaiscopeLiveSeries(cleanQuery, filterSeason = null) {
    try {
        const searchUrl = `https://www.baiscope.lk/search?q=${encodeURIComponent(cleanQuery)}`;
        const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        const episodes = [];
        $('article').each((i, el) => {
            const h = $(el).find('a').attr('href') || '';
            const t = $(el).find('a').text().trim().replace(/\s+/g, ' ');
            if (h.includes('/tv/') || t.toLowerCase().includes('s0') || t.toLowerCase().includes('season') || t.toLowerCase().includes('episode')) {
                const sMatch = t.match(/\[S(\d+)\s*:\s*E(\d+)\]/i) || h.match(/s(\d+)-e(\d+)/i);
                const season = sMatch ? parseInt(sMatch[1], 10) : 1;
                const epNum = sMatch ? parseInt(sMatch[2], 10) : (i + 1);
                episodes.push({
                    season,
                    episode: epNum,
                    title: t,
                    link: h.startsWith('http') ? h : `https://www.baiscope.lk${h}`
                });
            }
        });

        let resultEpisodes = episodes;
        if (filterSeason) {
            const sf = episodes.filter(e => e.season === filterSeason);
            if (sf.length > 0) resultEpisodes = sf;
        }

        return {
            title: cleanQuery,
            cleanName: cleanQuery,
            filterSeason,
            showUrl: searchUrl,
            totalEpisodes: resultEpisodes.length,
            episodes: resultEpisodes
        };
    } catch (e) {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// 3. UNIVERSAL MULTI-ENGINE MOVIE SCRAPERS
// ─────────────────────────────────────────────────────────────
async function searchSinhalasub(term) {
    const items = [];
    try {
        const res = await axios.get(`https://sinhalasub.lk/?s=${encodeURIComponent(term)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 7000
        });
        const $ = cheerio.load(res.data);
        $('a').each((i, el) => {
            const h = $(el).attr('href') || '';
            const isMovie = h.match(/\/movies\/([^\/]+)\/?$/i);
            const isTv = h.match(/\/tvshows\/([^\/]+)\/?$/i);
            if (isMovie || isTv) {
                const slug = (isMovie ? isMovie[1] : isTv[1]).toLowerCase();
                if (!['movies', 'tvshows', 'language', 'genre', 'year', 'quality'].includes(slug)) {
                    const raw = $(el).attr('title') || $(el).find('img').attr('alt') || $(el).text().trim();
                    const clean = cleanTitleForDisplay(raw);
                    if (clean && clean.length > 2 && !items.some(x => x.link === h)) {
                        items.push({
                            title: clean,
                            rawTitle: raw,
                            type: isMovie ? 'Movie' : 'TV Series',
                            link: h,
                            source: 'Sinhalasub.lk'
                        });
                    }
                }
            }
        });
    } catch (e) {}
    return items;
}

async function searchBaiscope(term) {
    const items = [];
    try {
        const res = await axios.get(`https://www.baiscope.lk/search?q=${encodeURIComponent(term)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 7000
        });
        const $ = cheerio.load(res.data);
        $('article').each((i, el) => {
            const t = $(el).find('a').text().trim().replace(/\s+/g, ' ');
            const h = $(el).find('a').attr('href');
            if (t && h && !items.some(x => x.link === h)) {
                items.push({
                    title: cleanTitleForDisplay(t),
                    rawTitle: t,
                    type: t.toLowerCase().includes('season') || t.toLowerCase().includes('episode') ? 'TV Series' : 'Movie',
                    link: h.startsWith('http') ? h : `https://www.baiscope.lk${h}`,
                    source: 'Baiscope.lk'
                });
            }
        });
    } catch (e) {}
    return items;
}

async function searchCinesubz(term) {
    const items = [];
    try {
        const res = await axios.get(`https://cinesubz.co/?s=${encodeURIComponent(term)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 7000
        });
        const $ = cheerio.load(res.data);
        $('a').each((i, el) => {
            const h = $(el).attr('href') || '';
            const isMovie = h.match(/\/movies\/([^\/]+)\/?$/i);
            const isTv = h.match(/\/tvshows\/([^\/]+)\/?$/i);
            if (isMovie || isTv) {
                const slug = (isMovie ? isMovie[1] : isTv[1]).toLowerCase();
                if (!['movies', 'tvshows', 'language', 'genre', 'year', 'quality'].includes(slug)) {
                    const raw = $(el).attr('title') || $(el).find('img').attr('alt') || $(el).text().trim();
                    const clean = cleanTitleForDisplay(raw);
                    if (clean && clean.length > 2 && !items.some(x => x.link === h)) {
                        items.push({
                            title: clean,
                            rawTitle: raw,
                            type: isMovie ? 'Movie' : 'TV Series',
                            link: h,
                            source: 'Cinesubz.co'
                        });
                    }
                }
            }
        });
    } catch (e) {}
    return items;
}

async function searchYouTubeCinema(query) {
    const items = [];
    try {
        const searchTerms = [`${query} full movie`, `${query} movie`, query];
        for (const st of searchTerms) {
            const res = await yts(st);
            if (res && res.videos) {
                for (const v of res.videos) {
                    if (v.seconds >= 2400 || (v.seconds >= 1200 && (v.title.toLowerCase().includes('movie') || v.title.toLowerCase().includes('film')))) {
                        items.push({
                            title: v.title,
                            cleanTitle: cleanTitleForDisplay(v.title),
                            duration: v.timestamp,
                            type: 'Movie (Full HD)',
                            link: v.url,
                            source: 'YouTube Cinema (TG Cloud)',
                            isYouTube: true
                        });
                        if (items.length >= 4) break;
                    }
                }
                if (items.length > 0) break;
            }
        }
    } catch (e) {}
    return items;
}

async function searchMoviesMulti(query) {
    const terms = await getSearchEngineSuggestions(query);
    let allResults = [];

    // 1. Search local platforms (Sinhalasub, Baiscope, Cinesubz) across typo-corrected terms
    for (const term of terms.slice(0, 3)) {
        const [sin, bai, cin] = await Promise.all([
            searchSinhalasub(term),
            searchBaiscope(term),
            searchCinesubz(term)
        ]);

        [...sin, ...bai, ...cin].forEach(item => {
            if (!allResults.some(r => r.title.toLowerCase() === item.title.toLowerCase() || (item.link && r.link === item.link))) {
                allResults.push(item);
            }
        });

        if (allResults.length >= 6) break;
    }

    // 2. Global Cinema Engine Fallback: If local subtitle sites return 0 results
    if (allResults.length === 0) {
        const ytResults = await searchYouTubeCinema(query);
        allResults = ytResults;
    }

    return allResults;
}

// Helper: YouTube Video Downloader for Shorts/Clips
async function fetchYouTubeShortStream(query) {
    try {
        const searchResults = await yts(query);
        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) return null;
        const targetVideo = searchResults.videos[0];

        const res = await axios.get(`https://apis.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(targetVideo.url)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 20000
        });

        if (res.data && res.data.success && res.data.result?.download_url) {
            return {
                title: res.data.result.title || targetVideo.title,
                download_url: res.data.result.download_url,
                targetUrl: targetVideo.url
            };
        }
    } catch (e) {
        console.error("YouTube Short Fetch Error:", e.message);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// 4. COMMAND: .oplive (Auto-Mind Universal TV Series & One Piece Hub)
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "oplive",
    alias: ["onepiece", "opnetflix", "zoro"],
    react: "⚔️",
    desc: "Auto-Mind Universal TV Series & One Piece Episodes Hub",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        const input = q ? q.trim() : "";
        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';

        const lowerInput = input.toLowerCase();
        const isOnePiece = !input || lowerInput.includes("one piece") || lowerInput.includes("opnetflix") || lowerInput.includes("zoro") || lowerInput.includes("luffy");

        // Case A: Shorts, Clips, Trailers, Teasers & Recaps (Only for One Piece or explicit clip keywords)
        const isTrailerOrTeaser = lowerInput.includes("trailer") || lowerInput.includes("teaser") || lowerInput.includes("recap");
        const isClip = input && isOnePiece && !lowerInput.startsWith("ep") && !lowerInput.startsWith("s0") && !/^\d+$/.test(input) && (
            isTrailerOrTeaser ||
            lowerInput.includes("zoro") || 
            lowerInput.includes("sword") || 
            lowerInput.includes("clip") || 
            lowerInput.includes("short") ||
            lowerInput.includes("fear") ||
            lowerInput.includes("fight") ||
            lowerInput.includes("luffy")
        );

        if (isClip) {
            await conn.sendPresenceUpdate('composing', from);
            const searchKeyword = isTrailerOrTeaser 
                ? `ONE PIECE Netflix ${input}`
                : `One Piece Netflix Live Action ${input} HD shorts`;

            await reply(`⚔️ *One Piece Video සොයමින් පවතී: "${input}"... (TG Cloud)*`);

            const clipData = await fetchYouTubeShortStream(searchKeyword);
            if (clipData && clipData.download_url) {
                const oneTapSub = botNum ? `\n╰┈➤ 👆 🇸🇮 *1-Tap Subtitle Link:* https://wa.me/${botNum}?text=.sub%20One%20Piece` : '';
                const oneTapMp3 = botNum ? `\n╰┈➤ 👆 🎵 *1-Tap MP3 Link:* https://wa.me/${botNum}?text=.mp3%20${encodeURIComponent(clipData.targetUrl)}` : '';

                return await conn.sendMessage(from, {
                    video: { url: clipData.download_url },
                    caption: `👑 *${clipData.title}* ⚔️\n#onepiece #netflix #liveaction\n\n_Downloaded via ＤＭＣ™ (TG Engine)_` + oneTapMp3 + oneTapSub
                }, { quoted: mek });
            }
        }

        // Case B: Specific Episode (e.g. .oplive ep 1, .oplive The Manipulated ep 1, .oplive 1)
        const isEpisodeRequest = input && (
            lowerInput.startsWith("ep") || 
            lowerInput.startsWith("s0") || 
            /^\d+$/.test(input) || 
            /s\d+\s*ep?\s*\d+/i.test(input) ||
            /\b(?:ep|episode)\s*\d+/i.test(input)
        );

        if (isEpisodeRequest) {
            const epMatch = input.match(/(?:ep|episode|s0?1e|s)?\s*(\d+)/i);
            const targetEp = epMatch ? parseInt(epMatch[1], 10) : 1;
            const isSeason2 = lowerInput.includes("s2") || lowerInput.includes("s02") || lowerInput.includes("season 2");
            const targetSeason = isSeason2 ? 2 : 1;
            const seasonStr = `S0${targetSeason}`;
            const epStr = targetEp < 10 ? `0${targetEp}` : `${targetEp}`;

            // Extract show name from input, or default to One Piece
            let showName = input
                .replace(/season\s*\d+/gi, '')
                .replace(/s0?\d+/gi, '')
                .replace(/(?:ep|episode)\s*\d+/gi, '')
                .replace(/^\d+$/, '')
                .trim();

            if (!showName) showName = "One Piece 2023";

            await conn.sendPresenceUpdate('composing', from);
            await reply(`⚔️ *"${showName}" [${seasonStr}E${epStr}] සොයමින් පවතී... (Auto Mind)*`);

            const liveData = await getLiveSeriesData(showName);
            let foundEp = null;
            if (liveData && liveData.episodes) {
                foundEp = liveData.episodes.find(e => e.season === targetSeason && e.episode === targetEp);
            }

            const epTitle = foundEp ? foundEp.title : `Episode ${targetEp}`;
            const epLink = foundEp ? foundEp.link : null;
            const cleanCmdName = liveData?.cleanName || showName;
            const oneTapSub = botNum ? createOneTapLink(botNum, `.sub ${cleanCmdName} ${seasonStr}E${epStr}`) : '';

            // Extract download servers dynamically
            let serverLinks = [];
            if (epLink) {
                try {
                    const epPageRes = await axios.get(epLink, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 8000
                    });
                    const $ep = cheerio.load(epPageRes.data);
                    $ep('a').each((i, el) => {
                        const h = $ep(el).attr('href') || '';
                        const t = $ep(el).text().trim();
                        if (h.includes('/links/') && (t.includes('DLServer') || t.includes('Telagram') || t.includes('Telegram') || t.includes('Server') || t.includes('Download') || t.includes('Pixeldrain'))) {
                            if (!serverLinks.some(s => s.url === h)) {
                                serverLinks.push({ name: t, url: h });
                            }
                        }
                    });
                } catch (e) {}
            }

            const serversText = await formatEpisodeServers(serverLinks, botNum);
            const displayTitle = liveData?.title || showName;
            const autoTapDl = botNum ? createOneTapLink(botNum, `.epdl ${cleanCmdName} ${targetSeason} ${targetEp}`) : '';

            const cardMsg = `👑 *${displayTitle.toUpperCase()}* 👑\n` +
                            `🎬 *${seasonStr}E${epStr} - ${epTitle}*\n` +
                            `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                            (autoTapDl ? `👉 ⚡ 📥 *1-Tap Download Best Server (Auto-Mind):*\n${autoTapDl}\n\n` : '') +
                            serversText +
                            (epLink ? `🔗 *Watch / Download Page:*\n${epLink}\n\n` : '') +
                            (oneTapSub ? `👉 🇸🇮 *1-Tap Sinhala Subtitle Link:*\n${oneTapSub}\n\n` : '') +
                            `💡 _ඉහත 1-Tap Download හෝ Subtitle ලින්ක් එක Click කිරීමෙන් සෘජුවම ලබා ගත හැක._\n\n` +
                            `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

            return await conn.sendMessage(from, { text: cardMsg }, { quoted: mek });
        }

        // Case C: Menu Mode with Auto-Mind Live Scraping & 1-Tap Links for EVERY Episode!
        await conn.sendPresenceUpdate('composing', from);
        const searchQuery = input ? input : "One Piece 2023";
        await reply(isOnePiece ? "🔎 *One Piece Live-Action Episodes සජීවීව පරීක්ෂා කරමින් පවතී... (Auto Mind)*" : `🔎 *"${input}" සඳහා Seasons සහ Episodes සජීවීව පරීක්ෂා කරමින් පවතී... (Auto Mind)*`);

        const seriesData = await getLiveSeriesData(searchQuery);

        if (!seriesData || !seriesData.episodes || seriesData.episodes.length === 0) {
            return reply(`❌ *"${searchQuery}" සඳහා කතාමාලා සොයාගත නොහැකි විය.*`);
        }

        const displayHubHeader = isOnePiece ? "ONE PIECE (NETFLIX LIVE-ACTION) HUB" : `${seriesData.title.toUpperCase()} HUB`;
        const cmdShowName = seriesData.cleanName || seriesData.title || (isOnePiece ? "One Piece" : input);

        if (seriesData.isMovie) {
            // It's a standalone movie! Extract download servers directly and send movie card
            let serverLinks = [];
            try {
                const mRes = await axios.get(seriesData.showUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });
                const $m = cheerio.load(mRes.data);
                $m('a').each((i, el) => {
                    const h = $m(el).attr('href') || '';
                    const t = $m(el).text().trim();
                    if (h.includes('/links/') && (t.includes('DLServer') || t.includes('Telagram') || t.includes('Telegram') || t.includes('Server') || t.includes('Download') || t.includes('Pixeldrain'))) {
                        if (!serverLinks.some(s => s.url === h)) {
                            serverLinks.push({ name: t, url: h });
                        }
                    }
                });
            } catch (e) {}

            const serversText = await formatEpisodeServers(serverLinks, botNum);
            const oneTapSub = botNum ? createOneTapLink(botNum, `.sub ${cmdShowName}`) : '';
            const autoMovieDl = botNum ? createOneTapLink(botNum, `.dlfilm ${cmdShowName}`) : '';

            const movieCard = `👑 *${seriesData.title.toUpperCase()} (FULL MOVIE)* 👑\n` +
                              `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                              (autoMovieDl ? `👉 ⚡ 📥 *1-Tap Download Movie (Auto-Mind):*\n${autoMovieDl}\n\n` : '') +
                              serversText +
                              `🔗 *Watch / Download Page:*\n${seriesData.showUrl}\n\n` +
                              (oneTapSub ? `👉 🇸🇮 *1-Tap Sinhala Subtitle Link:*\n${oneTapSub}\n\n` : '') +
                              `💡 _ඉහත 1-Tap Download හෝ Subtitle ලින්ක් එක Click කිරීමෙන් ලබා ගත හැක._\n\n` +
                              `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

            return await conn.sendMessage(from, { text: movieCard }, { quoted: mek });
        }

        let menuText = `👑 *${displayHubHeader}* 👑\n` +
                       `📺 *Title:* ${seriesData.title}\n` +
                       `📦 *Available Episodes:* ${seriesData.totalEpisodes}\n` +
                       `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                       `─────────────────────────\n`;

        seriesData.episodes.forEach(e => {
            const epCode = `S0${e.season}E${e.episode < 10 ? '0' + e.episode : e.episode}`;
            const tapDl = botNum ? createOneTapLink(botNum, `.epdl ${cmdShowName} ${e.season} ${e.episode}`) : '';
            const tapSub = botNum ? createOneTapLink(botNum, `.sub ${cmdShowName} ${epCode}`) : '';

            menuText += `🎬 *[${epCode}]* ${e.title}\n` +
                        (tapDl ? `👉 📥 *1-Tap Download:* ${tapDl}\n` : '') +
                        (tapSub ? `👉 🇸🇮 *1-Tap Subtitle:* ${tapSub}\n` : '') +
                        `\n`;
        });

        menuText += `─────────────────────────\n`;
        if (isOnePiece) {
            menuText += `🎬 *OFFICIAL TRAILERS & RECAPS:*\n` +
                        `• *.oplive season 2 trailer* (Official Trailer)\n` +
                        `• *.oplive season 2 teaser* (Official Teaser)\n` +
                        `• *.oplive season 1 recap* (Season 1 Recap)\n\n`;
        }
        menuText += `💡 _ඕනෑම Episode එකක් ලබා ගැනීමට ඉහත 1-Tap Download හෝ 1-Tap Subtitle Link එක ඔබන්න._`;

        return await conn.sendMessage(from, { text: menuText }, { quoted: mek });

    } catch (err) {
        console.error("OPLive Auto-Mind Error:", err.message);
        reply(`❌ *තොරතුරු ලබා ගැනීමට නොහැකි විය: ${err.message}*`);
    }
});

// ─────────────────────────────────────────────────────────────
// 5. COMMAND: .ep / .episode (1-Tap Episode Extractor for ANY Show)
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "ep",
    alias: ["episode"],
    desc: "1-Tap Direct Episode Resolver (Servers, Links, Subtitles)",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) {
            return reply("🎬 *භාවිතය:* `.ep <SeriesName> <Season> <Episode>`\nඋදාහරණ:\n*.ep One Piece 1 5*\n*.ep Loki 1 2*");
        }

        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';
        const parts = q.trim().split(/\s+/);
        
        let targetSeason = 1;
        let targetEp = 1;
        let seriesName = q.trim();

        // Check if last two parts are numbers (e.g. One Piece 1 5)
        if (parts.length >= 3 && !isNaN(parts[parts.length - 2]) && !isNaN(parts[parts.length - 1])) {
            targetEp = parseInt(parts.pop(), 10);
            targetSeason = parseInt(parts.pop(), 10);
            seriesName = parts.join(" ");
        } else if (parts.length >= 2 && !isNaN(parts[parts.length - 1])) {
            targetEp = parseInt(parts.pop(), 10);
            seriesName = parts.join(" ");
        }

        const seasonStr = `S0${targetSeason}`;
        const epStr = targetEp < 10 ? `0${targetEp}` : `${targetEp}`;

        await conn.sendPresenceUpdate('composing', from);
        await reply(`⏳ *"${seriesName}" [${seasonStr}E${epStr}] සජීවීව සකසමින් පවතී... (TG Cloud)*`);

        // Resolve live show
        const seriesData = await getLiveSeriesData(seriesName);
        let epLink = null;
        let epTitle = `Episode ${targetEp}`;

        if (seriesData && seriesData.episodes) {
            const found = seriesData.episodes.find(e => e.season === targetSeason && e.episode === targetEp);
            if (found) {
                epLink = found.link;
                epTitle = found.title;
            }
        }

        if (!epLink) {
            const cleanSlug = seriesName.toLowerCase().replace(/[^\w\s-]/gi, '').replace(/\s+/g, '-');
            epLink = `https://sinhalasub.lk/episodes/${cleanSlug}-s0${targetSeason}e${epStr}/`;
        }

        // Extract download servers dynamically from the episode page
        let serverLinks = [];
        try {
            const epRes = await axios.get(epLink, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 8000
            });
            const $ep = cheerio.load(epRes.data);
            $ep('a').each((i, el) => {
                const h = $ep(el).attr('href') || '';
                const t = $ep(el).text().trim();
                if (h.includes('/links/') && (t.includes('DLServer') || t.includes('Telagram') || t.includes('Telegram') || t.includes('Server') || t.includes('Download') || t.includes('Pixeldrain'))) {
                    if (!serverLinks.some(s => s.url === h)) {
                        serverLinks.push({ name: t, url: h });
                    }
                }
            });
        } catch (e) {}

        const serversText = await formatEpisodeServers(serverLinks, botNum);
        const autoTapDl = botNum ? createOneTapLink(botNum, `.epdl ${seriesName} ${targetSeason} ${targetEp}`) : '';
        const oneTapSub = botNum ? createOneTapLink(botNum, `.sub ${seriesName} ${seasonStr}E${epStr}`) : '';

        const card = `👑 *${seriesName.toUpperCase()}* 👑\n` +
                     `🎬 *${seasonStr}E${epStr} - ${epTitle}*\n` +
                     `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                     (autoTapDl ? `👉 ⚡ 📥 *1-Tap Download Best Server (Auto-Mind):*\n${autoTapDl}\n\n` : '') +
                     serversText +
                     `🔗 *Watch / Download Page:*\n${epLink}\n\n` +
                     (oneTapSub ? `👉 🇸🇮 *1-Tap Sinhala Subtitle Link:*\n${oneTapSub}\n\n` : '') +
                     `💡 _ඉහත 1-Tap Download හෝ Subtitle ලින්ක් එක Click කිරීමෙන් සෘජුවම ලබා ගත හැක._\n\n` +
                     `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

        return await conn.sendMessage(from, { text: card }, { quoted: mek });

    } catch (e) {
        console.error("Episode command error:", e.message);
        reply("❌ *Episode තොරතුරු ලබා ගැනීමට නොහැකි විය.*");
    }
});

// ─────────────────────────────────────────────────────────────
// 5.5 COMMAND: .dlep / .dlfilm / .epdl (Auto-Verify Portal & Send MP4 Document)
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "dlep",
    alias: ["dlfilm", "epdl", "getep", "sinhalasubdl", "viddl", "moviedl"],
    react: "🎬",
    desc: "Auto-Verify Working Server & Send Video Document to WhatsApp",
    category: "download",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, sender }) => {
    // 🛡️ 1. Anti-Crash & Anti-Ban Guard: Check exclusive lock before executing
    const lock = DownloadGuard.acquireLock(from, sender, {
        title: "බාගත කිරීම සූදානම් වෙමින් පවතී...",
        type: "Movie / Episode Document (Direct Stream)",
        url: q || ""
    });

    if (!lock.allowed) {
        return reply(lock.message);
    }

    try {
        if (!q) {
            DownloadGuard.releaseLock(from, false);
            return reply("🎬 *භාවිතය:*\n• *.dlfilm <Movie Name>* (චිත්‍රපට සෘජුවම බාගත කිරීමට)\n• *.epdl <Series> <Season> <Episode>* (Episode සෘජුවම බාගත කිරීමට)\n• *.dlep <Portal_URL>* (Portal Link එකකින් සෘජුවම බාගත කිරීමට)");
        }

        const trimmed = q.trim();
        const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);

        let resolved = null;

        if (urlMatch) {
            const targetUrl = urlMatch[0];
            if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
                await DownloadGuard.simulatePresenceSafely(conn, from, 'video');
                await reply("⚡ *Auto Mind: YouTube Cinema Cloud Stream සකසමින් පවතී...*\n_Direct 1080p/720p HD Stream Extracting..._");
                const ytData = await fetchMediaWithFailover(targetUrl, 'video');
                if (ytData && ytData.download_url) {
                    const sizeInfo = extractSizeFromYtData(ytData);
                    resolved = {
                        success: true,
                        title: ytData.title || 'Movie',
                        fileName: (ytData.title || 'Movie').replace(/[^\w\s-]/gi, '') + '.mp4',
                        directUrl: ytData.download_url,
                        sizeMb: sizeInfo.sizeMb,
                        sizeFormatted: sizeInfo.sizeFormatted,
                        quality: ytData.quality || '1080p / 720p HD',
                        serverName: ytData.engineUsed || 'TG Cloud Cinema Engine',
                        contentType: 'video/mp4'
                    };
                } else {
                    resolved = { success: false, error: 'Could not resolve cinema stream' };
                }
            } else {
                // Mode A: Direct portal URL
                await DownloadGuard.simulatePresenceSafely(conn, from, 'video');
                await reply("⚡ *Auto Mind: Secure Portal එක Auto-Verify කරමින් පවතී...*\n_No Ads • No 3-Step Waiting • Direct Stream Extracting..._");
                resolved = await bypassPortalAndResolve(targetUrl);
            }
        } else {
            // Mode B / C: Text query (Movie or Episode)
            await DownloadGuard.simulatePresenceSafely(conn, from, 'video');

            // Check if query is episode request (e.g. "The Manipulated 1 1", "One Piece S01E02", "Loki 1 2")
            const epMatch = trimmed.match(/(?:s(\d+)\s*e(\d+))|(?:season\s*(\d+)\s*ep(?:isode)?\s*(\d+))|(?:\b(\d+)\s+(\d+)$)/i);

            if (epMatch) {
                // It's an episode!
                let sNum = 1, eNum = 1;
                let showName = trimmed;

                if (epMatch[1] && epMatch[2]) {
                    sNum = parseInt(epMatch[1], 10);
                    eNum = parseInt(epMatch[2], 10);
                    showName = trimmed.replace(epMatch[0], '').trim();
                } else if (epMatch[3] && epMatch[4]) {
                    sNum = parseInt(epMatch[3], 10);
                    eNum = parseInt(epMatch[4], 10);
                    showName = trimmed.replace(epMatch[0], '').trim();
                } else if (epMatch[5] && epMatch[6]) {
                    sNum = parseInt(epMatch[5], 10);
                    eNum = parseInt(epMatch[6], 10);
                    showName = trimmed.replace(new RegExp(`\\s+${sNum}\\s+${eNum}$`), '').trim();
                }

                await reply(`⚡ *Auto Mind: "${showName}" [S0${sNum}E${eNum < 10 ? '0' + eNum : eNum}] සොයමින් Direct Server තෝරමින් පවතී...*\n_Auto-Selecting Working Server • Bypassing Portal..._`);
                resolved = await findWorkingEpisodeDirectServer(showName, sNum, eNum);
            } else {
                // It's a Movie!
                await reply(`⚡ *Auto Mind: "${trimmed}" චිත්‍රපටය සොයමින් Direct Server තෝරමින් පවතී...*\n_Auto-Selecting Working Server • Bypassing Portal..._`);
                resolved = await findWorkingMovieDirectServer(trimmed);
            }
        }

        if (!resolved || !resolved.success || !resolved.directUrl) {
            return reply(`❌ *වීඩියෝව හෝ Direct Server සොයා ගැනීමට නොහැකි විය: ${resolved?.error || 'No working direct server found'}*`);
        }

        // Update active task title in DownloadGuard
        DownloadGuard.updateTask(from, {
            title: resolved.fileName || resolved.title || trimmed,
            size: resolved.sizeFormatted
        });

        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';
        const tapFileAgain = botNum ? createOneTapLink(botNum, `.dlfilm ${trimmed}`) : '';

        // 1. Send High-Speed Direct URL Card first so user has the verified download link
        const highSpeedMsg = `👑 *${(resolved.fileName || resolved.title || 'VIDEO').toUpperCase()}* 👑\n\n` +
                             `✅ *Status:* Direct Working Server Verified!\n` +
                             `🚀 *Server:* ${resolved.serverName || 'DLServer-01'} [${resolved.quality || 'HD'}]\n` +
                             `📦 *File Size:* ${resolved.sizeFormatted}\n` +
                             `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                             `📥 *Direct High-Speed Download URL:*\n${resolved.directUrl}\n\n` +
                             (tapFileAgain ? `👉 📄 *1-Tap Send Document File to WhatsApp:*\n${tapFileAgain}\n\n` : '') +
                             `💡 *Direct Download:*\n` +
                             `_කිසිදු දැන්වීමක් හෝ රැඳී සිටීමකින් තොරව ඉහත නිල් පැහැති ලින්ක් එකෙන් Browser / IDM මඟින් සෘජුවම බාගත කරගත හැක._\n\n` +
                             `⏳ *WhatsApp Document ගොනුව (File) සකස් කර එවමින් පවතී...*\n_විශාල ගොනුවක් බැවින් කරුණාකර සුළු මොහොතක් රැඳී සිටින්න... (TG Engine)_\n\n` +
                             `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

        await conn.sendMessage(from, { text: highSpeedMsg }, { quoted: mek });

        // 2. Anti-Ban human presence simulation
        await DownloadGuard.simulatePresenceSafely(conn, from, 'video');

        // 3. Prepare and Send WhatsApp Document (Image 1 Format)
        try {
            let docPayload = { url: resolved.directUrl };
            if (resolved.directUrl && resolved.directUrl.includes('trycloudflare.com')) {
                const streamRes = await axios.get(resolved.directUrl, {
                    headers: {
                        'Bypass-Tunnel-Reminder': 'true',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                    },
                    responseType: 'stream',
                    timeout: 300000
                });
                docPayload = { stream: streamRes.data };
            }

            await conn.sendMessage(from, {
                document: docPayload,
                mimetype: resolved.contentType || 'video/mp4',
                fileName: resolved.fileName,
                caption: `👑 *${resolved.fileName}* 👑\n\n` +
                         `📦 *Size:* ${resolved.sizeFormatted}\n` +
                         `🎞️ *Quality:* ${resolved.quality || 'HD'}\n` +
                         `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                         `_Downloaded via ＤＭＣ™ (TG Engine)_`
            }, { quoted: mek });
        } catch (sendErr) {
            console.error("Document Send Error:", sendErr.message);
            await reply(`⚠️ *WhatsApp මඟින් Document එක එවීමේදී දෝෂයක් සිදු විය (${sendErr.message}).*\n\n🔗 *Direct High-Speed Download URL:*\n${resolved.directUrl}\n\n_මෙම ලින්ක් එකෙන් Browser එක හරහා ක්ෂණිකව බාගත කරගත හැක._\n\n_👑 Powered by ＤＭＣ™ (TG Engine)_`);
        }

    } catch (err) {
        console.error("DLEP Command Error:", err.message);
        reply(`❌ *වීඩියෝව එවීමේදී දෝෂයක් සිදු විය: ${err.message}*`);
    } finally {
        // 🛡️ 1000% GUARANTEE: Lock is ALWAYS released and Anti-Ban cooldown is set
        DownloadGuard.releaseLock(from, true);
    }
});

// ─────────────────────────────────────────────────────────────
// 5.6 COMMAND: .cleardl / .resetdl (Owner Force Unlock)
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "cleardl",
    alias: ["resetdl", "unlockdl"],
    react: "🛡️",
    desc: "Reset/Clear active download locks (Owner Only)",
    category: "owner",
    filename: __filename
}, async (conn, mek, m, { from, isOwner, reply }) => {
    if (!isOwner) return reply("⛔ *මෙම විධානය Owner සඳහා පමණි.*");
    const res = DownloadGuard.forceRelease();
    reply(`${res}\n_🛡️ Download Guard & Anti-Ban Locks are now 100% refreshed._`);
});

// ─────────────────────────────────────────────────────────────
// 6. COMMAND: .series / .tv (Universal Auto-Mind for ANY Series/Category)
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "series",
    alias: ["tv", "tvshow", "season"],
    react: "📺",
    desc: "Universal Dynamic TV Series & Episode Extractor (Auto Mind)",
    category: "downloader",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) {
            return reply("📺 *කරුණාකර TV Series එකේ නම ලබා දෙන්න!*\n\nඋදාහරණ:\n*.series One Piece*\n*.series One Piece season 2*\n*.series Loki*\n*.series Wednesday*\n*.series Stranger Things*");
        }

        await conn.sendPresenceUpdate('composing', from);
        await reply(`🔎 *"${q.trim()}" සඳහා Seasons සහ Episodes සජීවීව සොයමින් පවතී... (Auto Mind)*`);

        const data = await getLiveSeriesData(q.trim());
        if (!data || !data.episodes || data.episodes.length === 0) {
            return reply(`❌ *"${q.trim()}" සඳහා කතාමාලා සොයාගත නොහැකි විය.*`);
        }

        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';

        let menu = `📺 *${data.title}* 📺\n` +
                   `📦 *Total Episodes Available:* ${data.totalEpisodes}\n` +
                   `⚡ *Engine:* TG Cloud (Auto Mind)\n\n` +
                   `─────────────────────────\n`;

        data.episodes.forEach(e => {
            const epCode = `S0${e.season}E${e.episode < 10 ? '0' + e.episode : e.episode}`;
            const tapDl = botNum ? createOneTapLink(botNum, `.epdl ${data.cleanName} ${e.season} ${e.episode}`) : '';
            const tapSub = botNum ? createOneTapLink(botNum, `.sub ${data.cleanName} ${epCode}`) : '';

            menu += `🎬 *[${epCode}]* ${e.title}\n` +
                    (tapDl ? `👉 📥 *1-Tap Download:* ${tapDl}\n` : '') +
                    (tapSub ? `👉 🇸🇮 *1-Tap Subtitle:* ${tapSub}\n` : '') +
                    `\n`;
        });

        menu += `─────────────────────────\n` +
                `💡 _ඕනෑම Episode එකක් තනි තනිව ලබා ගැනීමට ඉහත 1-Tap Download හෝ 1-Tap Subtitle Link එක ඔබන්න._`;

        await conn.sendMessage(from, { text: menu }, { quoted: mek });

    } catch (err) {
        console.error("Series Command Error:", err.message);
        reply("❌ *Series තොරතුරු ලබා ගැනීමට නොහැකි විය.*");
    }
});

// ─────────────────────────────────────────────────────────────
// 7. COMMAND: .movie / .film / .mv / .cinema
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "movie",
    alias: ["film", "mv", "cinema", "cinedl"],
    desc: "Search & Download Movies, TV Series & 1-Tap Subtitles",
    category: "downloader",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, sender }) => {
    try {
        if (!q) {
            return reply("🎬 *කරුණාකර චිත්‍රපටයේ හෝ කතා මාලාවේ නම ලබා දෙන්න!*\n\nඋදාහරණ:\n*.movie Avatar*\n*.movie Deadpool*\n*.movie One Piece*");
        }

        await conn.sendPresenceUpdate('composing', from);
        await reply("🔎 *Movies & TV Series සොයමින් පවතී... (TG Cloud)*");

        const query = q.trim();
        const results = await searchMoviesMulti(query);

        if (!results || results.length === 0) {
            return reply(`❌ *"${query}" සඳහා චිත්‍රපට හෝ කතාමාලා කිසිවක් සොයාගත නොහැකි විය.*`);
        }

        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';

        let menuText = `🎬 *DMC MOVIE & SERIES HUB* 🎬\n` +
                       `📋 *Query:* "${query}"\n` +
                       `⚡ *Engine:* TG Cloud\n\n` +
                       `─────────────────────────\n`;

        results.slice(0, 5).forEach((item, idx) => {
            const isSeries = item.type === 'TV Series';
            const isYouTube = item.isYouTube || (item.link && (item.link.includes('youtube.com') || item.link.includes('youtu.be')));
            const icon = isSeries ? '📺' : '🎥';
            const typeLabel = isSeries ? '[TV Series]' : (isYouTube ? '[Full HD Movie]' : '[Movie]');

            // 1-Tap Links
            let tapDl = '';
            if (isYouTube) {
                const tapVideo = botNum ? createOneTapLink(botNum, `.dlfilm ${item.link}`) : '';
                const tapMp3 = botNum ? createOneTapLink(botNum, `.mp3 ${item.link}`) : '';
                tapDl = (tapVideo ? `👉 📄 *1-Tap Download (File & Link):* ${tapVideo}\n` : '') +
                        (tapMp3 ? `👉 🎵 *1-Tap MP3 Audio:* ${tapMp3}\n` : '');
            } else if (isSeries) {
                const tapSeries = botNum ? createOneTapLink(botNum, `.series ${item.title}`) : '';
                const tapEp1 = botNum ? createOneTapLink(botNum, `.epdl ${item.title} 1 1`) : '';
                tapDl = (tapSeries ? `👉 📥 *1-Tap All Episodes:* ${tapSeries}\n` : '') +
                        (tapEp1 ? `👉 📄 *1-Tap Ep 1 (File & Link):* ${tapEp1}\n` : '');
            } else {
                const tapMovie = botNum ? createOneTapLink(botNum, `.dlfilm ${item.title}`) : '';
                tapDl = tapMovie ? `👉 📄 *1-Tap Download (File & Link):* ${tapMovie}\n` : '';
            }

            const oneTapSub = botNum ? createOneTapLink(botNum, `.sub ${cleanMovieTitle(item.cleanTitle || item.title)}`) : '';

            menuText += `*${idx + 1}.* ${icon} *${item.title}* ${typeLabel}\n` +
                        `🌐 *Source:* ${item.source}\n` +
                        (item.duration ? `⏱️ *Duration:* ${item.duration}\n` : '') +
                        tapDl +
                        (oneTapSub ? `👉 🇸🇮 *1-Tap Subtitle:* ${oneTapSub}\n` : '') +
                        `\n`;
        });

        menuText += `─────────────────────────\n` +
                    `_බාගත කිරීමට හෝ සබැඳි ලබා ගැනීමට අදාළ අංකය (1-${Math.min(5, results.length)}) Reply කරන්න._\n` +
                    `_නැතහොත් කෙලින්ම Video (1-Tap Download) හෝ Subtitle ලබා ගැනීමට ඉහත Link එක ඔබන්න._`;

        global.movieSessions[sender] = {
            results: results.slice(0, 5),
            timestamp: Date.now()
        };

        return await conn.sendMessage(from, { text: menuText }, { quoted: mek });

    } catch (err) {
        console.error("Movie Command Error:", err.message);
        reply("❌ *චිත්‍රපට තොරතුරු ලබා ගැනීමට නොහැකි විය.*");
    }
});

// ─────────────────────────────────────────────────────────────
// 8. COMMAND: .sub / .sinhalasub / .subtitle / .srt
// ─────────────────────────────────────────────────────────────
cmd({
    pattern: "sub",
    alias: ["sinhalasub", "subtitle", "srt", "subtitles"],
    desc: "Universal Subtitle Downloader (.srt / .zip)",
    category: "downloader",
    react: "🇸🇮",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) {
            return reply("🇸🇮 *කරුණාකර Subtitle අවශ්‍ය චිත්‍රපටයේ හෝ Episode එකේ නම ලබා දෙන්න!*\n\nඋදාහරණ:\n*.sub Deadpool*\n*.sub One Piece S01E01*\n*.sub Main Ladega*\n*.sub Avatar S02E07*");
        }

        await conn.sendPresenceUpdate('composing', from);
        await reply(`⏳ *"${q.trim()}" සඳහා උපසිරැසි (Subtitles) සකසමින් පවතී... (TG Cloud)*`);

        const subData = await fetchSinhalaSubtitle(q.trim());

        if (!subData || !subData.buffer) {
            // Check if available on Sinhalasub with embedded subtitles
            const liveCheck = await getLiveSeriesData(q.trim());
            if (liveCheck && liveCheck.episodes && liveCheck.episodes.length > 0) {
                const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';
                const epOneTap = botNum ? createOneTapLink(botNum, `.ep ${liveCheck.cleanName} 1 1`) : '';
                return reply(
                    `💡 *"${liveCheck.title}" හි Sinhala Subtitles වීඩියෝව තුළටම ඇතුළත් කර (Hardcoded / Softcoded Subtitles) ඇත.*\n\n` +
                    `📦 *Available Episodes:* ${liveCheck.totalEpisodes}\n` +
                    (epOneTap ? `👉 📥 *1-Tap Download Episode 01 Video:* ${epOneTap}\n\n` : '') +
                    `_සම්පූර්ණ වීඩියෝව (MP4 Document) සමඟ සිංහල උපසිරැසි ලබා ගැනීමට ඉහත 1-Tap Link එක ඔබන්න._\n\n` +
                    `_👑 Powered by ＤＭＣ™ (TG Engine)_`
                );
            }

            return reply(`❌ *"${q.trim()}" සඳහා Subtitle සොයාගත නොහැකි විය. කරුණාකර නම නිවැරදිව පරීක්ෂා කරන්න.*`);
        }

        const sizeKb = (subData.fileSize / 1024).toFixed(1);
        const langFlag = subData.isSinhala ? '🇱🇰' : '🌐';
        const langLabel = subData.language || 'Sinhala';
        const mime = subData.mimetype || (subData.fileName.endsWith('.srt') ? 'text/plain' : 'application/zip');

        await conn.sendMessage(from, {
            document: subData.buffer,
            mimetype: mime,
            fileName: subData.fileName,
            caption: `👑 *${subData.title}* 👑\n\n` +
                     `${langFlag} *${langLabel} Subtitles Downloaded*\n` +
                     `📦 *File:* ${subData.fileName} (${sizeKb} KB)\n` +
                     `⚡ *Engine:* TG Cloud (Universal Subtitles)\n` +
                     `🌐 *Source:* ${subData.source || 'TG Cloud'}\n\n` +
                     `_Downloaded via ＤＭＣ™ (TG Engine)_`
        }, { quoted: mek });

    } catch (err) {
        console.error("Sub Command Error:", err.message);
        reply("❌ *Subtitle ගොනුව ලබා ගැනීමට නොහැකි විය.*");
    }
});

// ─────────────────────────────────────────────────────────────
// 9. INTERACTIVE REPLY LISTENER (Selecting Movie by Number)
// ─────────────────────────────────────────────────────────────
cmd({
    on: "body"
}, async (conn, mek, m, { from, body, reply, sender }) => {
    try {
        if (mek.key.fromMe || !body) return;
        const trimmed = body.trim();

        const session = global.movieSessions[sender];
        if (!session || !session.results) return;

        if (Date.now() - session.timestamp > 300000) {
            delete global.movieSessions[sender];
            return;
        }

        const choice = parseInt(trimmed, 10);
        if (isNaN(choice) || choice < 1 || choice > session.results.length) return;

        const selected = session.results[choice - 1];
        delete global.movieSessions[sender];

        await conn.sendPresenceUpdate('composing', from);
        await reply(`⏳ *"${selected.title}" සඳහා තොරතුරු සහ ලින්ක් ලබා ගනිමින් පවතී... (TG Cloud)*`);

        const botNum = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : '';
        const isYouTube = selected.isYouTube || (selected.link && (selected.link.includes('youtube.com') || selected.link.includes('youtu.be')));

        if (isYouTube) {
            const tapVideo = botNum ? createOneTapLink(botNum, `.dlfilm ${selected.link}`) : '';
            const tapMp3 = botNum ? createOneTapLink(botNum, `.mp3 ${selected.link}`) : '';
            const oneTapSub = botNum ? createOneTapLink(botNum, `.sub ${cleanMovieTitle(selected.cleanTitle || selected.title)}`) : '';

            let responseMsg = `👑 *${selected.title}* 👑\n` +
                              `🌐 *Source:* ${selected.source}\n` +
                              `⚡ *Engine:* TG Cloud\n` +
                              (selected.duration ? `⏱️ *Duration:* ${selected.duration}\n` : '') +
                              `\n` +
                              (tapVideo ? `👉 ⚡ 📄 *1-Tap Download Movie (File & Link):*\n${tapVideo}\n\n` : '') +
                              (tapMp3 ? `👉 🎵 *1-Tap MP3 Audio:*\n${tapMp3}\n\n` : '') +
                              (oneTapSub ? `👉 🇸🇮 *1-Tap Sinhala Subtitle Link:*\n${oneTapSub}\n\n` : '') +
                              `🔗 *Direct Cinema Stream:* ${selected.link}\n\n` +
                              `💡 _ඉහත 1-Tap Download හෝ Subtitle ලින්ක් එක Click කිරීමෙන් සෘජුවම ලබා ගත හැක._\n\n` +
                              `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

            return await conn.sendMessage(from, { text: responseMsg }, { quoted: mek });
        }

        const oneTapSub = botNum ? createOneTapLink(botNum, `.sub ${cleanMovieTitle(selected.title)}`) : '';

        let serversText = "";
        if (selected.link && selected.link.includes('sinhalasub.lk')) {
            try {
                const pageRes = await axios.get(selected.link, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });
                const $m = cheerio.load(pageRes.data);
                const serverLinks = [];
                $m('a').each((i, el) => {
                    const h = $m(el).attr('href') || '';
                    const t = $m(el).text().trim();
                    if (h.includes('/links/') && (t.includes('DLServer') || t.includes('Telagram') || t.includes('Telegram') || t.includes('Server') || t.includes('Download') || t.includes('Pixeldrain'))) {
                        if (!serverLinks.some(s => s.url === h)) {
                            serverLinks.push({ name: t, url: h });
                        }
                    }
                });
                if (serverLinks.length > 0) {
                    serversText = await formatEpisodeServers(serverLinks, botNum);
                }
            } catch (e) {}
        }

        const isSeries = selected.type === 'TV Series' || (selected.link && selected.link.includes('/tvshows/'));
        let tapDl = '';
        if (isSeries) {
            const tapSeries = botNum ? createOneTapLink(botNum, `.series ${selected.title}`) : '';
            const tapEp1 = botNum ? createOneTapLink(botNum, `.epdl ${selected.title} 1 1`) : '';
            tapDl = (tapSeries ? `👉 📥 *1-Tap All Episodes:* ${tapSeries}\n` : '') +
                    (tapEp1 ? `👉 ⚡ *1-Tap Download Ep 1:* ${tapEp1}\n` : '');
        } else {
            const tapMovie = botNum ? createOneTapLink(botNum, `.dlfilm ${selected.title}`) : '';
            tapDl = tapMovie ? `👉 ⚡ 📄 *1-Tap Download Movie (File & Link):*\n${tapMovie}\n\n` : '';
        }

        let responseMsg = `👑 *${selected.title}* 👑\n` +
                          `🌐 *Source:* ${selected.source}\n` +
                          `⚡ *Engine:* TG Cloud\n\n` +
                          tapDl +
                          serversText +
                          `🔗 *Web Page:* ${selected.link}\n\n`;

        if (oneTapSub) {
            responseMsg += `👉 🇸🇮 *1-Tap Sinhala Subtitle Link:*\n${oneTapSub}\n\n`;
        }

        responseMsg += `💡 _ඉහත 1-Tap Download හෝ Subtitle ලින්ක් එක Click කිරීමෙන් සෘජුවම ලබා ගත හැක._\n\n` +
                       `_👑 Powered by ＤＭＣ™ (TG Engine)_`;

        await conn.sendMessage(from, { text: responseMsg }, { quoted: mek });

    } catch (err) {
        console.error("Movie Reply Listener Error:", err.message);
    }
});
