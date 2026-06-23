#!/bin/bash
# ============================================================
# deploy.sh — Full Ubuntu 22.04 VPS Setup for Document Generator
# Run as root on a fresh Ubuntu 22.04 server:
#   chmod +x deploy.sh && sudo bash deploy.sh
# ============================================================
set -e

APP_DIR="/var/www/docgen"
NODE_VERSION="20"
MYSQL_ROOT_PASS="RootPass123!"   # <--- CHANGE THIS
DB_NAME="login"
DB_USER="docgen"
DB_PASS="DocgenPass123!"        # <--- CHANGE THIS

echo "===================================="
echo " Document Generator — VPS Setup"
echo "===================================="

# 1. Update system
apt-get update -y && apt-get upgrade -y

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

# 3. Install LibreOffice (full suite for best font rendering)
apt-get install -y libreoffice libreoffice-writer

# 4. Install Microsoft-compatible fonts (Arial, Times New Roman etc.)
apt-get install -y ttf-mscorefonts-installer fontconfig
fc-cache -fv

# 5. Install Arabic & Noto fonts for proper Arabic rendering
apt-get install -y fonts-noto fonts-noto-core fonts-noto-extra \
    fonts-kacst fonts-hosny-amiri \
    fonts-liberation fonts-liberation2

# 6. Copy Arabic Transparent font if available locally
# (Copy arabtype.ttf from C:\Windows\Fonts\ on Windows to this script's directory first)
if [ -f "./arabtype.ttf" ]; then
    echo "Installing Arabic Transparent font..."
    cp ./arabtype.ttf /usr/share/fonts/truetype/
    cp ./arabtype.ttf /usr/lib/libreoffice/share/fonts/truetype/ 2>/dev/null || true
    fc-cache -fv
    echo "Arabic Transparent installed."
else
    echo "WARNING: arabtype.ttf not found. Arabic fonts may not match templates."
    echo "Copy C:\\Windows\\Fonts\\arabtype.ttf to this directory and re-run."
fi

# 7. Install MySQL
apt-get install -y mysql-server
systemctl start mysql
systemctl enable mysql

# Set up MySQL root password and create app database/user
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';"
mysql -u root -p"${MYSQL_ROOT_PASS}" -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;"
mysql -u root -p"${MYSQL_ROOT_PASS}" -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -u root -p"${MYSQL_ROOT_PASS}" -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';"
mysql -u root -p"${MYSQL_ROOT_PASS}" -e "FLUSH PRIVILEGES;"

# 8. Install Nginx & Certbot for Let's Encrypt SSL
apt-get install -y nginx certbot python3-certbot-nginx
systemctl start nginx
systemctl enable nginx

# 9. Install PM2 globally
npm install -g pm2

# 10. Create app directory and copy files
mkdir -p ${APP_DIR}
echo ""
echo "================================================================"
echo " Now copy your project files to: ${APP_DIR}"
echo " You can use: scp -r ./\"webiste fix\"/* root@YOUR_VPS_IP:${APP_DIR}/"
echo "================================================================"
echo ""
echo "After copying files, run these commands to finish setup:"
echo ""
echo "  cd ${APP_DIR}"
echo "  npm install"
echo "  # Edit .env with your config (see .env.example)"
echo "  pm2 start ecosystem.config.js"
echo "  pm2 save"
echo "  pm2 startup"
echo ""

# 11. Create .env.example template
cat > ${APP_DIR}/.env.example << 'ENVEOF'
# MySQL (use the values you set in deploy.sh)
MYSQL_HOST=localhost
MYSQL_USER=docgen
MYSQL_PASSWORD=DocgenPass123!
MYSQL_DB=login

# Session secret (generate a long random string)
SECRET_KEY=replace_with_long_random_secret_string

# Email (Gmail SMTP for OTP)
MAIL_USERNAME=youremail@gmail.com
MAIL_PASSWORD=your_gmail_app_password

# LibreOffice (auto-detected on Linux, leave empty)
# LIBREOFFICE_PATH=/usr/bin/libreoffice

# Port — must be unique on this server (5100 is used to avoid conflicts)
PORT=5100
ENVEOF

# 12. Configure Nginx reverse proxy (dedicated site for this subdomain only)
# NOTE: We do NOT remove /etc/nginx/sites-enabled/default — other apps on this server must not be disturbed.
cat > /etc/nginx/sites-available/docgen << 'NGINXEOF'
server {
    listen 80;
    server_name onlines.vivaninternationaljobs.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINXEOF

# Enable this site (leave all other existing sites untouched)
ln -sf /etc/nginx/sites-available/docgen /etc/nginx/sites-enabled/docgen
nginx -t && systemctl reload nginx

# 13. Obtain Let's Encrypt SSL Certificate
echo "Obtaining SSL certificate for onlines.vivaninternationaljobs.com..."
certbot --nginx -d onlines.vivaninternationaljobs.com --non-interactive --agree-tos -m hn.harshnaralkar@gmail.com --redirect

echo ""
echo "===================================="
echo " Setup complete!"
echo " Next steps:"
echo "   1. Copy app files to ${APP_DIR}"
echo "   2. cd ${APP_DIR} && npm install"
echo "   3. cp .env.example .env && nano .env"
echo "   4. pm2 start ecosystem.config.js"
echo "   5. pm2 save && pm2 startup"
echo "   6. Visit: http://YOUR_VPS_IP"
echo "===================================="
