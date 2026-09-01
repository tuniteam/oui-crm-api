# OUI-CRM — Backend (`oui-crm-api`)

CRM **générique multi-projet** pour les équipes commerciales d'éditeurs de logiciels : un
« projet » = un produit ou service à promouvoir, avec sa configuration propre (réglages,
référentiels, périmètres, grille tarifaire, gabarits). **Périscolia** est le premier projet
embarqué (seed de démonstration), pas le propriétaire de l'outil.

Pattern hérité et adapté de `soft-m-api` (`client` → `projet`, `x-client-id` → `x-project-id`).

## Stack

NestJS 11 · Prisma 6 · PostgreSQL · JWT sessions à rotation (`@nestjs/jwt`, `passport-jwt`,
`bcrypt`) · MinIO (fichiers, magic bytes) · nodemailer + Mailpit (dev) · exceljs · Swagger.
Préfixe global `api/v1`. Erreurs : `{ messages: { statusCode, code, text, level, meta? } }`.

## Démarrage local (sans Docker)

Prérequis (une seule fois) : service **PostgreSQL** local avec le rôle `ouicrm` et la base
`ouicrm_db` ; **Mailpit** lancé par ailleurs (1025/8025, partagé avec soft-m) ; `cp .env.example .env`.

```bat
scripts\dev-start.bat        REM ou : npm run dev:local
```

Le script tue les process OUI-CRM (par port — jamais ceux de soft-m), relance MinIO
(9010/9011, data séparée `C:\back\oui-crm-storage`), applique `migrate deploy` + `generate` +
`db:seed`, puis démarre Prisma Studio, l'API en watch et le front.

| Service | URL | Cohabitation soft-m |
|---|---|---|
| API | http://localhost:3001/api/v1 | (soft-m : 3000) |
| Swagger | http://localhost:3001/api/docs | |
| Prisma Studio | http://localhost:5556 | (5555) |
| MinIO console | https://localhost:9011 | (9001) |
| Mailpit | http://localhost:8025 | partagé |
| Front (`oui-crm-web`) | http://localhost:5174 | (5173) |

**L'app est up ?** → `curl http://localhost:3001/api/v1/health` → `{"status":"ok"}`.

`docker-compose.dev.yml` (db + minio + mailpit) reste disponible pour UAT/CI.

## Comptes de démo (seed — mot de passe : `SEED_PASSWORD` du `.env`)

Alias Gmail d'une boîte réelle, pour recevoir les e-mails hors Mailpit :
`email.ouicrm+superadmin@gmail.com` (backoffice) · `+admin`, `+bassem` (admins Périscolia) ·
`+wiem`, `+fred` (commerciaux, périmètres restreints) · `+camille`, `+sofia` (externes, expirent).

## Tester

```bash
npm test                            # tests unitaires (règles pures : permissions, guards, verrouillage…)
bash docs/tests/test-auth.sh        # BDD curl US-00-01/02 (rapport docs/tests/test-report-auth.txt)
bash docs/tests/test-profile.sh     # BDD curl US-00-03
bash docs/tests/test-projects.sh    # BDD curl US-00-04
bash docs/tests/test-users.sh       # BDD curl US-00-05
bash docs/tests/test-roles.sh       # BDD curl US-00-06
bash docs/tests/test-scopes.sh      # BDD curl US-00-07
bash docs/tests/test-settings.sh    # BDD curl US-00-08
bash docs/tests/test-reference-items.sh  # BDD curl US-00-09
bash docs/tests/test-audit-log.sh   # BDD curl US-00-10
npm run swagger:check               # contrat exposé
```

Les scénarios sont décrits en Gherkin (anglais) dans `docs/features/*.feature` — c'est la
recette front/QA. Helpers partagés : `docs/tests/lib.sh` (lit `.env`).

## Documentation

- **Specs** (locales, non versionnées — source de vérité de l'équipe) : `docs/SPEC-01` fonctionnelle · `02` technique ·
  `03` héritage soft-m · `04` moteur tarifaire · `05` import de reprise · `06` permissions et
  contrat `/profile/me` · `07` **user stories + handoff front** · `08` plan du lot L0 ·
  `09` manifeste de réutilisation · `10` configuration projet · `11` **handoff front détaillé par route**.
- **Skills** (`.claude/skills/`) : `spec-first` (aucun dev sans spec validée), `backend-dev`
  (conventions + workflow de fin de story : revue, tests curl, `.feature`, handoff, commit),
  `backend-module` (pattern de module + templates).
- Maquette de référence : `docs/Periscolia_OUICRM_V8.html` (démo — corrigée point par point).

## Règles clés

- Multi-projet par header **`x-project-id`** (`ProjectGuard`), jamais dans l'URL ni le body.
- Guards explicites par route : `JwtAuthGuard, ProjectGuard, PermissionsGuard` +
  `@ProjectScoped()` + `@Permissions({ code })` ; permissions en base (`prisma/seedAuth.ts`),
  corrigées par les surcharges, filtrage `ALL | PROJECT | OWN` **côté serveur**.
- Toutes les chaînes dans `src/common/messages.ts`, exceptions via `apiError.*` ; transitions
  d'état par route d'action (`POST /:id/status` + table de transitions) ; `AuditLog` dans la
  transaction des opérations sensibles ; KISS — une capacité = une route.

## État (lot L0 — socle)

Livré : socle commun + schéma + seeds · **US-00-01/02** auth (sessions, activation, reset,
changement d'e-mail) · **US-00-03** profil + légal · **US-00-04** administration des projets ·
**US-00-05/06/07** utilisateurs, rôles, périmètres (+ `ScopeService`) · **US-00-08/09** réglages,
gabarits HTML + cachet, référentiels · **US-00-10** journal d'activité (lecture paginée, filtres,
libellés résolus ; export CSV au L5).
Reste : phase I — job `accounts.expire`, Postman `error-tests`, rapport L0.
Détail : `docs/SPEC-08-PLAN-L0.md` ; contrat front par route : `docs/SPEC-11-HANDOFF-FRONT.md`.
