# 🚀 Docker Deployment Guide — Document Downloader

This guide walks you through the complete steps to deploy the Document Downloader application on a fresh **Ubuntu VPS** using **Docker** and **Docker Compose**.

All system fonts (Arial, Times New Roman, Calibri, Arabic fonts, etc.) are bundled inside the repository under the `./fonts/` folder and will be automatically installed inside the Docker container during build.

---

## 📋 Prerequisites

| Requirement | Version |
|---|---|
| Ubuntu VPS | 22.04 LTS (recommended) |
| RAM | Minimum 2GB (4GB recommended) |
| Docker | 24+ |
| Docker Compose | v2+ (included with Docker Desktop / Engine) |
| Git | Any recent version |
| Domain | Pointed to your VPS IP (for SSL) |

---

## Step 1 — SSH Into Your VPS

```bash
ssh root@YOUR_VPS_IP
```

---

## Step 2 — Install Docker & Docker Compose

Run the official Docker install script (works on Ubuntu 20.04, 22.04, 24.04):

```bash
curl -fsSL https://get.docker.com | sh
```

Verify the installation:

```bash
docker --version
docker compose version
```

---

## Step 3 — Install Git & Clone the Repository

```bash
apt-get install -y git

git clone https://github.com/HarshNaralkar/Document-downloader.git /var/www/docgen

cd /var/www/docgen
```

---

## Step 4 — Create the Environment File

Copy the example environment file and fill in your real values:

```bash
cp .env.example .env
nano .env
```

Update the following fields inside the editor:

```env
# MySQL — these must match the values in docker-compose.yml
MYSQL_HOST=db
MYSQL_USER=docgen
MYSQL_PASSWORD=DocgenPass123!
MYSQL_DB=login

# Session Secret — use a long, random string
SECRET_KEY=replace_with_long_random_secret_string_here

# Gmail SMTP — for OTP emails
MAIL_USERNAME=youremail@gmail.com
MAIL_PASSWORD=your_16_char_gmail_app_password

# Admin email for notifications
ADMIN_EMAIL=youremail@gmail.com

# Port — app runs on 5100 inside Docker
PORT=5100

# Keep at 1 for LibreOffice stability on Linux
MAX_CONCURRENT_CONVERSIONS=1
```

> **Save and exit nano**: Press `Ctrl + O` → `Enter` → `Ctrl + X`

> **Important**: `MYSQL_HOST` must be `db` (not `localhost`) when running with Docker Compose — `db` is the name of the MySQL service inside the Docker network.

---

## Step 5 — Build and Start the Containers

```bash
docker compose up -d --build
```

This single command will:
- ✅ Pull the official `mysql:8.0` image for the database
- ✅ Build the Node.js application Docker image
- ✅ Install **LibreOffice** (headless) inside the container
- ✅ Copy all **fonts** from `./fonts/` into `/usr/share/fonts/truetype/custom/`
- ✅ Register fonts into LibreOffice's own font directory
- ✅ Run `fc-cache -fv` to refresh the system font cache
- ✅ Install all Node.js dependencies (`npm ci`)
- ✅ Start the app on port **5100**

> ⏳ The first build takes **5–10 minutes** because LibreOffice is large. Subsequent restarts are instant.

---

## Step 6 — Verify the Containers are Running

```bash
docker compose ps
```

You should see both services with status `Up`:

```
NAME           IMAGE           STATUS          PORTS
docgen-db      mysql:8.0       Up (healthy)    127.0.0.1:3306->3306/tcp
docgen-web     docgen-web      Up              0.0.0.0:5100->5100/tcp
```

Check the app logs:

```bash
docker compose logs -f web
```

You should see:
```
Document Generator running on http://localhost:5100
MySQL Database initialized successfully
```

---

## Step 7 — Install and Configure Nginx (Reverse Proxy)

Install Nginx:

```bash
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx
```

Create a new Nginx config for your domain:

```bash
nano /etc/nginx/sites-available/docgen
```

Paste the following (replace `yourdomain.com` with your actual domain):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

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
```

Enable the site and reload Nginx:

```bash
ln -sf /etc/nginx/sites-available/docgen /etc/nginx/sites-enabled/docgen
nginx -t && systemctl reload nginx
```

---

## Step 8 — Enable SSL with Let's Encrypt (HTTPS)

Install Certbot:

```bash
apt-get install -y certbot python3-certbot-nginx
```

Obtain and configure the SSL certificate (replace with your domain and email):

```bash
certbot --nginx -d yourdomain.com --non-interactive --agree-tos \
  -m youremail@gmail.com --redirect
```

Certbot will automatically:
- Issue a free SSL certificate
- Update the Nginx config to redirect HTTP → HTTPS

Verify auto-renewal works:

```bash
certbot renew --dry-run
```

---

## Step 9 — Visit Your Application

Open your browser and navigate to:

```
https://yourdomain.com
```

You should see the login page. 🎉

---

## 🔄 Updating the Application

When you push new code to GitHub, SSH into your VPS and run:

```bash
cd /var/www/docgen

# Pull latest changes
git pull origin main

# Rebuild and restart containers
docker compose up -d --build
```

---

## 🛠️ Useful Maintenance Commands

| Action | Command |
|---|---|
| View live logs | `docker compose logs -f web` |
| View database logs | `docker compose logs -f db` |
| Restart app only | `docker compose restart web` |
| Stop all containers | `docker compose down` |
| Start all containers | `docker compose up -d` |
| Open MySQL shell | `docker compose exec db mysql -u docgen -pDocgenPass123! login` |
| Check font list in container | `docker compose exec web fc-list : family \| sort -u` |
| Check container resource usage | `docker stats` |

---

## 🔧 Troubleshooting

### App not starting — database connection error
The MySQL container may still be initializing. Wait 30 seconds and restart the web service:
```bash
docker compose restart web
```

### PDF fonts look different from local machine
Verify fonts are installed inside the container:
```bash
docker compose exec web fc-list | grep -i "calibri\|arial\|times"
```
If missing, rebuild the image:
```bash
docker compose up -d --build --force-recreate
```

### Port 5100 not accessible
Check if the container is running and the port is bound:
```bash
docker compose ps
ss -tlnp | grep 5100
```

### SSL certificate renewal failed
```bash
systemctl status certbot.timer
certbot renew --force-renewal
```

---

## 📁 Project Structure (Key Files)

```
/var/www/docgen/
├── app.js                  # Main Node.js application
├── Dockerfile              # Docker container definition
├── docker-compose.yml      # Multi-container orchestration
├── .env                    # Your environment secrets (never commit this)
├── .env.example            # Template for .env
├── fonts/                  # System fonts bundled for the container
│   ├── arial.ttf
│   ├── calibri.ttf
│   ├── times.ttf
│   ├── Amiri-Regular.ttf   # Arabic fonts
│   └── ...
├── templates/              # DOCX document templates
│   ├── ROYAL/
│   ├── VIVAN/
│   └── ...
├── output/                 # Generated PDFs (per-session, auto-cleaned)
└── downloads/              # User uploaded files
```

---

*Generated for the Document Downloader project — [github.com/HarshNaralkar/Document-downloader](https://github.com/HarshNaralkar/Document-downloader)*
