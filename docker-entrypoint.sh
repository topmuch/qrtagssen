#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# QRTags - Docker Entrypoint
# Runs database migrations and starts the server
# Supports: SQLite (default) and PostgreSQL (production)
# ═══════════════════════════════════════════════════════════════

set -e

echo ""
echo "🚀 QRTags - Démarrage du conteneur..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Detect Database Type ──────────────────────────────────────
DB_PROVIDER="sqlite"
if echo "${DATABASE_URL}" | grep -q "^postgresql"; then
  DB_PROVIDER="postgresql"
  echo "🐘 Base de données détectée: PostgreSQL"
elif echo "${DATABASE_URL}" | grep -q "^mysql"; then
  DB_PROVIDER="mysql"
  echo "🐬 Base de données détectée: MySQL"
else
  echo "📦 Base de données détectée: SQLite"
fi

# ── PostgreSQL: Switch Schema ─────────────────────────────────
if [ "$DB_PROVIDER" = "postgresql" ]; then
  echo "🔄 Basculement vers le schema PostgreSQL..."
  if [ -f /app/prisma/schema.postgresql.prisma ]; then
    cp /app/prisma/schema.postgresql.prisma /app/prisma/schema.prisma
    npx prisma generate 2>&1 || echo "⚠️  Prisma generate failed, continuing..."
    echo "✅ Schema PostgreSQL activé"
  else
    echo "⚠️  schema.postgresql.prisma non trouvé, utilisation du schema par défaut"
  fi
fi

# ── SQLite: Set Default DATABASE_URL ──────────────────────────
if [ "$DB_PROVIDER" = "sqlite" ]; then
  if [ -z "${DATABASE_URL}" ]; then
    export DATABASE_URL="file:/app/data/qrtags.db"
  fi
  # Ensure data directory exists
  mkdir -p /app/data
  echo "📦 SQLite database: ${DATABASE_URL}"
fi

# ── Wait for External Database ────────────────────────────────
if [ "$DB_PROVIDER" != "sqlite" ]; then
  echo "⏳ Attente de la base de données..."
  MAX_RETRIES=30
  RETRY_COUNT=0
  
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if npx prisma db pull --print 2>/dev/null; then
      echo "✅ Base de données accessible"
      break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Tentative $RETRY_COUNT/$MAX_RETRIES..."
    sleep 2
  done
  
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Impossible de se connecter à la base de données après $MAX_RETRIES tentatives"
    exit 1
  fi
fi

# ── Run Prisma Migrations ─────────────────────────────────────
echo ""
echo "🔄 Synchronisation du schéma de base de données..."

if [ "$DB_PROVIDER" = "postgresql" ] || [ "$DB_PROVIDER" = "mysql" ]; then
  # Use migrate deploy for production databases
  npx prisma migrate deploy 2>&1 || {
    echo "⚠️  Migrate deploy failed, trying db push..."
    npx prisma db push --skip-generate 2>&1 || {
      echo "❌ Database sync failed after retry"
      exit 1
    }
  }
else
  # Use db push for SQLite
  npx prisma db push --skip-generate 2>&1 || {
    echo "⚠️  Database push failed, retrying in 5s..."
    sleep 5
    npx prisma db push --skip-generate 2>&1 || {
      echo "❌ Database push failed after retry"
      exit 1
    }
  }
fi

echo "✅ Schéma de base de données à jour"

# ── Seed Check (First Run) ────────────────────────────────────
SEED_MARKER="/app/data/.seeded"
if [ ! -f "$SEED_MARKER" ]; then
  echo ""
  echo "🌱 Première exécution détectée - Initialisation des données..."
  echo "   ℹ️  Visitez /api/init-demo après le démarrage pour initialiser les données de démo"
  touch "$SEED_MARKER"
  echo "✅ Marqueur d'initialisation créé"
fi

# ── Environment Summary ───────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌍 Environnement: ${NODE_ENV:-development}"
echo "🔌 Port: ${PORT:-3000}"
echo "📦 Base de données: ${DB_PROVIDER} (${DATABASE_URL})"
echo "🔗 URL publique: ${NEXT_PUBLIC_BASE_URL:-non configurée}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Start Application ─────────────────────────────────────────
echo "🎯 Démarrage du serveur QRTags..."
echo ""
exec "$@"
