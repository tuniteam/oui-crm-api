# OUI-CRM — Héritage du pattern `soft-m-api`

> Revue du 31/08/2026 de `C:/back/soft-m-api` (NestJS 11, Prisma 6, 73 migrations, ~45 modules).
> Objectif : reprendre les briques et conventions éprouvées plutôt que les réinventer.
> **Documents liés** : [SPEC-02-TECHNIQUE.md](SPEC-02-TECHNIQUE.md) (amendé par ce document),
> skills `backend-dev` et `backend-module`.

---

## 1. Ce que la revue change dans SPEC-02

Trois choix de la spec initiale divergeaient du pattern de l'équipe. Ils sont **remplacés** :

| Sujet | SPEC-02 initiale | Pattern soft-m retenu | Pourquoi |
|---|---|---|---|
| Droits | Matrice JSON sur `Role` (`droits`, `droitsSensibles`) + surcharges JSON sur l'utilisateur | Tables `Permission` / `RolePermission(scope)` + `UserPermissionOverride` ; les « droits sensibles » sont des permissions comme les autres (`quotes:validate`, `pricing:update`, `data:export`) | Requêtable, seedable, un seul concept au lieu de trois ; l'écran « matrice » de la maquette se rend depuis ces tables |
| Projet (ex-tenant) | `projectId` porté par le JWT | Header `x-project-id` + `@ProjectScoped()` + `ProjectGuard` ; `UserRoleProject` (un utilisateur peut avoir un rôle dans plusieurs projets, rôle *backoffice* avec `projectId = null`) | OUI-CRM est une plateforme multi-éditeurs (Périscolia = premier projet) : un `SUPER_ADMIN` backoffice, opérateur de la plateforme, doit administrer tous les projets ; même mécanisme que soft-m, même guard, même header côté front |
| Garde JWT | Globale (`APP_GUARD`) + `@Public()` | Explicite par route : `@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)` | Lisible route par route, pas de route ouverte par oubli d'un décorateur inversé |

SPEC-02 a été réécrit le 31/08/2026 pour intégrer ces choix ; ce document reste la référence
détaillée de chaque brique reprise.

---

## 2. Briques reprises telles quelles

Ces modules sont **copiés puis adaptés** (renommage `client` → `projet`), pas réécrits.

### 2.1 Auth et sessions (`src/auth/`)

- **`Session`** : `refreshToken` (hash bcrypt), `expiresAt`, `version`. Le JWT porte
  `{ userId, sessionId, version }`. `JwtStrategy.validate` recharge la session à chaque requête :
  version différente ou session expirée → 401. Le refresh **incrémente `version`** et invalide
  immédiatement les anciens access tokens. Le logout supprime la session.
- **Cinq `JwtService` nommés** (`JWT_ACCESS_SERVICE`, `JWT_REFRESH_SERVICE`,
  `JWT_ACTIVATION_SERVICE`, `JWT_PASSWORD_RESET_SERVICE`, `JWT_EMAIL_CHANGE_SERVICE`), secret et
  TTL par variable d'environnement, durées en `ms`.
- **Verrouillage** : `failedLoginAttempts`, `lockedUntil` (`MAX_LOGIN_ATTEMPTS`,
  `LOCKOUT_DURATION_MINUTES`). `bcrypt` avec `BCRYPT_ROUNDS`.
- **Cycle de vie du compte** : `UserStatus` `PENDING → ACTIVE → INACTIVE` ; création par un
  admin → email d'activation (token JWT + `ActivationToken` en base, chiffré `cryptr`) →
  l'utilisateur choisit son mot de passe et **accepte CGU/RGPD** (`cguVersion`, `rgpdVersion`,
  `*AcceptedAt` estampillés dans la même transaction). Réinitialisation de mot de passe et
  changement d'email suivent le même schéma token + service dédié.
- `JwtAuthGuard` distingue `TOKEN_EXPIRED` de `UNAUTHORIZED`.
- Pour le CRM : ajouter `expiresAt` sur `UserRoleProject` pour les comptes externes (formateurs)
  — vérifié par `ProjectGuard`.

### 2.2 Permissions et scope

