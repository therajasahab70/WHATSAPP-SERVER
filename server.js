const express = require('express');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;

// Static dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. WhatsApp Link (Pair Code)
app.get('/get-pair-code', async (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: "Phone number jaroori hai." });

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phone);
                res.json({ code: code });
            } catch (err) {
                res.status(500).json({ error: "Pairing code generate nahi ho paya." });
            }
        }, 3000);
    } else {
        res.json({ message: "Device pehle se connected hai!" });
    }
});

// 2. Bulk Message Sender
app.post('/send-bulk', upload.single('file'), async (req, res) => {
    const { data, messageTemplate, delayTime } = req.body;
    const file = req.file;

    if (!sock) return res.status(400).json({ error: "Pehle WhatsApp device link karein." });

    const contactList = JSON.parse(data); 
    const waitSeconds = parseInt(delayTime) * 1000;

    // Background me sending complete hogi, response turant bhej rahe hain
    res.json({ status: "Campaign shuru ho gaya hai! Background me messages jaa rahe hain." });

    for (let contact of contactList) {
        try {
            const formattedPhone = `${contact.phone}@s.whatsapp.net`;
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
