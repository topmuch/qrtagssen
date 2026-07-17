FROM node:20-alpine

# Install required packages
RUN apk add --no-cache git libc6-compat sqlite
RUN npm install -g bun

WORKDIR /app

# Clone the repository
RUN git clone https://github.com/topmuch/qrtagssen.git .

# Install dependencies
RUN bun install

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

# Start command: init DB, start server, then create admin via API
CMD sh -c "\
  mkdir -p /app/data && \
  export DATABASE_URL=file:/app/data/qrtags.db && \
  npx prisma db push --skip-generate 2>&1 && \
  echo 'Starting server...' && \
  node .next/standalone/server.js & \
  SERVER_PID=$! && \
  echo 'Waiting for server to be ready...' && \
  for i in 1 2 3 4 5 6 7 8 9 10; do \
    sleep 2 && \
    if wget -q --spider http://localhost:3000/api/health 2>/dev/null; then \
      echo 'Server is ready!'; \
      break; \
    fi; \
    echo \"Waiting... ($i/10)\"; \
  done && \
  echo 'Initializing admin user...' && \
  wget -q -O - --header='Authorization: Bearer qrtags-init-2024' http://localhost:3000/api/init-admin 2>/dev/null || echo 'Admin init skipped' && \
  echo 'QRTags is ready!' && \
  wait $SERVER_PID \
"