```
Permission(code 'module:action', label)
RolePermission(roleId, permissionId, scope: ALL | PROJECT | OWN)
Role(code, label, isBackoffice)
UserRoleProject(userId, roleId, projectId?, status, displayOrder, expiresAt?)
UserPermissionOverride(userId, projectId, permissionId, granted: bool)   ← spécifique CRM
```

- `PermissionsGuard` lit `@Permissions({ code })`, trouve la permission dans les relations de
  l'utilisateur pour le projet courant, et dépose `req.scopeFilter[code]` (`buildScopeWhere`).
- **`ScopeType` du CRM** : `ALL` (backoffice), `PROJECT` (tout le projet — direction commerciale),
  `OWN` (ses propres objets — commercial sans `sales:viewOthersAmounts`). Le **périmètre
  géographique** (régions, départements, portefeuille) reste un objet à part (`Scope` de SPEC-02
  §4.4) résolu par `ScopeService` et combiné au `scopeFilter` dans le `where`.
- Surcharges individuelles : `UserPermissionOverride.granted = false` retire, `true` ajoute.
  Ordre d'évaluation inchangé : **retrait > ajout > rôle**.
- Seed : `prisma/seedAuth.ts` — `permissionsData[]`, `rolesData[]`, `rolePermMapping[]` ;
  `permission.deleteMany` puis `createMany`, `role.upsert`, mapping recréé.
- Catalogue de permissions du CRM (première version — la matrice complète rôles × permissions × scopes est dans **SPEC-06**) :

| Domaine | Codes |
|---|---|
| organizations | `read`, `create`, `update`, `delete`, `export`, `import`, `bulk` |
| contacts, activities, campaigns, opportunities | `read`, `create`, `update`, `delete` |
| quotes | `read`, `create`, `update`, `delete`, `submit`, `validate`, `sign`, `discountAboveCap` |
| contracts | `read`, `update` |
| invoices | `read`, `create`, `update`, `chorus` |
| deployments, trainings, tickets | `read`, `create`, `update`, `delete` |
| pricing | `read`, `update` |
| sales | `viewOthersAmounts` |
| stats | `read` · dashboard `read` |
| settings | `read`, `update` · users `read/create/update/delete` · roles `read/update` · scopes `read/update` |
| auditLog | `read`, `export` |
| data | `export`, `restore`, `purge` |

### 2.3 Schéma Prisma — conventions de nommage

```prisma
model Organization {
  id        String  @id @default(cuid())
  projectId  String  @map("project_id")
  siret     String? @db.VarChar(14)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, siret])
  @@index([projectId, salesStatus])
  @@map("organizations")
}
```

- `@default(cuid())`, colonnes `@map("snake_case")`, tables `@@map("plural_snake")`,
  `@db.VarChar(n)` sur les chaînes bornées, sections commentées (`// Identification`, `// Status`).
- Migrations `YYYYMMDDHHMMSS_snake_case` ; `DROP CONSTRAINT` toujours accompagné de
  `DROP INDEX IF EXISTS`.

### 2.4 Journal (`AuditLog`)

`userId?`, `action` (VarChar 45), `objectType?` (30), `objectId?`, `ip`, `userAgent`,
`metadata Json?`, `createdAt`. Index `(userId)`, `(action)`, `(objectType, objectId)`.
Pour le CRM : ajouter `projectId` indexé. Remplace le modèle `Journal` de SPEC-02.

### 2.5 Numérotation (`InvoiceNumberSequence`)

`(clientId, sequenceType, generationDate) → lastNumber`. Un seul `update { increment: n }`
puis calcul en mémoire des `n` numéros — jamais un incrément par ligne.
Pour le CRM : `DocumentNumberSequence(projectId, type: QUOTE | INVOICE, periodKey, lastNumber)`
avec `periodKey` = jour (devis, séquence quotidienne) ou année (factures).

### 2.6 Emails (`src/mail/`)

- `MailService` : `nodemailer`, `EMAIL_SENDING_ENABLED`, sélecteur `SMTP_PROVIDER=mailpit|gmail`
  en local, gabarits HTML en TypeScript (`templates/*.template.ts`) avec constantes de copy
  (`constants/*.constants.ts`) et charte Périscolia (`docs/charte-graphique.html`).
- `EmailLogService.queueAndDispatch(entries, send)` : lignes `EmailLog` en `PENDING`, envoi en
  arrière-plan limité par `p-limit` (`MAIL_SMTP_CONCURRENCY = 5`), issue `SENT | FAILED` avec
  `attempts` et `errorMessage`. **Tout email métier passe par là** (relances de devis, campagnes,
  notifications de validation).

