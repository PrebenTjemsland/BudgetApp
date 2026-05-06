# Budget App — Self-hosted setup

## Stack
- **Backend**: Node.js + Express, SQLite (via better-sqlite3), Tesseract OCR
- **Frontend**: Vanilla JS PWA, served by the same Express server
- **No cloud, no accounts, no API keys required**

---

## Server setup (Ubuntu/Debian)

### 1. Install system dependencies

```bash
sudo apt update
sudo apt install -y tesseract-ocr tesseract-ocr-nor tesseract-ocr-eng
# Verify:
tesseract --version
```

### 2. Install Node.js (if not already)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Copy app files to server

```bash
scp -r budgetapp/ user@your-server:~/budgetapp
```

Or clone/copy however you prefer. The structure should be:
```
budgetapp/
  server/
    index.js
    package.json
  client/
    index.html
    manifest.json
    icon.png     ← add a 512x512 PNG yourself, or leave out
```

### 4. Install Node dependencies

```bash
cd ~/budgetapp/server
npm install
```

### 5. Run the server

```bash
node index.js
# Runs on port 3000 by default
```

To change port or data dir:
```bash
PORT=8080 DATA_DIR=/mnt/data/budget node index.js
```

---

## Run as a service (systemd)

```bash
sudo nano /etc/systemd/system/budget.service
```

```ini
[Unit]
Description=Budget App
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/budgetapp/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=PORT=3000
Environment=DATA_DIR=/home/YOUR_USER/budgetapp/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable budget
sudo systemctl start budget
sudo systemctl status budget
```

---

## Nginx reverse proxy (recommended — lets you use a clean local domain)

```nginx
server {
    listen 80;
    server_name budget.local;   # or your server's LAN IP

    client_max_body_size 20M;   # for receipt uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then on your router/Pi-hole/local DNS, point `budget.local` to your server IP.

---

## iPhone setup (no App Store needed)

1. Make sure your iPhone is on the same WiFi as the server
2. Open Safari → go to `http://YOUR_SERVER_IP:3000`
3. Go to Settings in the app → enter server URL: `http://YOUR_SERVER_IP:3000`
4. Tap the Share button → **Add to Home Screen**
5. Done — it opens like a native app

If you set up Nginx with a local domain you can use that URL instead.

---

## OCR accuracy tips

- **Lighting matters most** — flat, even light, no shadows across the receipt
- **Straighten the receipt** before shooting — Tesseract handles slight rotation but not much
- Sharp image preprocessing is already applied (greyscale → normalise → sharpen → upscale to 1400px)
- Norwegian receipts work well with the `nor+eng` language pack included
- Items that don't parse cleanly can always be entered manually, and will still teach the category mapping

## Item → Category learning

Every time you categorise a transaction (whether imported from OCR or manual):
- The item name is normalised (lowercased, quantity/price stripped)
- Saved to the `item_category_map` table
- Next time the same or similar item appears, the category is pre-selected
- You can view and edit all rules in the **Rules** tab
- Hit count shows how many times each rule has fired

---

## Data location

By default: `budgetapp/server/data/`
- `budget.db` — all your data (SQLite, single file, easy to back up)
- `uploads/` — temp folder, receipt images are deleted after OCR

Back up just `budget.db` and you have everything.

---

## Optional: Tailscale for access away from home

```bash
# On server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Get your Tailscale IP:
tailscale ip -4
```

Then in the app Settings, change the server URL to your Tailscale IP. Works from anywhere with no port forwarding.
