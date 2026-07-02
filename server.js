const express = require('express');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
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
let connectionStatus = "Disconnected";

// Static Dashboard Serve Karein
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// WhatsApp Socket Initialization aur QR Generation Logic
async function initWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Mac OS", "Chrome", "123.0.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // QR Code ko Base64 Image string me convert karein taaki HTML me dikh sake
            try {
                latestQr = await QRCode.toDataURL(qr);
                connectionStatus = "QR Ready";
            } catch (err) {
                console.error("QR Conversion Error:", err);
            }
        }

        if (connection === 'close') {
            console.log("Connection closed, reconnecting...");
            connectionStatus = "Disconnected";
            latestQr = null;
            initWhatsApp(); // Auto reconnect
        } else if (connection === 'open') {
            console.log("WhatsApp Successfully Connected!");
            connectionStatus = "Connected";
            latestQr = null; // Connect hone ke baad QR hata dein
        }
    });
}

// App start hote hi WhatsApp trigger karein
initWhatsApp();

// Frontend ke liye Status aur QR ka API Endpoint
app.get('/get-qr', (req, res) => {
    res.json({
        status: connectionStatus,
        qr: latestQr
    });
});

// Bulk Message & File Sender
app.post('/send-bulk', upload.single('file'), async (req, res) => {
    const { data, messageTemplate, delayTime } = req.body;
    const file = req.file;

    if (connectionStatus !== "Connected") {
        return res.status(400).json({ error: "Pehle WhatsApp QR Code scan karke device link karein." });
    }

    const contactList = JSON.parse(data); 
    const waitSeconds = parseInt(delayTime) * 1000;

    res.json({ status: "Campaign shuru ho gaya hai! Background me messages jaa rahe hain." });

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

            console.log(`Message sent to ${contact.name}`);
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
