# ═══════════════════════════════════════════════════════════════
# QRTags - Dockerfile for Coolify Deployment
# Multi-stage build optimized for Next.js 16 standalone
# Supports both SQLite (dev) and PostgreSQL (prod)
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Dependencies ─────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy package files
COPY package.json bun.lock* package-lock.json* yarn.lock* ./
COPY prisma ./prisma/

# Install dependencies
RUN \
  if [ -f package-lock.json ]; then npm ci --ignore-scripts; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile --ignore-scripts; \
  elif [ -f bun.lock ]; then \
    npm install -g bun && bun install --frozen-lockfile --ignore-scripts; \
  else npm install --ignore-scripts; \
  fi

# Generate Prisma client
RUN npx prisma generate

# ── Stage 2: Builder ─────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Copy source code
COPY . .

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build Next.js (standalone output)
RUN npm run build

# ── Stage 3: Runner (Production) ─────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache openssl wget

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application from builder
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir -p .next && chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma for runtime migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy PostgreSQL schema as alternative
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.postgresql.prisma ./prisma/schema.postgresql.prisma

# Copy entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create data directory for SQLite with proper ownership
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
RUN mkdir -p /app/public/uploads && chown nextjs:nodejs /app/public/uploads

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Volume for persistent data (SQLite database + uploads)
VOLUME ["/app/data", "/app/public/uploads"]

# Entrypoint with auto-migration
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Start Next.js standalone server with memory optimization
# --max-old-space-size=512: Limit Node.js heap to 512MB (adjust based on your server)
CMD ["node", "--max-old-space-size=512", "server.js"]
