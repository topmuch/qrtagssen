# 🚀 QRTags - Guide de Déploiement Coolify

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Coolify Server                  │
│                                                  │
│  ┌──────────────┐    ┌─────────────────────┐    │
│  │   Caddy/      │    │   QRTags App         │    │
│  │   Traefik     │───▶│   Next.js :3000      │    │
│  │   (Reverse    │    │   (Standalone)        │    │
│  │    Proxy)     │    └──────────┬──────────┘    │
│  │               │               │               │
│  │               │    ┌──────────▼──────────┐    │
│  │               │    │   WebSocket          │    │
│  │               │    │   Socket.io :3005     │    │
│  │               │    └──────────┬──────────┘    │
│  │               │               │               │
│  │               │    ┌──────────▼──────────┐    │
│  │               │    │   SQLite Volume      │    │
│  │               │    │   /app/data/         │    │
│  │               │    └─────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## Méthode 1 : Docker Compose (Recommandé)

### Étape 1 : Préparer le dépôt
```bash
# Pousser le code sur GitHub/GitLab
git add .
git commit -m "Prepare for Coolify deployment"
git push origin main
```

### Étape 2 : Créer la ressource dans Coolify
1. Dans le dashboard Coolify → **New Resource** → **Docker Compose**
2. **Source** : Choisir votre repo GitHub/GitLab
3. **Compose File** : `docker-compose.yml` (détecté automatiquement)

### Étape 3 : Configurer les variables d'environnement
Dans l'onglet **Environment** de Coolify, ajouter :

```env
NEXTAUTH_SECRET=votre-cle-secrete-generree-32caracteres
NEXTAUTH_URL=https://votre-domaine.com
NEXT_PUBLIC_BASE_URL=https://votre-domaine.com
DATABASE_URL=file:/app/data/qrtags.db
ENCRYPTION_KEY=votre-cle-encryption-16chars
```

### Étape 4 : Déployer
Cliquer sur **Deploy** → Coolify va :
1. Build les images Docker
2. Lancer les conteneurs
3. Configurer le reverse proxy automatiquement

---

## Méthode 2 : Dockerfile Simple

### Étape 1 : Créer la ressource
1. **New Resource** → **Docker**
2. Sélectionner votre repo

### Étape 2 : Configuration
- **Dockerfile** : `Dockerfile`
- **Port** : `3000`
- **Volume** : `/app/data` (pour la persistance SQLite)

### Étape 3 : Variables d'environnement
Même configuration que la Méthode 1.

---

## Méthode 3 : PostgreSQL en Production

Pour une meilleure performance en production, utiliser PostgreSQL :

### Modifier le schema Prisma
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### Ajouter PostgreSQL dans docker-compose.yml
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: qrtags
      POSTGRES_USER: qrtags
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - qrtags-pgdata:/var/lib/postgresql/data
    networks:
      - qrtags-network

  app:
    environment:
      - DATABASE_URL=postgresql://qrtags:${POSTGRES_PASSWORD}@postgres:5432/qrtags?schema=public
    depends_on:
      - postgres

volumes:
  qrtags-pgdata:
```

---

## Vérification Post-Déploiement

### 1. Vérifier la santé de l'application
```bash
curl https://votre-domaine.com/api/health
```

Réponse attendue :
```json
{
  "status": "healthy",
  "service": "QRTags",
  "version": "0.2.0",
  "database": "connected"
}
```

### 2. Initialiser les données
Visiter : `https://votre-domaine.com/api/init-demo`

### 3. Comptes par défaut
- **SuperAdmin** : admin@qrtags.com / admin123
- **Agence** : agence@hotel-demo.com / agence123

---

## Variables d'Environnement Complètes

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `NEXTAUTH_SECRET` | ✅ | Clé secrète NextAuth (32+ caractères) |
| `NEXTAUTH_URL` | ✅ | URL publique de l'application |
| `NEXT_PUBLIC_BASE_URL` | ✅ | URL publique (côté client) |
| `DATABASE_URL` | ✅ | URL de connexion base de données |
| `ENCRYPTION_KEY` | ✅ | Clé de chiffrement |
| `NODE_ENV` | ❌ | Environment (production par défaut) |
| `PORT` | ❌ | Port interne (3000 par défaut) |
| `WAKIT_API_KEY` | ❌ | Clé API WhatsApp |
| `GROQ_API_KEY` | ❌ | Clé API Groq AI |
| `GROQ_AI_ENABLED` | ❌ | Activer l'IA (false par défaut) |

---

## Dépannage

### Logs en temps réel
```bash
# Dans Coolify → Logs
# Ou via Docker
docker compose logs -f app
```

### Base de données corrompue
```bash
# Supprimer et recréer la base
docker compose exec app npx prisma db push --force-reset
```

### Problème de permissions
```bash
# Vérifier les permissions du volume
docker compose exec app ls -la /app/data/
```

### Redémarrage complet
```bash
docker compose down
docker compose up -d --build
```

---

## Checklist de Production

- [ ] `NEXTAUTH_SECRET` généré aléatoirement (pas la valeur par défaut)
- [ ] `NEXTAUTH_URL` pointe vers votre domaine HTTPS
- [ ] `NEXT_PUBLIC_BASE_URL` pointe vers votre domaine HTTPS
- [ ] Volume persistant configuré pour `/app/data`
- [ ] HTTPS activé dans Coolify
- [ ] Backup automatique configuré pour la base SQLite
- [ ] `/api/health` répond "healthy"
- [ ] Données initiales semées via `/api/init-demo`
- [ ] Changement des mots de passe par défaut