### 2.7 Stockage (`src/storage/`, `src/files/`)

- `StorageService` (MinIO) : `putObject({ context, buffer, originalFileName, declaredMimeType })`
  avec validation par **magic bytes** (`file-type`), taille max, chemin d'objet scopé par projet
  (`buildObjectPath`), SSE optionnel, URL présignée (`MINIO_PRESIGNED_GET_TTL`).
- Modèle `File` : `ownerType`, `ownerId`, `category`, `filePath` unique, `mimeType`, `uploadedBy`.
- Pour le CRM : `FileCategory` = `HTML_TEMPLATE`, `SIGNATURE_IMAGE`, `QUOTE_PDF`, `CONTRACT_PDF`,
  `SIGNED_RETURN`, `IMPORT_SOURCE`, `EXPORT_REPORT`. Les gabarits HTML versionnés (SPEC-02 §5.3)
  sont des `File` de catégorie `HTML_TEMPLATE` — pas de modèle de gabarit à part.

### 2.8 Jobs (`src/jobs/`)

`JobsService` : façade minimale sur pg-boss (`createJob(queue, data)`, `getJobById`). Les
workers vivent dans le module métier concerné. Queues du CRM : `invoices.schedule`,
`invoices.overdue`, `quotes.expire`, `contracts.renewalAlerts`, `prospects.wakeUp`,
`accounts.expire`, `mail.dispatch`, `exports.run`.

### 2.9 Appels externes (`src/insee-api/`)

`axios` avec `timeout`, erreurs mappées vers des codes dédiés (`SIRET_NOT_FOUND`,
`INSEE_API_TIMEOUT`, `INSEE_API_UNAVAILABLE`), conversion Lambert → WGS84 (`proj4`) pour
géolocaliser. Pour le CRM : `EnterpriseSearchService` sur `recherche-entreprises.api.gouv.fr`
(recherche par nom **ou** SIRET, pas seulement SIRET), timeout 8 s, jamais bloquant.
Réutiliser `insee.utils.ts` (`buildAddress`, `lambertToWgs84`) pour la carte Leaflet du front.

### 2.10 Exports (`src/exports/`, `docs/exports-framework-spec.md`)

Architecture en trois couches : **A** livraison (`sendFileAttachment`, encodage, ZIP/CSV/XLSX),
**B** registre déclaratif d'exports (clé, permission `exports:<domaine>`, DTO, `fetch`,
`validate`, `generate`, mode `sync | async | auto`), **C** exécution asynchrone pg-boss +
persistance MinIO + historique. `exceljs` pour XLSX, `@react-pdf/renderer` pour PDF.
Pour le CRM : `organizations-list` (CSV/XLSX), `audit-log` (CSV), `backup` (JSON) — chacun un
descripteur, chacun journalisé avec le volume exporté.

### 2.11 Imports (`src/import/`)

