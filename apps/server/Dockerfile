# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/server/Dockerfile .
FROM node:24-slim AS web
RUN npm install --global bun
WORKDIR /app
COPY apps/mobile/ ./
RUN bun install --frozen-lockfile && bunx expo export --platform web --output-dir /web

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY apps/server/package.json apps/server/bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    MUSIC_DIR=/music \
    DATA_DIR=/data \
    WEB_DIR=/app/web
# yt-dlp downloads songs from YouTube Music and ffmpeg tags them. YouTube changes often: rebuild the image to get the latest yt-dlp.
RUN apk add --no-cache python3 ffmpeg
RUN wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && chmod 755 /usr/local/bin/yt-dlp
COPY --from=deps /app/node_modules ./node_modules
COPY --from=web /web ./web
COPY apps/server/package.json apps/server/tsconfig.json ./
COPY apps/server/src ./src
RUN mkdir -p /music /data && chown -R bun:bun /music /data
USER bun
VOLUME ["/music", "/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["bun", "src/index.ts"]
