# 🏛️ oui-crm - Backend



## 📁 Structure du Projet

```
oui-crm/
├── src/
│   ├── prisma/
│   ├── app.module.ts
│   └── main.ts
├── prisma/
│   └── schema.prisma
├── docs/                           # Documentation sessions
├── docker-compose.yml              # Orchestration des services
├── Dockerfile                      # Image production (multi-stage)
├── Dockerfile.dev                  # Image développement (hot-reload)
├── package.json
└── README.md
```

## 🚀 Démarrage Rapide

### Prérequis

- Docker et Docker Compose
- (Optionnel) Node.js 22+ pour le développement local

### Option 1 : Tout avec Docker (Recommandé)

```bash
# 1. Configurer l'environnement
cp .env.example .env

# 2. Lancer l'API + DB
docker-compose up -d

# 3. Appliquer les migrations (première fois)
docker-compose exec api npx prisma migrate deploy

# 4. (Optionnel) Lancer Prisma Studio
docker-compose --profile tools up -d
```

### Option 2 : Développement local (Node.js)

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer uniquement la DB
docker-compose up -d db

# 3. Configurer l'environnement
cp .env.example .env

# 4. Générer le client Prisma
npm run db:generate

# 5. Créer les tables
npm run db:migrate

# 6. Lancer le serveur (hot-reload)
npm run start:dev
```

### Commandes Docker utiles

```bash
docker-compose up -d              # Démarrer API + DB
docker-compose up -d db           # Démarrer DB seulement
docker-compose --profile tools up -d  # Avec Prisma Studio
docker-compose down               # Arrêter les services
docker-compose down -v            # Reset complet (supprime les données)
docker-compose logs -f api        # Voir les logs de l'API
```

### Scripts NPM Recommandés

```bash
# 🚀 Workflow de développement (Build + Test + Docker + Swagger)
npm run dev:workflow              # Workflow complet recommandé

# 🐳 Rebuild Docker
npm run docker:rebuild            # Rebuild complet (--no-cache)
npm run docker:rebuild:fast       # Rebuild rapide (avec cache)

# ✅ Vérification
npm run verify                    # Build + Test + Docker Fast
npm run swagger:check             # Vérifier Swagger JSON

# 📋 Logs
npm run docker:logs               # Voir les logs en temps réel
```

> 📚 **Documentation complète** : [docs/SWAGGER-WORKFLOW.md](docs/SWAGGER-WORKFLOW.md)

### Tests Postman (Erreurs API)

```bash
# Lancer les tests d'erreur avec Newman
npx newman run postman/error-tests.postman_collection.json -e postman/local.postman_environment.json
```

La collection teste le format d'erreur standardisé `{ messages: { statusCode, code, text, level } }`.

### URLs

| Service       | URL                            |
| ------------- | ------------------------------ |
| API           | http://localhost:3000/api/v1   |
| Swagger       | http://localhost:3000/api/docs |
| Prisma Studio | http://localhost:5555          |

## 📡 Endpoints API
