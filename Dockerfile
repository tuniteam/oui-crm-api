# ============================================
# OUI-CRM Backend API — image de production (SPEC-20)
# Trois étages : dépendances, build (application + seed compilé), exécution.
# Aucun fichier .env dans l'image : le compose les injecte à l'exécution (env_file).
# ============================================

# -------------------------------------------------------------------------------- dépendances
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma charge son moteur musl contre OpenSSL. `bcrypt`, seul module natif de l'arbre, embarque
# un binaire musl précompilé : aucun outil de compilation n'est nécessaire.
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# -------------------------------------------------------------------------------- build
FROM deps AS builder

COPY . .

# L'application, puis le seed compilé avec les seuls fichiers de src/ qu'il utilise (dist/seed) :
# l'image finale n'embarque ni tsx ni les sources TypeScript.
RUN npx prisma generate \
    && npm run build \
    && npm run build:seed

# Les devDependencies partent ; le client Prisma est régénéré, l'élagage ne le garantit pas.
RUN npm prune --omit=dev \
    && npx prisma generate

# -------------------------------------------------------------------------------- exécution
FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nestjs

COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

USER nestjs

# DEFAULT_PORT de l'application ; le compose peut en publier un autre côté hôte.
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/api/v1/health" > /dev/null || exit 1

# Migrations, puis seed — catalogue de droits et premier administrateur, idempotent, ~1 s —, puis
# l'API. Un redémarrage rejoue les deux premières étapes sans effet.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/seed/prisma/seed.js && node dist/main.js"]
