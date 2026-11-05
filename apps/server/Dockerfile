# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine
# Playlist imports: yt-dlp (with curl_cffi for SoundCloud/YouTube impersonation), ffmpeg for tagging, deno as
# yt-dlp's JavaScript runtime for YouTube. The venv belongs to the app user so it can upgrade yt-dlp itself.
RUN apk add --no-cache python3 ffmpeg deno ca-certificates \
 && python3 -m venv /opt/ytdlp \
 && /opt/ytdlp/bin/pip install --no-cache-dir "yt-dlp[default,curl-cffi]" \
 && ln -s /opt/ytdlp/bin/yt-dlp /usr/local/bin/yt-dlp \
 && chown -R bun:bun /opt/ytdlp
WORKDIR /app
ENV NODE_ENV=production \
    YTDLP_PIP=/opt/ytdlp/bin/pip \
    PORT=8787 \
    MUSIC_DIR=/music \
    DATA_DIR=/data
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN mkdir -p /music /data && chown -R bun:bun /music /data
USER bun
VOLUME ["/music", "/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["bun", "src/index.ts"]
