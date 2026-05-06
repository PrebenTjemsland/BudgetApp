FROM node:20-bookworm-slim AS client-build

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM node:20-bookworm-slim AS server-deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

FROM node:20-bookworm-slim

ARG VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="BudgetApp" \
      org.opencontainers.image.description="Self-hosted budget tracker with OCR-enabled receipt imports." \
      org.opencontainers.image.source="https://github.com/PrebenTjemsland/BudgetApp" \
      org.opencontainers.image.url="https://github.com/PrebenTjemsland/BudgetApp" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}"

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    OCR_PROVIDER=tesseract \
    APP_VERSION=${VERSION} \
    APP_REVISION=${VCS_REF} \
    APP_BUILD_DATE=${BUILD_DATE}

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-nor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=server-deps /app/server ./server
COPY --from=client-build /app/client/dist ./client/dist

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/budgets').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
