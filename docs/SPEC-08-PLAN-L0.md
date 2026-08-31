# OUI-CRM — Lot L0 « Socle » : revue et plan de développement

> Revue du 31/08/2026 du périmètre L0 (SPEC-02 §7, SPEC-03 §2, SPEC-06, SPEC-07 US-00-01 → 10)
> et plan d'exécution. Aucun code n'est écrit avant validation de ce plan (`spec-first`).
> Chaque phase se termine par les 7 étapes du workflow de fin de dev (`backend-dev`).

---

## 1. Revue du périmètre L0

### 1.1 Ce que L0 doit livrer (consolidé)

| Bloc | Contenu | Stories |
|---|---|---|
| Environnement | Docker dev : PostgreSQL, **MinIO**, **Mailpit** ; `.env.example` complet | — |
| Schéma | **Toutes** les tables (L0 → L6) dans une migration initiale ; enums ; index ; `pg_trgm` | — |
| Seed | `seedAuth.ts` (63 permissions, 8 rôles, matrice) ; seed dev : projet Périscolia, 6 utilisateurs, périmètres, référentiels, grille V8 v1, image de cachet, jeu de démo V8 (les gabarits HTML arrivent au L2) | US-00-04/05/06/07 |
| Auth | Sessions à version, login / refresh / logout, activation, reset, changement d'email, verrouillage, CGU/RGPD | US-00-01, 02 |
| Guards | `JwtAuthGuard`, `ProjectGuard` (`x-project-id`), `PermissionsGuard` (+ overrides, `scopeFilter`), `RequiresFeatureGuard` | toutes |
| Profil | `GET /profile/me`, `PATCH /profile`, mot de passe, avatar | US-00-03 |
| Projets | CRUD backoffice, modules, **bootstrap** d'un projet (settings, référentiels, grille, gabarits) | US-00-04 |
| Accès | Utilisateurs (création → activation), rôles et permissions, périmètres + `ScopeService`, surcharges | US-00-05/06/07 |
| Paramétrage | `Settings`, gabarits HTML versionnés + image de cachet, `ReferenceItem` | US-00-08/09 |
| Audit | `AuditLog` service + lecture + export | US-00-10 |
| Infra | `StorageService` + `File`, `MailService` + `EmailLogService`, `JobsService`, `HealthController` | — |
| Qualité | Postman error-tests, Swagger vérifié, `*.spec.ts` guards / scope / overrides, `.feature` par story | — |

### 1.2 Écarts trouvés dans les specs (à corriger avant de coder)

| # | Constat | Correction proposée |
|---|---|---|
| R1 | `UserScope (userId, projectId, scopeId)` est une table séparée alors que `UserRoleProject` porte déjà le couple `(userId, projectId)` | **Supprimer `UserScope`**, ajouter `scopeId?` sur `UserRoleProject`. Une affectation = un rôle + un périmètre |
| R2 | `Role.code` est unique global, mais un projet peut dupliquer un rôle système avec le même code | Unicité **`(projectId, code)`** ; les rôles système ont `projectId = null` |
| R3 | `GET /auth/me` subsiste dans les templates de script curl (`login()` ok, mais US-00-03 renvoie vers `/profile/me`) | Vérifié : plus d'occurrence. RAS |
| R4 | SPEC-02 §1.2 liste `tenants/` renommé `projects/` mais la NestJS `ProjectsModule` (module) et la table `ProjectFeature` (feature flags) se ressemblent | Table renommée **`ProjectFeature`** (`FeatureCode` → `FeatureCode`), décorateur `@RequiresFeature()`. Évite la collision avec les modules NestJS |
| R5 | La grille tarifaire V8 est nécessaire dès le seed (bootstrap projet) mais le module `pricing` est en L2 | L0 crée la **table** `PricingGrid` et seed le **contenu** V8 (données) ; le moteur et les routes restent en L2 |
| R6 | US-00-04 : le bootstrap d'un projet (settings, référentiels, grille, gabarits) n'est décrit nulle part comme service | Ajouter `ProjectBootstrapService` (transaction) appelé par `POST /projects` et par le seed |
| R7 | `initials` (VarChar 3) sert à numéroter les devis : deux utilisateurs d'un projet avec les mêmes initiales produiraient des collisions | Unicité **`(projectId, initials)`** via `UserRoleProject.initials` (les initiales sont par projet, pas par utilisateur) — ou refus à la création. Proposé : sur `UserRoleProject` |
| R8 | Constantes légales (`cguVersion`, `rgpdVersion`) : origine soft-m `common/legal/legal.constants.ts` — non listée dans SPEC-03 | Copier `common/legal/` ; versions initiales `1` |
| R9 | `docker-compose.dev.yml` n'a ni MinIO ni Mailpit | Ajouter les deux services + volumes ; `docker-compose.uat/prod` : MinIO externe, SMTP réel |

