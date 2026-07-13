# Ubuntu VPS Deployment Guide

Follow these exact steps to set up and run this application on your fresh Ubuntu VPS (1 CPU, 4GB RAM).

---

### Step 1: Upload the Arabic Transparent Font (Recommended)
Before running the setup on the server, you should upload the **Arabic Transparent** font from your Windows PC to ensure the PDF layout matches your templates perfectly.

1. Open a **new PowerShell window** on your Windows laptop.
2. Run this command to upload the font to the server's temporary folder:
   ```powershell
   scp C:\Windows\Fonts\arabtype.ttf root@YOUR_VPS_IP:/tmp/
   ```
   *(Replace `YOUR_VPS_IP` with your actual VPS IP address. If prompted, type `yes` and enter your VPS password).*

---

### Step 2: SSH into your VPS
Log in to your VPS server:
```bash
ssh root@YOUR_VPS_IP
```
*(Replace `YOUR_VPS_IP` with your actual VPS IP address).*

---

### Step 3: Clone the Repository
Clone your project repository from GitHub to the server:
```bash
git clone https://github.com/HarshNaralkar/Document-downloader.git /var/www/docgen
```

---

### Step 4: Move the Arabic Font to the App Directory
If you uploaded `arabtype.ttf` in Step 1, move it into the project folder so the installation script can find and install it:
```bash
mv /tmp/arabtype.ttf /var/www/docgen/
```

---

### Step 5: Run the Setup Script
Navigate to the directory and run the automated server setup script:
```bash
cd /var/www/docgen
chmod +x deploy.sh
sudo ./deploy.sh
```
**What this script does automatically:**
* Updates system libraries.
* Installs **Node.js 20**, **PM2**, **Nginx**, **MySQL**, and **Certbot**.
* Installs **LibreOffice** (headless conversion engine) and MS core fonts.
* Moves `arabtype.ttf` to system font directories and updates font caches.
* Initializes the `login` MySQL database and `docgen` user.
* Configures **Nginx** reverse proxy to route port 80 requests to the Node app on port 5000.
* Obtains and configures a free **Let's Encrypt SSL Certificate** for `onlines.vivaninternationaljobs.com` with automated HTTP-to-HTTPS redirect.


---

### Step 6: Configure Environment Variables

Create your production environment file:
```bash
cp .env.example .env
nano .env
```
Inside the text editor, update the following fields:
* `MAIL_USERNAME` = Your Gmail address (e.g. `yourname@gmail.com`)
* `MAIL_PASSWORD` = Your Gmail App Password (16-character code)
* `SECRET_KEY` = A random secret string (e.g. `mycustomsecretkey123!`)
* `MYSQL_PASSWORD` = Keep as `DocgenPass123!` (or change if you customized it in `deploy.sh`)
* `ADMIN_EMAIL` = Your admin email address for notifications

*To save and exit the nano editor:*
1. Press `Ctrl + O`
2. Press `Enter` (to confirm file name)
3. Press `Ctrl + X` (to exit)

---

### Step 7: Install App Dependencies
Install the required Node.js libraries:
```bash
npm install
```

---

### Step 8: Start the Application with PM2
Start the application under PM2 process manager using the configuration file (runs in fork mode to protect the PDF batch queue):
```bash
pm2 start ecosystem.config.js
```

Configure PM2 to automatically launch the app if the server reboots:
```bash
pm2 save
pm2 startup
```
*PM2 will output a command starting with `sudo env PATH=...`. Copy and paste that exact command into the command line and press Enter to complete the boot registration.*

---

### Step 9: Visit your Application
Open your web browser and navigate to:
```
https://onlines.vivaninternationaljobs.com
```
You should see the login screen. You can register, log in, persist your session, and generate PDF documents securely over SSL!


---

### Useful Commands for Maintenance
* **View Real-Time Logs:** `pm2 logs`
* **Check Status of the Server:** `pm2 status`
* **Restart the App:** `pm2 restart docgen`
* **Stop the App:** `pm2 stop docgen`