Registre de `ImportResource` ordonnées par `phase`, parsing XLSX avec **localisation de la
ligne d'en-tête**, `IMPORT_ROW_LIMIT = 1000`, `dryRun`, rapport `{ totals, resources[],
errors[], warnings[] }` avec numéro de ligne Excel, export du rapport d'erreurs en PDF, gabarit
de classeur téléchargeable (`import.template.ts`).
Pour le CRM : ressource `organizations` (+ `contacts` en phase 2) ; accepter CSV **et** XLSX.

### 2.12 Tableau de bord (`src/dashboard/kpi.config.ts`)

Registre `KPI_CONFIG[code] = { requiresClientId, roles[] }`, `getKpisForRole()`. Un KPI = une
entrée + une fonction dans `kpis/`. Pour le CRM : `requiresProjectId` + filtrage par
`scopeFilter` (moi / équipe) plutôt que par rôle seul.

### 2.13 Divers repris

- `RequiresFeature` / `ClientModule` → `ProjectFeature` : feature flags par projet, **dès le socle**
  (décision §5.5) — `SALES`, `BILLING`, `SUPPORT`, `STATS`.
- `NotificationsGateway` (socket.io, namespace, token dans `handshake.auth`, session revalidée à
  la connexion) pour les notifications « devis à valider », « ticket assigné ».
- `HealthController` (`GET /health`).
- `math.utils.ts` (`round2`, `round4`), `date.utils.ts` (`toDate`, `formatDateField`),
  `file-response.helper.ts`, `entity-unique-number.helper.ts`.
- CORS : `exposedHeaders: ['Content-Disposition']`.
- Postman : `error-tests.postman_collection.json` + `run-tests.js` (newman, affiche les payloads).

---

## 3. Ce qu'on ne reprend pas

| Brique soft-m | Raison |
|---|---|
| Modules métier périscolaires (families, students, reservations, attendance, invoices, payments, nursery…) | Hors domaine — le CRM vend le produit, il ne le contient pas |
| `mobile/` (auth mobile, devices, JWT mobile distincts) | Pas d'application mobile CRM au périmètre |
| `ScopeType.SCHOOLS`, `FAMILY` | Remplacés par `PROJECT` / `OWN` + périmètre géographique |
| Exports ASAP / PES / CORAIL | Comptabilité publique côté collectivité, pas côté éditeur ; Chorus Pro relève d'une autre intégration |
| Absence de tests unitaires (0 `*.spec.ts` dans soft-m) | Le moteur tarifaire, les transitions et la résolution des droits **auront** des `*.spec.ts` (SPEC-02 §6) — les scripts curl BDD restent le test d'acceptation |

---

## 4. Variables d'environnement à prévoir

Reprises de `soft-m-api/.env.example`, renommées quand nécessaire :

```
DATABASE_URL PORT NODE_ENV BASE_URL CORS_ORIGINS
POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DB_PORT
JWT_ACCESS_SECRET JWT_ACCESS_EXPIRATION JWT_REFRESH_SECRET JWT_REFRESH_EXPIRATION
ACTIVATION_TOKEN_SECRET ACTIVATION_CRYPTR_SECRET ACTIVATION_TOKEN_EXPIRATION
PASSWORD_RESET_TOKEN_SECRET PASSWORD_RESET_CRYPTR_SECRET PASSWORD_RESET_TOKEN_EXPIRATION
EMAIL_CHANGE_TOKEN_SECRET EMAIL_CHANGE_CRYPTR_SECRET EMAIL_CHANGE_TOKEN_EXPIRATION
BCRYPT_ROUNDS MAX_LOGIN_ATTEMPTS LOCKOUT_DURATION_MINUTES
EMAIL_SENDING_ENABLED SMTP_PROVIDER SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS EMAIL_FROM PLATFORM_NAME
MINIO_ENDPOINT MINIO_PORT MINIO_USE_SSL MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_BUCKET MINIO_USE_SSE MINIO_PRESIGNED_GET_TTL MAX_FILE_SIZE_BYTES PRESIGNED_PUBLIC_URL
ENTERPRISE_SEARCH_URL
SEED_PASSWORD
```

---

## 5. Décisions tranchées (31/08/2026)

| # | Décision | Choix | Conséquence |
|---|---|---|---|
| 1 | Transport du projet | **Header `x-project-id` + `ProjectGuard` + `UserRoleProject`** | Remplace SPEC-02 §8.1.1 ; un utilisateur peut avoir un rôle dans plusieurs projets ; rôle backoffice `SUPER_ADMIN` avec `projectId = null` |
| 2 | Modèle de droits | **Tables `Permission` / `RolePermission(scope)` / `UserPermissionOverride`** | Droits sensibles = permissions ordinaires ; `voirMontantsAutres` devient le scope `PROJECT` vs `OWN` ; seed dans `prisma/seedAuth.ts` |
| 3 | Guards | **Explicites par route** `@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)` | Pas de garde globale ; `@Public()` réservé aux routes d'auth et de santé |
| 4 | Création des comptes | **Activation par email** (`PENDING` → mot de passe + consentement CGU/RGPD) | `ActivationToken`, `MailService`, reset de mot de passe et changement d'email au socle ; Mailpit en local |
| 5 | Feature flags par projet | **Dès le socle L0** : `ProjectFeature` + `@RequiresFeature` + `RequiresFeatureGuard` | `FeatureCode` = `SALES`, `BILLING`, `SUPPORT`, `STATS` ; chaque route métier annotée ; guard placé après `ProjectGuard` |
