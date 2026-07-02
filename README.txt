# WhatsApp Automatic Bulk Sender

Yeh ek full-stack Node.js automation script hai jo WhatsApp par automatic personalized messages (Naam ke sath) aur files send karne ke liye banayi gayi hai. Isme profile picture widget aur multi-field input dynamic management add kiya gaya hai.

## Files Structure:
1. `server.js` - Backend server logic (Baileys & Express implementation)
2. `index.html` - Frontend control panel (with Top circular profile icon)
3. `package.json` - Node dependencies setup

## Local System Setup Instructions:
1. ZIP extract karein aur folder ke andar terminal open karein.
2. `npm install` run karein modules install karne ke liye.
3. `npm start` se server execute karein.
4. Browser par `http://localhost:3000` open karein.

## Render Deployment:
1. Files ko GitHub repository me push karein.
2. Render.com par New Web Service create karke repository connect karein.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Advanced settings me **Persistent Disk** attach karein aur mount path `/opt/render/project/src/auth_info_baileys` set karein taaki logout na ho.
