# OUI-CRM — Spécification technique

> **Documents liés** : [SPEC-01-FONCTIONNELLE.md](SPEC-01-FONCTIONNELLE.md) (périmètre, règles métier),
> [SPEC-03-HERITAGE-SOFT-M.md](SPEC-03-HERITAGE-SOFT-M.md) (briques reprises de `soft-m-api`),
> [SPEC-04-MOTEUR-TARIFAIRE.md](SPEC-04-MOTEUR-TARIFAIRE.md) (moteur de calcul).
> Ce document décrit **comment** on construit ce que la spec fonctionnelle décrit.
> Révision cohérente du 31/08/2026 : toutes les décisions de §8 sont intégrées dans le corps du texte.

---

## 1. Architecture

```
┌──────────────────────┐        HTTPS / JSON        ┌──────────────────────┐
│   oui-crm-web        │ ─────────────────────────► │   oui-crm-api        │
│   Vite + React 19    │ ◄───────────────────────── │   NestJS 11          │
│   TanStack Query     │        WebSocket (notif)   │   Prisma 6           │
└──────────────────────┘                            └──────────┬───────────┘
                                                               │
                              ┌────────────────────────────────┼───────────────────┐
                              │                │               │                   │
                        ┌─────▼─────┐   ┌──────▼─────┐  ┌──────▼──────┐   ┌────────▼────────┐
                        │PostgreSQL │   │   MinIO    │  │  pg-boss    │   │ APIs externes   │
                        │  (Prisma) │   │ documents  │  │ jobs & cron │   │ Recherche-      │
                        └───────────┘   └────────────┘  └─────────────┘   │ entreprises,    │
                                                                          │ SMTP            │
                                                                          └─────────────────┘
```

### 1.1 Stack retenue

Toutes les briques sont **déjà présentes** dans `package.json` — aucune dépendance nouvelle
n'est requise pour le socle (sauf `handlebars` et `react-pdf-html` au lot L2, `exceljs` au lot L5).

