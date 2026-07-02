const express = require('express');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const app = express();
const upload = multer({ dest: 'uploads/' });
const logEmitter = new EventEmitter();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock = null;
let latestQr = null;
let connectionStatus = "Initializing...";
let isCampaignRunning = false;
let isInitializing = false;

// 🔥 Live screen par message bhejne ka function
function sendLog(msg) {
    console.log(msg);
    logEmitter.emit('log', msg);
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Live Screen route
app.get('/live-logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const listener = (msg) => { res.write(`data: ${msg}\n\n`); };
    logEmitter.on('log', listener);
    req.on('close', () => { logEmitter.removeListener('log', listener); });
});

async function initWhatsApp() {
    if (isInitializing) return; 
    isInitializing = true;
    
    sendLog("⚙️ Starting WhatsApp Initialization...");
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["GadarServer", "Chrome", "1.0.0"],
        printQRInTerminal: false,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            sendLog("🎯 QR Code Generate ho gaya hai. Kripya Scan karein.");
            try {
                latestQr = await QRCode.toDataURL(qr);
                connectionStatus = "QR Ready";
            } catch (err) { sendLog("QR Error: " + err); }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            sendLog(`⚠️ Connection closed (Code: ${statusCode}). Reconnecting...`);
            
            connectionStatus = "Disconnected";
            isInitializing = false;

            if (statusCode === DisconnectReason.loggedOut) {
                sendLog("❌ User ne phone se log out kiya hai. Naya QR code laa rahe hain...");
                latestQr = null;
                try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); } catch(e) {}
            }
            
            setTimeout(() => { initWhatsApp(); }, 4000);

        } else if (connection === 'open') {
            sendLog("✅ WhatsApp Link Ho Gaya Hai! Ready for messages.");
            connectionStatus = "Connected";
            latestQr = null; 
            isInitializing = false;
        }
    });
}

initWhatsApp();

app.get('/get-qr', (req, res) => {
    res.json({ status: connectionStatus, qr: latestQr });
});

app.post('/send-bulk', upload.single('file'), async (req, res) => {
    const { data, messageTemplate, delayTime } = req.body;
    const file = req.file;

    if (connectionStatus !== "Connected") {
        return res.status(400).json({ error: "Pehle WhatsApp QR Code scan karein." });
    }

    const contactList = JSON.parse(data); 
    const waitSeconds = parseInt(delayTime) * 1000;

    let messageLines = [];
    if (file) {
        try {
            const fullText = fs.readFileSync(file.path, 'utf-8');
            messageLines = fullText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
            
            sendLog(`📄 TXT File load ho gayi. Isme total ${messageLines.length} messages hain.`);
            fs.unlinkSync(file.path); 
        } catch (err) {
            sendLog("❌ File ko padhne me error aayi.");
        }
    }

    if (!messageTemplate.trim() && messageLines.length === 0) {
        sendLog(`❌ ERROR: Message khali hai! Box me kuch likhein ya file lagayein.`);
        return res.json({ status: "Error: Blank message" });
    }

    res.json({ status: "Campaign Start! Niche Live Screen par dekhein." });
    isCampaignRunning = true;

    // 🔥 Infinite Loop System
    (async () => {
        let roundNumber = 1;
        while (isCampaignRunning) {
            sendLog(`\n🔄 --- ROUND ${roundNumber} SHURU ---`);
            
            for (let contact of contactList) {
                if (connectionStatus !== "Connected") {
                    sendLog("❌ WhatsApp Disconnected. Loop rok diya gaya hai.");
                    isCampaignRunning = false;
                    break;
                }

                let cleanReceiverPhone = contact.phone.replace(/[^0-9]/g, '');
                const formattedPhone = `${cleanReceiverPhone}@s.whatsapp.net`;

                // 1️⃣ PHOLE MESSAGE BOX KA TEXT BHEJNA
                if (messageTemplate && messageTemplate.trim()) {
                    try {
                        let personalizedMsg = `${contact.name}, ${messageTemplate.trim()}`;
                        // 🔥 Direct Message Send (No typing fake status)
                        await sock.sendMessage(formattedPhone, { text: personalizedMsg });
                        sendLog(`📩 Box Msg Sent: ${contact.name} ko.`);
                        await delay(waitSeconds);
                    } catch (error) {
                        sendLog(`❌ ERROR (Box Msg): ${contact.name} - ${error.message}`);
                    }
                }

                // 2️⃣ FIR FILE KI LINES KO EK-EK KARKE BHEJNA
                if (messageLines.length > 0) {
                    sendLog(`📂 ${contact.name} ko File ke ${messageLines.length} messages bhejna shuru...`);
                    for (let i = 0; i < messageLines.length; i++) {
                        if (!isCampaignRunning || connectionStatus !== "Connected") break;
                        
                        try {
                            const lineText = messageLines[i];
                            // 🔥 Direct Message Send
                            await sock.sendMessage(formattedPhone, { text: lineText });
                            
                            sendLog(`📩 File Msg (${i+1}/${messageLines.length}) Sent -> ${contact.name}`);
                            await delay(waitSeconds); // Har message ke baad delay
                        } catch (error) {
                            sendLog(`❌ ERROR (File Msg): ${contact.name} - ${error.message}`);
                        }
                    }
                }
            }
            
            if (isCampaignRunning) {
                sendLog(`✅ ROUND ${roundNumber} PURA HUA! 5 Second baad dubara shuru hoga...`);
                roundNumber++;
                await delay(5000); 
            }
        }
    })();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
