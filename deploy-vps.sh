#!/bin/bash
# ============================================================
# VPS Deployment Script for PinshilaCross Backend
# Target: 161.118.174.62
# ============================================================
set -e

echo "========================================"
echo "  PinshilaCross Backend VPS Deployment"
echo "========================================"

# --- 1. System Dependencies ---
echo ""
echo "[1/6] Installing system dependencies..."
sudo apt-get update -y
sudo apt-get install -y curl git nginx redis-server postgresql-client

# --- 2. Install Node.js (if not installed) ---
if ! command -v node &> /dev/null; then
  echo "[2/6] Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# --- 3. Install PM2 globally ---
echo "[3/6] Installing PM2 process manager..."
sudo npm install -g pm2

# --- 4. Setup project ---
echo "[4/6] Setting up project..."
cd /home/ubuntu || cd /root

# Clone or copy your project here
# If you're copying via SCP, skip the git clone
# git clone <your-repo-url> pinshilaCross
# cd pinshilaCross/backend

# Install dependencies
npm install

# Build TypeScript
npm run build

# --- 5. Setup .env ---
echo "[5/6] Setting up environment..."
# Copy the production env file
cp .env.production .env

# IMPORTANT: Generate a strong JWT secret
JWT_SECRET=$(openssl rand -hex 64)
sed -i "s/JWT_SECRET=<GENERATE_A_STRONG_SECRET_HERE>/JWT_SECRET=$JWT_SECRET/" .env

# --- 6. Start with PM2 ---
echo "[6/6] Starting application with PM2..."
pm2 delete pinshila-backend 2>/dev/null || true
pm2 start dist/index.js --name pinshila-backend -- -p 8000
pm2 save
pm2 startup

echo ""
echo "========================================"
echo "  Backend is running on port 8000"
echo "  Health check: http://161.118.174.62:8000/api/health"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Configure Nginx reverse proxy (see nginx-config below)"
echo "  2. Open firewall ports: sudo ufw allow 8000"
echo "  3. Verify: curl http://localhost:8000/api/health"