| Besoin | Brique |
|---|---|
| Framework serveur | NestJS 11 (`@nestjs/common`, `platform-express`) |
| ORM / migrations | Prisma 6 + PostgreSQL 15 |
| Authentification | `@nestjs/jwt`, `passport-jwt`, `bcrypt`, `cryptr` (tokens d'activation) |
| Validation | `class-validator`, `class-transformer` |
| Documentation API | `@nestjs/swagger` → `/api/docs` |
| Identifiants | `cuid()` Prisma, validés par `ParseCuidPipe` / `@IsCuid()` |
| Stockage documents | `minio` (gabarits, devis, contrats, imports, exports) + `file-type` |
| Traitement asynchrone | `pg-boss` |
| Temps réel | `socket.io` |
| Emails | `nodemailer` + `p-limit` |
| Appels sortants | `axios` avec timeout |
| Documents | Gabarits **HTML** + `handlebars` (fusion) → PDF via `@react-pdf/renderer` + `react-pdf-html` (pont HTML → react-pdf) ; `.docx` ultérieur depuis le même HTML (`html-to-docx`) |
| Dates | `date-fns`, helpers `date.utils.ts` |
| Sécurité HTTP | `helmet`, `express-rate-limit` |

**Front** (`oui-crm-web`, base Metronic React) : React 19, Tailwind 4, Radix/shadcn, MUI,
TanStack Query et TanStack Table, `dnd-kit` (kanbans), ApexCharts, Leaflet, `react-hook-form` + `zod`.

### 1.2 Découpage en modules NestJS

Noms en anglais (glossaire dans le skill `backend-dev`). Les modules marqués ★ sont copiés de
`soft-m-api` puis adaptés (`client` → `projet`) — voir SPEC-03 §2.

```
src/
├── common/                 # existant : décorateurs, DTO, pipes, filtre d'erreur, utils, helpers ★
├── prisma/                 # existant
├── auth/                   # login, refresh, logout, sessions, activation, reset, email change ★
│   ├── guards/             # JwtAuthGuard, ProjectGuard, PermissionsGuard
│   └── decorators/         # @Permissions, @ProjectScoped, @CurrentUser, @Public
├── projects/                # Project, ProjectFeature (feature flags), @RequiresFeature + guard ★
├── profile/                # GET /profile/me (accès par projet), profil, mot de passe, avatar ★
├── users/                  # utilisateurs du projet, UserRoleProject, overrides ★
├── roles/                  # rôles et permissions (lecture + duplication + édition) ★
├── scopes/                 # périmètres géographiques + ScopeService (whereVisible, access)
├── audit-log/              # AuditLog append-only + export ★
├── reference-items/        # référentiels administrables par projet
├── settings/               # paramètres du projet (TVA, objectifs, plafond, société)
├── organizations/          # + complétude, bulk, recherche d'entreprises
├── contacts/
├── activities/             # actions, agenda, export ICS
├── campaigns/
├── opportunities/          # pipeline, OpportunityStage (historique)
├── pricing/                # PricingGrid versionnée + moteur pur computeQuote (SPEC-04)
├── quotes/                 # configuration, simulation, transitions, QuoteLine figées
├── contracts/              # création depuis devis, renouvellements
├── invoices/               # échéancier idempotent, références Chorus Pro
├── deployments/
├── trainings/
├── tickets/
├── dashboard/              # KPI_CONFIG + kpis/ ★
├── stats/                  # répartitions, entonnoir, concurrence
├── documents/              # gabarits HTML (MinIO), fusion Handlebars, export PDF (react-pdf-html), archivage
├── mail/                   # MailService, EmailLogService, templates ★
├── storage/  files/        # StorageService MinIO, modèle File ★
├── exports/                # registre déclaratif d'exports ★
├── import/                 # ImportResource + rapport ★
├── notifications/          # gateway socket.io ★
├── gdpr/                   # conservation, candidats à la purge, purge, export personnel
├── jobs/                   # façade pg-boss ★ ; les workers vivent dans les modules métier
└── health/                 # GET /health ★
```

Règle de dépendance : `pricing` ne dépend de rien ; `quotes` → `pricing` ; `contracts` → `quotes` ;
`invoices` → `contracts`. Pas de dépendance circulaire : les effets de bord inter-modules
s'exécutent dans la transaction de la route d'action (§3.3) ou passent par un job pg-boss.

---

## 2. Modèle de données

Conventions Prisma (SPEC-03 §2.3) : `@default(cuid())`, colonnes `@map("snake_case")`, tables
`@@map("plural_snake")`, `@db.VarChar(n)`, montants `Decimal(12,2)`, dates métier `@db.Date`,
horodatages `DateTime` UTC. Toute table métier porte `projectId` indexé ; les unicités sont
composées avec lui. Suppression logique (`deletedAt`) sauf purge RGPD.

### 2.1 Vue d'ensemble

```
Project (produit ou service à promouvoir — le « client » de soft-m)
       ├─► ProjectFeature[]       (feature flags SALES | BILLING | SUPPORT | STATS)
       ├─► Settings (1-1)         (identité, signataire, TVA, objectifs, discountCap, retentionMonths)
       ├─► ReferenceItem[]        (listes administrables : cibles, sources, concurrents, services…)
       ├─► Scope[]                (périmètres géographiques)
       ├─► PricingGrid[]          (offres : formules, options, frais — versionnée, une active)
       └─► File[]                 (HTML_TEMPLATE, SIGNATURE_IMAGE, QUOTE_PDF, CONTRACT_PDF, IMPORT_SOURCE, EXPORT_REPORT)

User ──┬─► Session[]               (refreshToken hash, version, expiresAt)
       ├─► ActivationToken / PasswordResetToken / EmailChangeToken
       ├─► UserRoleProject[]        ──► Role ──► RolePermission[] ──► Permission
       │        ├─ projectId? (null = backoffice), status, expiresAt?, initials
       │        └─ scopeId? ──► Scope (régions, départements, portefeuille, nature)
       └─► UserPermissionOverride[] (projectId, permissionId, granted)

Organization ──┬─► Contact[]              (isPrimary, optOut)
               ├─► Activity[]             ──► User, Campaign?
               ├─► CampaignOrganization[] ──► Campaign
               ├─► Opportunity[]          ──► OpportunityStage[] (historique)
               │        └─► Quote[]       ──► QuoteLine[] figées, PricingGrid
               │                 └─► Contract (1-1) ──► Invoice[]
               ├─► Deployment (1-1)
               ├─► Training[]
               └─► Ticket[]

AuditLog (projectId, userId?, action, objectType, objectId, metadata)
DocumentNumberSequence (projectId, type QUOTE | INVOICE, periodKey, lastNumber)
EmailLog (projectId, type, target, recipient, status, attempts)
```

### 2.2 Sécurité et accès (SPEC-03 §2.1-2.2)

- **`Project`** — un produit ou service à promouvoir (SPEC-01 §1) ; joue le rôle du `Client` de
  soft-m : `name`, `slug` unique, `productName`, `description`, `status` (`DRAFT` | `ACTIVE` |
  `ARCHIVED`), `activatedAt`. Tout ce qui est propre au projet lui est rattaché par `projectId` :
  réglages (`Settings`), configuration (`ReferenceItem`, `Scope`, `ProjectFeature`), offres
  (`PricingGrid`, gabarits HTML et cachet `File`) et base commerciale. La création d'un projet
  passe par **`ProjectBootstrapService`** (transaction : `Settings` par défaut, référentiels par
  défaut, `PricingGrid` v1, features par défaut — SPEC-08 R6), appelé par `POST /projects` et par le seed.
- **`ProjectFeature`** — `(projectId, feature)` unique, `enabled`. `FeatureCode` = `SALES`, `BILLING`,
  `SUPPORT`, `STATS` (SPEC-08 R4 ; garde `@RequiresFeature()`).
- **`User`** — `email` unique global, `password` (bcrypt), `firstName`, `lastName`,
  `status` (`PENDING` | `ACTIVE` | `INACTIVE`),
  `failedLoginAttempts`, `lockedUntil`, `lastLoginAt`, `cguVersion`, `cguAcceptedAt`,
  `rgpdVersion`, `rgpdAcceptedAt`.
- **`Session`** — `userId`, `refreshToken` (hash), `expiresAt`, `version`.
- **`ActivationToken`**, **`PasswordResetToken`**, **`EmailChangeToken`** — repris tels quels.
- **`Role`** — `code`, `label`, `isBackoffice`, `isSystem` (non supprimable),
  `outOfScopeAccess` (`NONE` | `RESTRICTED` | `FULL`, comportement hors périmètre géographique),
  `projectId?` (null = rôle global seedé ; un projet peut dupliquer un rôle système et le modifier).
  Unicité **`(projectId, code)`** (SPEC-08 R2).
  Matrice complète rôles × permissions × scopes : **SPEC-06**.
- **`Permission`** — `code` (`module:action`), `label`. Catalogue en SPEC-03 §2.2.
- **`RolePermission`** — `(roleId, permissionId)` unique, `scope` (`ALL` | `PROJECT` | `OWN`).
- **`UserRoleProject`** — `(userId, projectId)` unique, `roleId`, `status`, `displayOrder`,
  `expiresAt?` (comptes externes ; une affectation expirée est refusée à chaque requête),
  `scopeId?` → `Scope` (périmètre géographique de l'utilisateur sur ce projet — SPEC-08 R1),
  `initials` (VarChar 3, numérotation des devis ; unicité **`(projectId, initials)`** — SPEC-08 R7).
- **`UserPermissionOverride`** — `(userId, projectId, permissionId)` unique, `granted`.
  Évaluation : **retrait > ajout > rôle**.
- **`Scope`** — `projectId`, `name`, `description`, `regions[]`, `departments[]`,
  `portfolioOnly`, `nature` (`ALL` | `PROSPECTS` | `CUSTOMERS`), `campaignIds[]`.
  Affecté à l'utilisateur par `UserRoleProject.scopeId`.
- **`AuditLog`** — `projectId?`, `userId?`, `action` (VarChar 45), `objectType?`, `objectId?`,
  `ip`, `userAgent`, `metadata Json?`, `createdAt`. Append-only.

### 2.3 Paramétrage

- **`Settings`** — `projectId` unique, `vatRate` (20), `revenueTarget` (130 000), `meetingTarget`
  (20), `quoteValidityDays` (30), `noticeMonths` (2), `defaultCommitmentMonths` (36),
  `discountCap` (30), `retentionMonths` (36), `stageProbabilities` Json (probabilité par étape
  d'opportunité, défauts V8, `WON`/`LOST` figés — SPEC-10 §2), `company` Json (`name`, `siren`,
  `siret`, `address`, `phone`, `email`, `signatory`, `rcs`) — valeurs réelles en SPEC-01 §6.4.
- **`ReferenceItem`** — `(projectId, category, key)` unique, `label`, `order`, `active`,
  `metadata` Json. Catégories : `STRUCTURE_TYPE` (metadata `territorial`), `TAG`, `SERVICE`,
  `ACTIVITY_TYPE`, `ACTIVITY_RESULT`, `TICKET_CATEGORY`, `TRAINING_TYPE`, `VENDOR`, `SOLUTION`
  (metadata `vendor`), `LOSS_REASON`, `LEAD_SOURCE` (SPEC-05 décision Q3).
- **`PricingGrid`** — `(projectId, version)` unique, `effectiveDate`, `active`, `content` Json
  (`brackets`, `plans`, `subscription`, `options`, `setupFees`, `extras` — SPEC-04 §2.1),
  `createdById`. Une seule grille active par projet ; un devis référence sa version.
- **`DocumentNumberSequence`** — `(projectId, type, periodKey)` unique, `lastNumber`.
  `periodKey` = `YYYY-DDD` pour `QUOTE` (séquence quotidienne), `YYYY` pour `INVOICE`.

### 2.4 Base commerciale

- **`Organization`** — identité (`name`, `type` → `STRUCTURE_TYPE`, `displayPrefix`, `siret`,
  `inseeCode`, `address`, `postalCode`, `city`, `department`, `population`, `epci`, `phone`,
  `email`, `website`), environnement (`solution` → `SOLUTION`, `schoolCount`, `childCount`,
  `services[]`), suivi (`salesStatus`, `customerStatus`, `priority`, `tags[]`, `leadSource?` →
  `LEAD_SOURCE`, `targetPlan`, `salesRepId`, `consultantId`, `trainerId`, `notes`, `goLiveTarget`),
  `importBatchId?` (annulation d'un lot d'import), `productCustomerId?`
  (identifiant du client dans le logiciel Périscolia, réservé — décision 11).
  Unicité `(projectId, siret)` ; index `(projectId, department)`, `(projectId, salesStatus)`,
  `(projectId, customerStatus)`, `(projectId, salesRepId)` ; GIN trigram sur `name` et `city`.
- **`Contact`** — `organizationId`, `civility`, `firstName`, `lastName`, `role`, `email`,
  `phone`, `mobile`, `isPrimary`, `optOut`, `notes`. Au plus un `isPrimary` par organisme.
- **`Activity`** — `organizationId`, `contactId?`, `userId`, `type` → `ACTIVITY_TYPE`, `date`,
  `time?`, `durationMin?`, `location`, `status` (`PLANNED` | `DONE` | `CANCELLED`), `report`,
  `result?` → `ACTIVITY_RESULT`, `campaignId?`.
- **`Campaign`** — `name`, `description`, `criteria`, `ownerId`, `status`, `startDate`, `endDate` ;
  liaison `CampaignOrganization (campaignId, organizationId, addedAt)`.

### 2.5 Cycle de vente

- **`Opportunity`** — `organizationId`, `label`, `stage` (enum 7 valeurs), `ownerId`, `source`,
  `expectedCloseDate`, `lossReason?` → `LOSS_REASON`, `probabilityOverride?` (0–100 ; la
  probabilité effective = `probabilityOverride ?? stageProbability`, SPEC-05 décision Q4).
  Historique dans **`OpportunityStage`**
  (`opportunityId`, `stage`, `date`) — table, pas JSON : source des statistiques.
- **`Quote`** — `organizationId`, `opportunityId?`, `pricingGridId`, `number` unique par projet,
  `type` (`INITIAL` | `ADDITIONAL` | `RENEWAL`), `status` (`DRAFT` | `PENDING_VALIDATION` | `SENT`
  | `FOLLOWED_UP` | `NEGOTIATING` | `SIGNED` | `REJECTED` | `EXPIRED`), `ownerId`, `issueDate`,
  `validUntil`, `startDate`, `signedAt?`, `validatedById?`, `config` Json (SPEC-04 §2.1),
  montants cachés du `QuoteResult` : `mrrList`, `mrrNet`, `arrList`, `arrNet`, `oneShotTotal`,
  `firstYearHt`, `firstYearVat`, `firstYearTtc`, `maxDiscount` ; `origin` (`CRM` | `IMPORTED`),
  `legacyNumber?` et `importBatchId?` pour les devis repris du classeur (SPEC-05 §2.2 — `config`
  nul, jamais recalculés, non régénérables en PDF).
  **`QuoteLine`** — lignes **figées à la soumission** (`nature`, `order`, `label`, `sublabel`,
  `qty`, `unitPrice`, `discount`, `total`). Après soumission, le devis n'est plus recalculé.
- **`Contract`** — `quoteId` unique, `organizationId`, `number`, `signedAt`, `startDate`,
  `commitmentMonths`, `endDate`, `autoRenew`, `noticeMonths`, `billing` (`MONTHLY` | `YEARLY`),
  `plan`, `mrrList`, `mrrNet`, `arrList`, `arrNet`, `oneShotTotal`, `trialClause`,
  `status` (`ACTIVE` | `NOTICE_RECEIVED` | `TERMINATED` | `EXPIRED`).
- **`Invoice`** — `contractId`, `organizationId`, `number`, `period` (`SETUP` | `M1..` | `A1..`),
  `label`, `ht`, `vatRate`, `vat`, `ttc`, `issueDate`, `dueDate`, `paidAt?`, `status`
  (`TO_ISSUE` | `ISSUED` | `DEPOSITED_CHORUS` | `PAID` | `OVERDUE`), `chorus` Json
  (`buyerSiret`, `serviceCode`, `commitmentNumber`, `depositReference?`).
  **Unicité `(contractId, period)`** : l'idempotence est garantie par la base.

### 2.6 Après-vente

- **`Deployment`** — `organizationId` unique, `stage` (enum 6 valeurs), `consultantId?`,
  `openedAt`, `goLiveTarget?`, `goLiveAt?`, `notes`.
- **`Training`** — `organizationId`, `type` → `TRAINING_TYPE`, `trainerId?`, `date`, `time?`,
  `durationMin?`, `location`, `status`, `attendees?`, `report`.
- **`Ticket`** — `organizationId`, `subject`, `description`, `category` → `TICKET_CATEGORY`,
  `status` (4 valeurs), `priority`, `date`, `assigneeId?`, `resolvedAt?`.

### 2.7 Documents et fichiers

- **`File`** (SPEC-03 §2.7) — `projectId?`, `ownerType`, `ownerId`, `category`, `filePath` unique,
  `fileName`, `fileSize`, `mimeType`, `uploadedBy`. Catégories : `HTML_TEMPLATE` (gabarits
  versionnés, un actif par type et par projet), `SIGNATURE_IMAGE` (cachet + signature du projet,
  PNG/JPEG), `QUOTE_PDF`, `CONTRACT_PDF`, `SIGNED_RETURN` (retour signé de la collectivité),
  `IMPORT_SOURCE`, `EXPORT_REPORT`.
- **`EmailLog`** (SPEC-03 §2.6).

**Règle `projectId` nullable** (décision du 31/08/2026) : `projectId` est NOT NULL sur toute table
métier. Il est nullable **uniquement** sur `File` (avatar d'un utilisateur), `EmailLog` (emails de
compte : activation, reset, changement d'email), `AuditLog` (actions backoffice de plateforme) et
`UserRoleProject` (affectation backoffice) — `null` signifie « niveau plateforme / compte », jamais
« non renseigné ». Toute requête sur ces tables porte une condition explicite sur `projectId`
(`{ projectId }` ou `{ projectId: null, ownerType: USER, ownerId }`). Conséquence Postgres : deux
`NULL` sont distincts dans un index unique ; les unicités `(projectId, code)` des rôles système et
`(userId, projectId)` des affectations backoffice sont complétées par des **index uniques partiels**
(`WHERE project_id IS NULL`) écrits à la main dans la migration.

### 2.8 Énumérations vs référentiels

`enum` Prisma pour ce qui porte une logique applicative : statuts de devis, contrat, facture,
activité, campagne, ticket ; étapes d'opportunité et de déploiement ; statut commercial et client ;
priorité ; `ScopeType`, `FeatureCode`, `UserStatus`. Table `ReferenceItem` pour ce que le métier
étend sans développeur (§2.3).

---

## 3. API

### 3.1 Conventions

- Base `/api/v1`, Swagger sur `/api/docs`. Ressources au pluriel, kebab-case, **en anglais**.
- Toute route projet-scopée exige le header **`x-project-id`** et porte
  `@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)` + `@ProjectScoped()` +
  `@Permissions({ code })`. Les routes backoffice (rôles globaux, projets) n'ont pas de projet.
- Pagination : `page`, `limit` (max 100), réponse `{ data, meta: { total, page, limit, totalPages } }`.
- Format d'erreur imposé : `{ messages: { statusCode, code, text, level } }` ; codes et Swagger
  centralisés dans `src/common/messages.ts`.
- Identifiants cuid validés par `ParseCuidPipe`.

### 3.2 Routes principales

| Domaine | Routes |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/activation/validate` · `POST /auth/activation/complete` · `POST /auth/password-reset/request` · `/validate` · `/complete` · `POST /auth/email-change/request` · `/confirm` |
| Profile | `GET /profile/me` (identité, `contactType` BACKOFFICE / PROJECT, `roleRelationships[]` avec permissions effectives, modules et périmètre par projet — SPEC-06 §6) · `PATCH /profile` · `POST /profile/password` · `POST /profile/avatar` |
| Projets (backoffice) | `GET/POST /projects` (`copyFromProjectId?` — SPEC-10 §3.4) · `PATCH /projects/:id` · `PATCH /projects/:id/features` · `GET /projects/:id/config-export` |
| Users | `GET/POST /users` · `GET/PATCH/DELETE /users/:id` · `PATCH /users/:id/overrides` · `POST /users/:id/resend-activation` |
| Roles & scopes | `GET /roles` · `POST /roles/:id/duplicate` · `PATCH /roles/:id/permissions` · `GET/POST /scopes` · `PATCH/DELETE /scopes/:id` |
| Settings & references | `GET/PATCH /settings` · `GET/POST /reference-items` · `PATCH /reference-items/:id` |
| Organizations | `GET/POST /organizations` · `GET/PATCH/DELETE /organizations/:id` · `GET /organizations/:id/completeness` · `POST /organizations/bulk` · `GET /organizations/search-registry?q=` (Recherche d'entreprises) |
| Contacts | `GET/POST /organizations/:id/contacts` · `PATCH/DELETE /contacts/:id` |
| Activities | `GET/POST /activities` · `PATCH /activities/:id` · `POST /activities/:id/complete` · `GET /agenda?from&to` · `GET /activities/:id/ics` |
| Campaigns | `GET/POST /campaigns` · `PATCH /campaigns/:id` · `POST /campaigns/:id/organizations` · `GET /campaigns/:id/results` |
| Opportunities | `GET/POST /opportunities` · `PATCH /opportunities/:id` · `POST /opportunities/:id/stage` |
| Pricing | `GET /pricing-grids` · `GET /pricing-grids/active` · `POST /pricing-grids` (nouvelle version) · `POST /quotes/simulate` |
| Quotes | `GET/POST /quotes` · `GET/PATCH/DELETE /quotes/:id` · `POST /quotes/:id/submit` · `/validate` · `/reject` · `/follow-up` · `/negotiate` · `/sign` · `/decline` · `GET /quotes/:id/document?format=pdf` · `POST /quotes/:id/signed-return` |
| Contracts | `GET /contracts` · `GET/PATCH /contracts/:id` · `POST /contracts/:id/notice` · `/terminate` · `GET /contracts/:id/document?format=pdf` · `GET /renewals` |
| Invoices | `GET /invoices` · `GET/PATCH /invoices/:id` · `POST /contracts/:id/schedule` · `POST /invoices/:id/issue` · `/deposit` · `/pay` |
| Deployments | `GET /deployments` · `PATCH /deployments/:id` · `POST /deployments/:id/stage` |
| Trainings | `GET/POST /trainings` · `PATCH/DELETE /trainings/:id` · `POST /trainings/:id/complete` |
| Tickets | `GET/POST /tickets` · `PATCH /tickets/:id` · `POST /tickets/:id/status` |
| Dashboard & stats | `GET /dashboard?period&scope` (KPI_CONFIG) · `GET /stats/pipeline` · `GET /stats/base` · `GET /stats/competition` |
| Exports & import | `GET /exports` · `GET /exports/:key/preview` · `POST /exports/:key` · `GET /import/template` · `POST /import?dryRun=` · `POST /import/errors-pdf` |
| Audit & GDPR | `GET /audit-log` · `POST /exports/audit-log` · `GET /gdpr/purge-candidates` · `POST /gdpr/purge` · `GET /gdpr/contacts/:id/export` |
| Health | `GET /health` |

### 3.3 Transitions d'état = routes d'action

Jamais un `PATCH` sur un champ `status` : chaque transition a sa route, sa permission, ses effets
de bord et son `AuditLog` **dans la même transaction**.

- `POST /quotes/:id/submit` — `quotes:submit`. Fige les `QuoteLine` et la version de grille ;
  si `maxDiscount > discountCap` → `PENDING_VALIDATION` + notification aux porteurs de
  `quotes:validate`, sinon `SENT`. Propage l'étape d'opportunité (SPEC-01 §3.8).
- `POST /quotes/:id/validate` | `/reject` — `quotes:validate`. `SENT` ou retour `DRAFT`.
- `POST /quotes/:id/sign` — `quotes:sign`, `signedAt` obligatoire. Vérifie la complétude de
  l'organisme, **crée le contrat** (copie `mrrList/mrrNet/arrList/arrNet/oneShotTotal`), passe
  l'organisme en `IN_DEPLOYMENT`, ouvre le `Deployment`, affecte consultant et formateur, puis
  déclenche le job `invoices.schedule`.
- `POST /contracts/:id/schedule` — `invoices:create`. Idempotent (`createMany skipDuplicates`),
  retourne le nombre d'échéances créées ; pas de ligne pour les mois offerts.
- `POST /invoices/:id/deposit` — `invoices:chorus`. Refuse si `buyerSiret` ou
  (`serviceCode` et `commitmentNumber`) manquent ; le dépôt lui-même est **manuel** sur le
  portail (décision 9), la route enregistre la référence et la date.
- `POST /opportunities/:id/stage`, `/deployments/:id/stage`, `/tickets/:id/status`,
  `/activities/:id/complete`, `/trainings/:id/complete` — même principe.

---

## 4. Sécurité

### 4.1 Trois guards, dans cet ordre, sur chaque route

1. **`JwtAuthGuard`** — session rechargée à chaque requête : `version` différente, session
   expirée, utilisateur `INACTIVE` → 401 ; token expiré → `TOKEN_EXPIRED`.
2. **`ProjectGuard`** — header `x-project-id` requis sur les routes `@ProjectScoped()`
   (`PROJECT_IS_REQUIRED`), appartenance via `UserRoleProject` actif et non expiré
   (`PROJECT_MISMATCH`), rôle backoffice avec scope `ALL` → tout projet. Dépose `req.projectId`.
   Puis `RequiresFeatureGuard` pour les routes `@RequiresFeature(code)` (`FEATURE_NOT_ENABLED`).
3. **`PermissionsGuard`** — code `module:action` trouvé dans les permissions du rôle pour ce
   projet, corrigé par `UserPermissionOverride` (**retrait > ajout > rôle**), sinon
   `ACCESS_DENIED`. Dépose `req.scopeFilter[code]` : `ALL` → `{}`, `PROJECT` → `{ projectId }`,
   `OWN` → `{ ownerId: user.id }` (le nom du champ dépend de l'objet : `salesRepId`, `ownerId`,
   `userId`).

Le front reçoit via `GET /profile/me` (SPEC-06 §6) la liste des projets accessibles avec, pour
chacun, les permissions effectives, le périmètre et les modules actifs — pour adapter
l'interface, **jamais pour décider**.

### 4.2 Périmètre géographique

`ScopeService` résout le `Scope` de l'utilisateur pour le projet en un prédicat Prisma :

```ts
whereVisible(user, projectId): Prisma.OrganizationWhereInput
// départements du périmètre, portefeuille (salesRepId | consultantId | trainerId = user.id),
// nature (prospects / clients), campagnes — ou {} si outOfScopeAccess = FULL
access(user, projectId, organization): 'FULL' | 'RESTRICTED' | 'NONE'
```

- Le `where` d'une liste = `AND [ filtres, req.scopeFilter[code], whereVisible() ]`. Pour un
  `outOfScopeAccess = NONE`, `whereVisible()` exclut les fiches hors périmètre ; pour
  `RESTRICTED`, elles sont retournées et **projetées** (`projectRestricted()`, côté serveur) sur
  `id, name, type, city, department, salesStatus, customerStatus, salesRep` — ni contacts, ni
  montants, ni comptes rendus ne quittent le serveur.
- Sur un détail, `access()` est évalué **avant** de charger l'entité complète : `NONE` → 404 (ne
  pas révéler l'existence), `RESTRICTED` → `select` réduit.
- Les agrégats (dashboard, stats) appliquent le même `where`.

### 4.3 Journalisation

`AuditLogService.log(tx, {...})` dans la transaction de toute opération sensible : transitions de
devis et de contrat, modification de grille, purge RGPD, création/modification/désactivation de
compte, changement de rôle ou d'override, export de données, restauration. Table append-only,
exportable (`exports:auditLog`).

### 4.4 Divers

- `bcrypt` (`BCRYPT_ROUNDS`), verrouillage après `MAX_LOGIN_ATTEMPTS` échecs pendant
  `LOCKOUT_DURATION_MINUTES`.
- `helmet`, CORS restreint à `CORS_ORIGINS` avec `exposedHeaders: ['Content-Disposition']`,
  `express-rate-limit` sur `/auth/*` et `/exports/*`.
- Uploads : type réel par magic bytes (`file-type`), taille max par catégorie.
- Secrets d'intégration chiffrés au repos (`cryptr`).

---

## 5. Points techniques structurants

### 5.1 Moteur tarifaire

Spécifié dans **SPEC-04** : service pur `computeQuote(input): QuoteResult`, une seule
implémentation côté serveur, exposée par `POST /quotes/simulate` pour le calcul temps réel du
configurateur. Grille versionnée (`PricingGrid`), lignes figées à la soumission, matrice de tests
obligatoire (SPEC-04 §4).

### 5.2 Idempotence de l'échéancier

Contrainte `@@unique([contractId, period])` + `createMany({ skipDuplicates: true })` dans une
transaction ; retour = nombre de lignes créées. Deux appels concurrents ne produisent pas de doublon.

### 5.3 Génération documentaire (décision 21 : gabarits HTML)

Les gabarits sont des fichiers **HTML** (`File` catégorie `HTML_TEMPLATE`), versionnés par projet,
un actif par type (`QUOTE`, `CONTRACT`), remplaçables par un administrateur sans livraison.
Chaîne de production, côté serveur :

```
HTML_TEMPLATE (Handlebars) + données (SPEC-01 §6.2-6.3) ──► HTML fusionné
    ──► PDF : react-pdf-html → @react-pdf/renderer (premier format livré)
    ──► DOCX : html-to-docx (format ultérieur, même HTML source)
```

- **Fusion** : `handlebars` (logic-less, échappement HTML par défaut) ; les balises reprennent le
  contrat de données V8 (`{{mairie_nom}}`, `{{#each lignes_abo}}…`) pour rester compatibles avec
  les données déjà spécifiées. Montants **déjà formatés** par le serveur.
- **Contraintes du sous-ensemble HTML/CSS** de `react-pdf-html` : tableaux, images, styles inline
  et `<style>` simples, sauts de page (`page-break-before`) ; pas de JavaScript, pas de CSS avancé.
  Un gabarit téléversé est **validé** à l'upload : balises Handlebars obligatoires présentes,
  rendu d'essai sur un jeu de données de test sans erreur.
- **Cachet et signature** : le gabarit contient `<img src="{{signature_image}}">` ; le serveur
  injecte l'image du projet (`File` catégorie `SIGNATURE_IMAGE`, PNG/JPEG, en data URI). Pas
  d'image configurée → document généré sans cachet + avertissement dans la réponse, jamais un
  échec. Remplacer le cachet = téléverser une nouvelle image, sans toucher au gabarit.
- **Archivage** : le PDF généré à la soumission est stocké (`QUOTE_PDF` / `CONTRACT_PDF`) et
  rattaché à l'entité : un devis envoyé reste consultable à l'identique.
- **Gabarits de référence** : les deux gabarits Word de la V8 (`docs/Gabarit_*_V8.docx`, structure
  et textes) sont **transcrits en HTML** au lot L2 ; le cachet `docs/cachet-signature-periscolia.png`
  devient la `SIGNATURE_IMAGE` du projet Périscolia au seed.

### 5.4 Intégrations externes

| Intégration | Usage | Traitement |
|---|---|---|
| Recherche d'entreprises (`api.gouv.fr`) | Pré-remplissage à la création d'un organisme (nom ou SIRET) | `axios`, timeout 8 s, erreurs mappées (`REGISTRY_NOT_FOUND`, `REGISTRY_TIMEOUT`, `REGISTRY_UNAVAILABLE`), jamais bloquant, réponses mises en cache |
| SMTP | Activation, reset, notifications, relances | `MailService` + `EmailLogService` (SPEC-03 §2.6), `EMAIL_SENDING_ENABLED`, Mailpit en local |
| Chorus Pro | Références de dépôt (décision 9) | **Manuel** : le CRM stocke et contrôle `buyerSiret`, `serviceCode`, `commitmentNumber` ; l'API PISTE fait l'objet d'un lot ultérieur |
| Produit Périscolia | Santé de compte (décision 11) | **Plus tard** : `Organization.productCustomerId` réservé |

Aucun appel externe dans le chemin critique d'une requête utilisateur.

### 5.5 Tâches de fond (pg-boss)

| Queue | Fréquence | Rôle |
|---|---|---|
| `invoices.schedule` | Quotidien + à la signature | Complète l'échéancier sur l'horizon glissant |
| `invoices.overdue` | Quotidien | Bascule en `OVERDUE` les factures échues non payées |
| `quotes.expire` | Quotidien | Passe en `EXPIRED` les devis dont `validUntil` est dépassée |
| `contracts.renewalAlerts` | Quotidien | Alertes à 180 / 90 / 60 / 30 jours |
| `prospects.wakeUp` | Quotidien | Remet en `TO_CONTACT` les fiches `CLOSED` depuis 6 mois |
| `accounts.expire` | Quotidien | Suspend les `UserRoleProject` arrivés à `expiresAt` |
| `gdpr.candidates` | Mensuel | Recense les prospects hors délai (purge sur validation humaine) |
| `mail.dispatch` | À la demande | Envois d'emails tracés |
| `exports.run` | À la demande | Exports asynchrones persistés dans MinIO |

### 5.6 Import et export (SPEC-03 §2.10-2.11)

- **Import** : `ImportResource` `organizations` puis `contacts`, formats **XLSX et CSV**, gabarit
  téléchargeable, `dryRun`, rapport avec numéros de ligne, doublons sur SIRET puis nom + code
  postal. La reprise du classeur `OUICRM_v2_1.xlsx` est spécifiée dans
  [SPEC-05-IMPORT-REPRISE.md](SPEC-05-IMPORT-REPRISE.md) (profil `OUICRM_V2_1`, décision 8).
- **Export** : descripteurs `organizations-list` (CSV/XLSX), `audit-log` (CSV), `backup` (JSON),
  chacun avec sa permission `exports:<domaine>` et journalisé avec le volume exporté.

---

## 6. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| Performance | Liste de 10 000 organismes filtrée et paginée < 300 ms ; dashboard < 800 ms ; pagination serveur systématique |
| Recherche | `pg_trgm`, index GIN sur `name`, `city`, numéros de documents |
| Disponibilité | Aucun appel externe dans le chemin critique |
| Traçabilité | `AuditLog` inaltérable et exportable |
| Tests | `*.spec.ts` sur le moteur tarifaire (SPEC-04 §4), l'idempotence, la résolution permissions + overrides, `ScopeService` ; scénarios Gherkin + scripts curl BDD par lot ; collection Postman `error-tests` |
| Documentation | Swagger vérifié par `npm run swagger:check` ; format d'erreur validé par Postman |
| Sauvegarde | PostgreSQL quotidienne, restauration testée ; export JSON complet réservé à `data:export` |
| RGPD | Conservation paramétrable, purge tracée, export des données d'une personne, registre des traitements |
| Environnements | `docker-compose.dev.yml` / `.uat.yml` / `.prod.yml` + services MinIO et Mailpit à ajouter en dev ; migrations appliquées au déploiement |

---

## 7. Lots de livraison

| Lot | Contenu | Dépend de |
|---|---|---|
| **L0 — Socle** | Schéma Prisma complet, migrations, `seedAuth.ts` (rôles, permissions, projet Périscolia, utilisateurs V8), auth à sessions + activation par email (mail, Mailpit), `ProjectGuard` + `PermissionsGuard` + overrides, `Scope` + `ScopeService`, `ProjectFeature` + `@RequiresFeature`, `AuditLog`, `Settings`, `ReferenceItem`, storage MinIO + `File`, jobs, health, format d'erreur, Swagger, Postman error-tests | — |
| **L1 — Base commerciale** | Organizations (complétude, bulk, recherche d'entreprises), contacts, **import XLSX/CSV de reprise**, activities + agenda + ICS, campaigns | L0 |
| **L2 — Cycle de vente** | `PricingGrid` versionnée, moteur `computeQuote` + matrice de tests, quotes (simulation, transitions, validation, lignes figées), opportunities + historique, génération PDF depuis gabarits HTML (cachet injecté) | L1 |
| **L3 — Contractualisation** | Contracts, échéancier idempotent, invoices, références Chorus Pro (dépôt manuel), renewals | L2 |
| **L4 — Après-vente** | Deployments, trainings, tickets, portefeuille clients | L3 |
| **L5 — Pilotage** | Dashboard (`KPI_CONFIG`), stats, concurrence, exports (`exceljs`) | L2 |
| **L6 — Administration** | Écrans settings, référentiels, rôles et périmètres, GDPR (purge, export personnel), sauvegarde/restauration | L0 |

L0 conditionne tout : guards, périmètre et audit ne se rajoutent pas après coup sur des requêtes
déjà écrites.

Le découpage de chaque lot en **user stories**, avec le contrat d'API et le handoff front de
chacune, est dans [SPEC-07-USER-STORIES.md](SPEC-07-USER-STORIES.md).

---

## 8. Décisions (toutes tranchées le 31/08/2026)

| # | Sujet | Choix | Où c'est appliqué |
|---|---|---|---|
| 1 | Multi-projet | Oui — `Project`, `projectId` partout, unicités composées | §2 |
| 2 | Ordre de réalisation | L0 puis L1 enchaînés | §7 |
| 3 | Transport du projet | Header `x-project-id` + `ProjectGuard` + `UserRoleProject` | §3.1, §4.1 |
| 4 | Modèle de droits | Tables `Permission` / `RolePermission(scope)` / `UserPermissionOverride` ; droits sensibles = permissions ordinaires | §2.2, §4.1 |
| 5 | Guards | Explicites par route, ordre JWT → projet → permissions | §4.1 |
| 6 | Création des comptes | Activation par email, consentement CGU/RGPD | §2.2, §3.2 |
| 7 | Feature flags | `ProjectFeature` + `@RequiresFeature` dès L0 | §2.2, §4.1 |
| 8 | Reprise de l'existant | Fichier Excel/CSV — import prioritaire en L1, spec de mapping sur le fichier réel (à fournir) | §5.6, §7 |
| 9 | Chorus Pro | Manuel d'abord ; API dans un lot ultérieur | §3.3, §5.4 |
| 10 | Signature | Pas de prestataire ; cachet + signature = image du projet (`SIGNATURE_IMAGE`) injectée dans le gabarit ; passage en « Signé » manuel avec retour signé joignable | §5.3 |
| 11 | Lien produit | Plus tard ; `productCustomerId` réservé | §2.4, §5.4 |
| 12 | Langue du code | Anglais (glossaire `backend-dev`) ; domaine en français dans les specs | §1.2, §3 |
| 13–20 | Moteur tarifaire | Voir SPEC-04 §1 | §5.1 |
| 21 | Gabarits de documents | **HTML** (Handlebars), export **PDF** via `@react-pdf/renderer` + `react-pdf-html` ; `.docx` ultérieur depuis le même HTML ; cachet = image du projet injectée | §5.3 |
| 22 | URLs CGU/RGPD | Factices (`oui-crm.example`) jusqu'à publication des documents de la plateforme | SPEC-09 T14 |
| 23 | Configuration d'un projet | Bootstrap générique + écrans + **import de configuration** (profil `PROJECT_CONFIG`, onglet ⚙️ Paramètres ou gabarit) + copie depuis un projet ; probabilités par étape **par projet** | SPEC-10 |
