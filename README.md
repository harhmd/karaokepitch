# 🎤 KaraokePitch

**KaraokePitch** is a client-side, in-browser audio pitch shifter, karaoke key changer, and vocal reduction tool. It allows musicians, karaoke singers, and audio editors to shift the key of backing tracks and songs without changing playback speed or sacrificing audio fidelity.

100% of the audio decoding, processing, and rendering takes place inside your browser using the HTML5 Web Audio API and Web Workers. **No audio files are ever uploaded to a remote server.**

---

## ✨ Features

- 🎤 **Karaoke Key Machine**:
  - Direct semitone key transposition with `♭` (lower) and `♯` (higher) buttons.
  - Real-time LED key shift indicator (`−6` to `+6`).
  - **Vocal Reduce**: Center-channel cancellation algorithm to strip vocals from stereo tracks while retaining bass and stereo instruments.
  - A/B instant audio comparison switch (`Original` vs. `New Key`).
- 📺 **YouTube Live Pitch Changer**:
  - Live real-time YouTube pitch changer using browser AudioWorklet DSP.
  - Paste any YouTube link, Shorts, or video ID to embed and play.
  - Quick shifts (−12, −7, −5, 0, +5, +7, +12), fine-tuning cents, and custom song key selector.
  - 100% in-browser audio routing without downloading or re-encoding video.
- 🎛️ **Pro Pitch & Tempo Shifter**:
  - Continuous pitch shift range from **−24 to +24 semitones** (±2 full octaves).
  - Fine-tuning control in **cents** (−50 to +50 cents, 100 cents = 1 semitone).
  - Independent **tempo/speed control** from **25% to 400%** with steady pitch.
  - **Formant preservation** to eliminate "chipmunk" or deep giant vocal distortion.
  - Interactive **audio waveform canvas** with seekable timeline scrubber.
- 📐 **Semitone Calculator & Key Transposition Matrix**:
  - Calculate the semitone distance and frequency ratio between any two musical keys.
  - Complete reference chart with interval names, frequency multipliers, and pitch changes from C to B.
- 💾 **Lossless & High-Quality Export**:
  - Export to **MP3** (128, 192, 256, 320 kbps) or **WAV** (16-bit PCM lossless).
  - Smart automatic filename encoding (e.g., `song_D-major_+2st.mp3`).
- 🎬 **Video Audio Extraction**:
  - Open MP4, MOV, and WebM video files directly and process their audio tracks.

---

## 🚀 Quick Start (Local Preview)

### Prerequisites
- Node.js (v16+) or any static HTTP server (Python, Nginx, Caddy).

### Run with Node.js
```bash
# Clone or navigate to the repository
cd karaokepitch

# Start the preview server
npm start
# or
node server.js
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Run with Python
```bash
python -m http.server 3000
```

---

## 🐙 GitHub Setup: Push & Pull

Follow these steps to connect your local `karaokepitch` repository to GitHub:

### 1. Initialize Git and Make Initial Commit
```bash
cd karaokepitch
git init
git add .
git commit -m "feat: initial commit for KaraokePitch web application"
git branch -M main
```

### 2. Create the GitHub Repository
You can create a repository named `karaokepitch` either via GitHub's Web UI or via the GitHub CLI:

**Option A: Using GitHub CLI (`gh`)**:
```bash
gh repo create karaokepitch --public --source=. --remote=origin
```

**Option B: Using GitHub Web UI**:
1. Go to [https://github.com/new](https://github.com/new).
2. Set **Repository name** to: `karaokepitch`.
3. Choose **Public** (or Private).
4. Do **not** initialize with a README, .gitignore, or license (they are already included).
5. Click **Create repository**.

### 3. Push to GitHub
```bash
git remote add origin https://github.com/harhmd/karaokepitch.git
git push -u origin main
```

### 4. Pull Future Updates
To pull the latest changes on any machine or VPS:
```bash
git pull origin main
```

---

## 🌐 VPS Deployment Guide

### Option 1: Docker Compose (Recommended)
Docker provides the fastest, isolated deployment with Nginx:

1. SSH into your VPS:
   ```bash
   ssh user@your-vps-ip
   ```
2. Clone the repository:
   ```bash
   git clone https://github.com/harhmd/karaokepitch.git
   cd karaokepitch
   ```
3. Run with Docker Compose:
   ```bash
   docker compose up -d
   ```
KaraokePitch is now live on port `80`!

---

### Option 2: Native Nginx (Ubuntu / Debian)

1. Install Nginx:
   ```bash
   sudo apt update && sudo apt install -y nginx
   ```
2. Clone into `/var/www/karaokepitch`:
   ```bash
   sudo git clone https://github.com/harhmd/karaokepitch.git /var/www/karaokepitch
   sudo chown -R www-data:www-data /var/www/karaokepitch
   ```
3. Copy Nginx configuration:
   ```bash
   sudo cp /var/www/karaokepitch/nginx.conf /etc/nginx/sites-available/karaokepitch
   sudo sed -i 's|/usr/share/nginx/html|/var/www/karaokepitch|g' /etc/nginx/sites-available/karaokepitch
   sudo ln -s /etc/nginx/sites-available/karaokepitch /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl restart nginx
   ```

---

### Option 3: Node.js + PM2

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```
2. Start KaraokePitch:
   ```bash
   pm2 start server.js --name "karaokepitch"
   pm2 save
   pm2 startup
   ```

---

### 🔒 Free SSL / HTTPS Setup with Certbot

To secure your domain with Let's Encrypt SSL:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
Certbot will automatically configure HTTPS certificates and set up automatic renewal.

---

## 🛠️ Project Structure

```
karaokepitch/
├── index.html                   # Unified UI with Karaoke Machine & Pro Shifter
├── server.js                    # Zero-dependency local Node.js static server
├── package.json                 # Project configuration & npm scripts
├── Dockerfile                   # Alpine Nginx container build
├── docker-compose.yml           # Docker Compose definition
├── nginx.conf                   # Production Nginx reverse-proxy configuration
├── deploy.sh                    # One-click VPS deployment script
├── .gitignore                   # Git ignore rules
└── assets/
    ├── pitch-changer-tool-final.css  # Pro pitch tool styling
    ├── pitch-changer-tool-final.js   # Pro tool UI interactions & audio bindings
    ├── opc-karaoke-pitch-changer.css # Karaoke machine styling & LED meter
    ├── opc-karaoke-pitch-changer.js  # Karaoke tool logic & vocal reduction filter
    ├── opc-engine.js                 # Core DSP engine (key detection, phase vocoder)
    ├── opc-engine-worker.js          # Background Web Worker thread runner
    └── vendor/
        └── lame.min.js               # MP3 encoding library
```

---

## 📄 License
This project is licensed under the GPL-2.0 / LGPL-3.0 License.
