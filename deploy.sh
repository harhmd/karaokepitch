#!/usr/bin/env bash
# ==============================================================================
# KaraokePitch VPS Automated Deployment Script
# Supports: Ubuntu, Debian, CentOS, AlmaLinux, Rocky Linux
# ==============================================================================

set -e

echo "🎤 Starting KaraokePitch VPS Deployment..."

# 1. Detect if Docker is available
if command -v docker &> /dev/null && command -v docker compose &> /dev/null; then
    echo "🐳 Docker and Docker Compose detected. Deploying via Docker..."
    docker compose down || true
    docker compose build --no-cache
    docker compose up -d
    echo "✅ KaraokePitch is running on port 80 via Docker!"
    exit 0
fi

# 2. Alternative: Native Nginx Setup
echo "⚙️ Docker not found. Checking for native Nginx..."
if command -v nginx &> /dev/null; then
    echo "🌐 Installing KaraokePitch into /var/www/karaokepitch..."
    sudo mkdir -p /var/www/karaokepitch
    sudo cp -r index.html assets /var/www/karaokepitch/
    sudo chown -R www-data:www-data /var/www/karaokepitch 2>/dev/null || sudo chown -R nginx:nginx /var/www/karaokepitch

    echo "📄 Configuring Nginx site..."
    sudo cp nginx.conf /etc/nginx/conf.d/karaokepitch.conf 2>/dev/null || true
    sudo sed -i 's|/usr/share/nginx/html|/var/www/karaokepitch|g' /etc/nginx/conf.d/karaokepitch.conf 2>/dev/null || true
    
    sudo nginx -t && sudo systemctl reload nginx
    echo "✅ KaraokePitch deployed to Nginx at /var/www/karaokepitch!"
    exit 0
fi

# 3. Alternative: Node.js + PM2 / Systemd
if command -v node &> /dev/null; then
    echo "🚀 Deploying with Node.js static server..."
    if command -v pm2 &> /dev/null; then
        pm2 restart karaokepitch || pm2 start server.js --name karaokepitch
        pm2 save
        echo "✅ KaraokePitch is running under PM2 on port 8080!"
    else
        echo "Starting in background with nohup..."
        nohup node server.js > server.log 2>&1 &
        echo "✅ KaraokePitch running on port 8080 (PID $!)"
    fi
    exit 0
fi

echo "❌ Neither Docker, Nginx, nor Node.js were found. Please install Docker or Nginx first."
exit 1
