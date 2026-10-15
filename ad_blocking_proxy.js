/**
 * 👑 DMC AD-BLOCKING HTTP/HTTPS PROXY (Node.js) 👑
 * 
 * Intercepts all outgoing scraper/bot HTTP & HTTPS traffic.
 * Targets ad and header-bidding auction networks (WeForAds, Cootlogix, AdsYield, etc.)
 * and immediately responds with HTTP 404 Not Found to prevent ads from loading.
 */

const http = require('http');
const https = require('https');
const url = require('url');
const net = require('net');

// Comprehensive list of ad and auction domains to force 404
const BLOCKED_AD_DOMAINS = [
    'weforads.com',
    'ads-34eko.open-adsyield.com',
    'omni-dex.io',
    'onetag-sys.com',
    'shb.richaudience.com',
    'exchange.kueezrtb.com',
    'cootlogix.com',
    'fast.nexx360.io',
    'doubleclick.net',
    'googlesyndication.com',
    'popads.net',
    'adsterra.com',
    'exoclick.com'
];

const PROXY_PORT = process.env.PROXY_PORT || 8080;

// HTTP Proxy handler
const server = http.createServer((req, res) => {
    const requestUrl = url.parse(req.url);
    const hostname = requestUrl.hostname || req.headers.host;

    const isBlocked = BLOCKED_AD_DOMAINS.some(domain => hostname && hostname.toLowerCase().includes(domain));

    if (isBlocked) {
        console.log(`[AD BLOCKED - 404] Intercepted: ${req.url}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found (Blocked by DMC Ad-Blocking Proxy)');
    } else {
        const options = {
            hostname: requestUrl.hostname,
            port: requestUrl.port || (requestUrl.protocol === 'https:' ? 443 : 80),
            path: requestUrl.path,
            method: req.method,
            headers: req.headers
        };

        const connector = requestUrl.protocol === 'https:' ? https : http;

        const proxyReq = connector.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        req.pipe(proxyReq);

        proxyReq.on('error', (err) => {
            console.error(`[PROXY FORWARD ERROR] for ${req.url}:`, err.message);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Proxy Error: ' + err.message);
        });
    }
});

// HTTPS CONNECT Tunnel handler
server.on('connect', (req, clientSocket, head) => {
    const requestUrl = url.parse(`https://${req.url}`);
    const hostname = requestUrl.hostname || req.url.split(':')[0];
    const port = requestUrl.port || 443;

    const isBlocked = BLOCKED_AD_DOMAINS.some(domain => hostname && hostname.toLowerCase().includes(domain));

    if (isBlocked) {
        console.log(`[AD BLOCKED - CONNECT 404] Intercepted: ${req.url}`);
        clientSocket.write('HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n\r\n404 Not Found (Blocked by DMC Proxy)');
        clientSocket.end();
        clientSocket.destroy();
        return;
    }

    const serverSocket = net.connect(port, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                           'Proxy-agent: DMC-AdBlock-Proxy\r\n' +
                           '\r\n');
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
        clientSocket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        clientSocket.end();
        clientSocket.destroy();
    });

    clientSocket.on('error', () => {
        serverSocket.end();
        serverSocket.destroy();
    });
});

server.listen(PROXY_PORT, () => {
    console.log(`[DMC PROXY] Ad-blocking proxy listening on port ${PROXY_PORT}`);
    console.log(`[DMC PROXY] Enforcing 404 on ${BLOCKED_AD_DOMAINS.length} ad networks`);
});

module.exports = server;