Les corrections R1, R2, R4, R6, R7 ont été **validées et appliquées** le 31/08/2026 dans SPEC-02 §2
et SPEC-06 §1/§7.

---

## 2. Plan de développement (ordre validé le 31/08/2026)

Décision : **copier et compiler le socle soft-m d'abord**, avec un **schéma Prisma minimal L0**
complété lot par lot (une migration par lot) plutôt qu'un schéma complet en une fois. Les
fichiers « copiés de soft-m » suivent le manifeste SPEC-09 — pris tels quels puis adaptés
(`client` → `project`), pas réécrits. Une phase = un build vert, un script curl, un `.feature`,
une revue du diff.

### Phase A — Socle commun et infrastructure (1 j) — copie soft-m, sans base de données

- `common/` : `messages.ts` (structure + codes SPEC-09 §4), `legal/`, helpers, pipes, décorateurs ;
  suppression des décorateurs `is-year-code-*`, `is-date-within-year-code-range` du scaffold.
- `storage/` + `files/` (constantes CRM, MIME `text/html`), `mail/` (activation, reset,
  email-change, `EmailLogService`), `jobs/`, `health/`, `main.ts` (helmet, CORS, rate-limit).
- `.prettierrc`, `.env.example` complet.
- **Fin** : `npm run build` vert avec un `app.module.ts` n'important que `Prisma`, `Health`,
  `Storage`, `Mail`, `Jobs` ; le client Prisma généré depuis le schéma minimal de la phase B
  (les modules `storage`/`mail` référencent `File`, `EmailLog`) — les phases A et B se
  terminent donc ensemble par le premier build.

### Phase B — Schéma minimal L0, environnement, migration initiale, seedAuth (1 j)

- **Local sans Docker** (poste de dev, décision du 31/08/2026) : `scripts/dev-start.bat`
  (`npm run dev:local`) — PostgreSQL 18 en service local, MinIO de `C:/back/soft-m-storage` lancé
  sur **9010/9011** avec un data dir séparé (`C:/back/oui-crm-storage`), Mailpit partagé ; rôle et
  base créés une seule fois par `scripts/db-init.sql` (mot de passe `postgres` demandé) ; API sur
  **3001**, Studio **5556**, front **5174** pour cohabiter avec soft-m. `docker-compose.dev.yml`
  (`db`, `minio`, `mailpit`) reste disponible pour UAT/CI.
- `prisma/schema.prisma` **L0 uniquement** : `Project`, `ProjectFeature`, `User`, `Session`,
  `ActivationToken`, `PasswordResetToken`, `EmailChangeToken`, `Role`, `Permission`,
  `RolePermission`, `UserRoleProject` (avec `scopeId`, `initials`, `expiresAt`),
  `UserPermissionOverride`, `Scope`, `Settings`, `ReferenceItem`, `AuditLog`, `File`,
  `EmailLog`, `DocumentNumberSequence`, `PricingGrid` (table seule, R5) ; enums associés ;
  conventions SPEC-03 §2.3 ; `pg_trgm` activé dès maintenant.
- Migration `<horodatage>_l0_core` ; les lots suivants ajoutent `_l1_sales_base`, `_l2_quotes`…
- `prisma/seedAuth.ts` (SPEC-06 §3-4), `runSeed.ts`.
- **Fin** : `migrate dev` + `db:seed` passent ; `GET /health` répond ; upload MinIO testé.

### Phase C — Authentification et guards (2 j) — copie soft-m

