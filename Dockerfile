FROM node:20-alpine

# Install required packages
RUN apk add --no-cache git libc6-compat sqlite
RUN npm install -g bun

WORKDIR /app

# Copy source code (Coolify provides the repo as build context)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/qrtags.db
RUN bun run build

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL=file:/app/data/qrtags.db

# Start command: run init-db script (handles prisma db push + manual table creation + admin creation),
# then start the Next.js server.
# The app also has /api/auth/init for runtime self-healing on every login page load.
CMD ["sh", "-c", "mkdir -p /app/data && export DATABASE_URL=file:/app/data/qrtags.db && echo '[startup] Initializing database...' && node scripts/init-db.cjs && echo '[startup] Starting QRTags server...' && exec node .next/standalone/server.js"]