const express = require('express');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock = null;
let latestQr = null;
let connectionStatus = "Initializing...";

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

async function initWhatsApp() {
    console.log("Starting Fresh WhatsApp Initialization...");
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    // WhatsApp ka latest web version fetch karein taaki connection block na ho
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307], isLatest: true }));

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // Yeh browser string bilkul official web app ki tarah treat hota hai
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false,
        mobile: false,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("🎯 QR Code Generated Successfully!");
            try {
                latestQr = await QRCode.toDataURL(qr);
                connectionStatus = "QR Ready";
            } catch (err) {
                console.error("QR Error:", err);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`Connection closed (Status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
            
            connectionStatus = "Disconnected";
            latestQr = null;
            
            // Agar purana session corrupt ho gaya ho, toh use clear karke restart karein
            if (statusCode === DisconnectReason.badSession || statusCode === 405) {
                console.log("Bad session/Method not allowed detected. Cleaning cache...");
                try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); } catch(e) {}
            }

            if (shouldReconnect) {
                setTimeout(() => { initWhatsApp(); }, 5000); // 5 seconds baad automatic fresh try
            }
        } else if (connection === 'open') {
            console.log("✅ WhatsApp successfully connected!");
            connectionStatus = "Connected";
            latestQr = null;
        }
    });
}

// Start core logic
initWhatsApp();

app.get('/get-qr', (req, res) => {
    res.json({
        status: connectionStatus,
        qr: latestQr
    });
});

app.post('/send-bulk', upload.single('file'), async (req, res) => {
    const { data, messageTemplate, delayTime } = req.body;
    const file = req.file;

    if (connectionStatus !== "Connected") {
        return res.status(400).json({ error: "Pehle WhatsApp QR Code scan karein." });
    }

    const contactList = JSON.parse(data); 
    const waitSeconds = parseInt(delayTime) * 1000;

    res.json({ status: "Campaign shuru ho gaya hai!" });

    for (let contact of contactList) {
        try {
            let cleanReceiverPhone = contact.phone.replace(/[^0-9]/g, '');
            const formattedPhone = `${cleanReceiverPhone}@s.whatsapp.net`;
            const personalizedMessage = `${contact.name}, ${messageTemplate}`;

            if (file) {
                await sock.sendMessage(formattedPhone, {
                    document: { url: file.path },
                    fileName: file.originalname,
                    caption: personalizedMessage
                });
            } else {
                await sock.sendMessage(formattedPhone, { text: personalizedMessage });
            }
            await delay(waitSeconds);
        } catch (error) {
            console.error(`Failed to send to ${contact.name}:`, error);
        }
    }

    if (file) {
        try { fs.unlinkSync(file.path); } catch(e) {}
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