Contenu inchangé (ex-phase 3) : `auth/` complet avec corrections T2/T3/T4 de SPEC-09,
`JwtAuthGuard`, `ProjectGuard`, `PermissionsGuard` (+ overrides, `scopeFilter`),
`RequiresFeatureGuard`, décorateurs, `AuthenticatedUser.relations[]` enrichi, tests des guards.
Stories **US-00-01, US-00-02**.

### Phase D — Projets et bootstrap (1 j)

Ex-phase 4 : `projects/` (CRUD backoffice, features, `ProjectBootstrapService` +
`DEFAULT_PROJECT_CONFIG`, `copyFromProjectId`, `config-export` — SPEC-10), seed dev du projet
Périscolia (bootstrap + profil `PROJECT_CONFIG` interne sur l'onglet ⚙️ Paramètres).
Story **US-00-04**.

### Phase E — Profil (½ j)

Ex-phase 5 : `profile/` (`GET /profile/me` SPEC-06 §6), `legal/`. Story **US-00-03**.

### Phase F — Périmètres, rôles, utilisateurs (2 j)

Ex-phase 6 : `scopes/` + `ScopeService` + tests, `roles/`, `users/` (base backoffice +
rattachement multi-projet + overrides + activation). Stories **US-00-05, 06, 07**.

### Phase G — Réglages, gabarits, référentiels (1 j)

Ex-phase 7 : `settings/` (dont `stageProbabilities`, gabarits HTML `HTML_TEMPLATE`, image de
cachet `SIGNATURE_IMAGE`), `reference-items/`. Stories **US-00-08, 09**.

### Phase H — Journal (½ j)

Ex-phase 8 : `audit-log/`. Story **US-00-10**.

### Phase I — Jobs et qualité transverse (½ j)

Ex-phase 9 : job `accounts.expire`, Postman `error-tests`, Swagger, réunion des `.feature`,
rapport L0, handoff front L0.

### Récapitulatif

| Phase | Contenu | Durée | Dépend de |
|---|---|---|---|
| A | Common, storage, files, mail, jobs, health, `main.ts` — copie | 1 j | — |
| B | Schéma minimal L0, Docker, migration, `seedAuth` | 1 j | A (build commun) |
| C | Auth, sessions, guards, décorateurs, tests | 2 j | B |
| D | Projets, features, bootstrap, seed Périscolia | 1 j | C |
| E | Profil `/me`, légal | ½ j | D |
| F | Périmètres + `ScopeService`, rôles, utilisateurs, overrides | 2 j | E |
| G | Réglages, gabarits, référentiels | 1 j | F |
| H | Journal | ½ j | G |
| I | Job d'expiration, Postman, Swagger, rapport, handoff | ½ j | H |
| **Total** | | **≈ 10 j** | |

Le manifeste de copie fichier par fichier (action, couplages à retirer, bugs soft-m à corriger) est
dans [SPEC-09-REUTILISATION-SOFT-M.md](SPEC-09-REUTILISATION-SOFT-M.md).

---

## 3. Definition of done du lot

- Les 10 stories US-00 passent leurs scripts curl (happy path + tous les codes d'erreur
  documentés) ; rapports sans `FAIL` ; `.feature` partagés.
- `npm test` : guards, stratégie JWT, `ScopeService`, overrides — verts.
- `node postman/run-tests.js` vert ; Swagger complet.
- Revue totale du diff (pattern, doublons, hard-code) consignée, sans constat ouvert.
- Un utilisateur non backoffice ne peut atteindre **aucune** donnée d'un autre projet (test
  explicite dans le `.feature` de US-00-03 : `x-project-id` d'un projet non affecté → 403).
- Handoff front L0 livré.

---

## 4. Validations (31/08/2026)

1. Corrections R1, R2, R4, R6, R7 — **validées**, appliquées dans SPEC-02/06.
2. Les trois lectures de la matrice V8 (SPEC-06 §4) — **validées** telles quelles.
3. Découpage — **validé** avec un ordre révisé : copie du socle soft-m d'abord (phase A), schéma
   minimal L0 complété lot par lot (phase B), puis auth (C) et la suite (§2).

Après validation : phase 0, puis phase 1 en commençant — comme le skill l'exige — par te
proposer le schéma Prisma en texte avant de l'écrire.
