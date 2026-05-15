# Budget App

Self-hosted budget tracker with a React/Vite frontend, an Express + SQLite backend, and OCR support for receipt imports.

<p align="center">
  <img width="300" alt="Dashboard" src="https://github.com/user-attachments/assets/70647faf-e456-4804-b006-8c60ab71ff5e" />
  <img width="300" alt="Receipt OCR flow" src="https://github.com/user-attachments/assets/b49e7570-9da3-45a2-b7a5-c4202c41b2c1" />
</p>


## Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Storage**: SQLite via `better-sqlite3`
- **OCR**: Tesseract by default, with optional Google Vision or Ollama providers

## Docker quick start

Build and run with Docker Compose:

```bash
mkdir -p data
docker compose up --build
```

Then open:

```bash
http://localhost:3000
```

The app stores SQLite data in `./data` on your machine.

If you want to stop it:

```bash
docker compose down
```

If you want to see logs:

```bash
docker compose logs -f
```

You can still build the image directly if you want:

```bash
docker build -t budgetapp:dev .
```

## Publish to GitHub Container Registry

This repo now includes `.github/workflows/publish-image.yml`, which publishes the Docker image to GHCR on:

- pushes to `main`
- tags matching `v*`
- manual workflow dispatch

Published image names follow this repo, for example:

```text
ghcr.io/prebentjemsland/budgetapp:main
ghcr.io/prebentjemsland/budgetapp:sha-<commit>
ghcr.io/prebentjemsland/budgetapp:latest
```

To publish manually from your machine instead of using Actions:

```bash
docker build -t budgetapp:dev .
docker tag budgetapp:dev ghcr.io/prebentjemsland/budgetapp:dev
echo "$GHCR_TOKEN" | docker login ghcr.io -u PrebenTjemsland --password-stdin
docker push ghcr.io/prebentjemsland/budgetapp:dev
```

`GHCR_TOKEN` needs `write:packages`.

## Run on the server with Docker Compose

The included `compose.yaml` can also use an image from a registry on the server.

```bash
mkdir -p data
export BUDGETAPP_IMAGE=ghcr.io/prebentjemsland/budgetapp:main
docker compose pull
docker compose up -d
```

Default runtime settings:

- Container port: `3000`
- Mounted data directory: `./data -> /data`
- Default OCR provider: `tesseract`

Useful overrides:

```bash
export HOST_PORT=3001
export OCR_PROVIDER=ollama
export OLLAMA_BASE_URL=http://host.docker.internal:11434
docker compose up -d
```

If you use Tailscale, open the app from your phone with the server's Tailscale IP or MagicDNS name.

## Secrets and Google Vision

Do **not** bake API keys into the Docker image, and do **not** store them in app settings. Keep secrets on the server as environment variables.

If you already use a `.env` file with Docker Compose, that fits this app well. The existing `compose.yaml` passes `GOOGLE_VISION_API_KEY` through to the container when it is present in your server-side `.env` file.

Example server `.env`:

```bash
BUDGETAPP_IMAGE=ghcr.io/prebentjemsland/budgetapp:main
HOST_PORT=3000
OCR_PROVIDER=tesseract
GOOGLE_VISION_API_KEY=your_real_key_here
```

Then redeploy:

```bash
docker compose pull
docker compose up -d
```

After that, you can switch the OCR provider to **Google Vision** from the app's Settings page. The app stores only the provider choice; the key remains in container env on the server.

## Native run without Docker

If you want to keep developing directly on your machine:

```bash
cd client
npm ci
npm run build

cd ../server
npm ci
OCR_PROVIDER=tesseract node index.js
```

Install Tesseract first on the host:

```bash
sudo apt update
sudo apt install -y tesseract-ocr tesseract-ocr-nor tesseract-ocr-eng
```

## OCR providers

- `tesseract` - fully local, default
- `google` - requires `GOOGLE_VISION_API_KEY`
- `ollama` - requires an Ollama server with a vision-capable model

Relevant environment variables:

```bash
OCR_PROVIDER=tesseract
GOOGLE_VISION_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2-vl:7b
DATA_DIR=/data
PORT=3000
```

## Data location

- **Docker**: `/data/budget.db`
- **Native run**: `server/data/budget.db`
- **Saved receipt images**: `/data/receipts/` in Docker, `server/data/receipts/` for native runs

Back up `budget.db` together with the `receipts/` directory if you want to preserve linked source receipt images.

## iPhone / PWA install

1. Open the app URL in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.

## OCR tips

- Use even lighting and keep the receipt as flat as possible.
- Norwegian receipts work best with the bundled `nor+eng` language packs.
- Imported items can always be corrected manually if OCR misses something.

## Item-to-category learning

When you categorise a transaction, the normalised item name is saved in `item_category_map`. Future imports use that rule to pre-select a category, and you can manage the rules from the **Rules** tab.
