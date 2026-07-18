# ═══════════════════════════════════════════════════════════════
# QRTags WebSocket Service - Dockerfile
# Lightweight container for the real-time tracking WebSocket
# ═══════════════════════════════════════════════════════════════

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3005

# Create non-root user
RUN addgroup --system --gid 1001 wsjs && \
    adduser --system --uid 1001 wsuser

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY index.ts ./

# Install tsx for running TypeScript directly
RUN npm install -g tsx

USER wsuser

EXPOSE 3005

# Simple health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3005/health || exit 1

CMD ["npx", "tsx", "index.ts"]
