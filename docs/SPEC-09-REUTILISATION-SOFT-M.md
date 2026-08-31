# OUI-CRM — Carte de réutilisation du code de `soft-m-api`

> Deep dive du 31/08/2026 sur `C:/back/soft-m-api/src` : inventaire fichier par fichier des
> modules candidats au lot L0 (SPEC-08), couplages détectés, action par fichier.
> Actions : **COPY** = copie telle quelle (renommage `client` → `project` uniquement) ·
> **ADAPT** = copie puis modifications listées · **BASE** = sert de modèle, réécrit en partie ·
> **SKIP** = non repris · **NEW** = n'existe pas dans soft-m.
> Le scaffold `oui-crm-api` est déjà une copie de soft-m : `tsconfig`, `nest-cli`, `Dockerfile*`,
> `.dockerignore`, `docker-compose*`, `src/common/` sont identiques (diff = en-têtes et CRLF).

---

## 1. Constats transverses

| # | Constat | Conséquence pour OUI-CRM |
|---|---|---|
| T1 | Aucun `*.spec.ts` dans soft-m ; qualité = scripts curl BDD + Postman `error-tests` (12 requêtes) | On copie l'outillage curl/Postman et on **ajoute** les `*.spec.ts` prévus (guards, scope, moteur) |
| T2 | `JwtAuthGuard` = `AuthGuard(['jwt', 'mobile-jwt'])` | Retirer `'mobile-jwt'` (pas d'app mobile) |
| T3 | `AuthService.login` **n'applique pas le verrouillage** : `failedLoginAttempts` s'incrémente, `lockedUntil` n'est jamais écrit ; `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_DURATION_MINUTES` sont dans `.env.example` mais inutilisés | Compléter : au N-ième échec, `lockedUntil = now + LOCKOUT_DURATION_MINUTES` ; remise à zéro au succès |
| T4 | `login` et `refreshToken` ne vérifient pas `user.status` (`PENDING`/`INACTIVE` peuvent obtenir un token si un mot de passe existe) ; seule `JwtStrategy` ne filtre pas non plus le statut | Ajouter le contrôle `status === ACTIVE` dans `login`, `refreshToken` et `JwtStrategy.validate` (SPEC-02 §4.1) |
| T5 | `refreshToken` ne vérifie pas `session.expiresAt` (seule la vérification JWT le fait, ce qui suffit) | RAS, conserver |
| T6 | `messages.ts` (2 024 lignes) mélange tous les domaines | Repartir d'un fichier vide avec la même structure, y copier **uniquement** les codes listés en §4 |
| T7 | `storage.utils.ALLOWED_MIME_TYPES` ne contient ni `text/html` ni `.docx` | Ajouter `text/html` (gabarits `HTML_TEMPLATE`) ; le `.docx` ne sera ajouté que si l'export Word est livré |
| T8 | `users.service.ts` (789 l.) est couplé à `clients`, `staff-members`, `legalResponsible`, structures | Ne pas le copier ; prendre `users-backoffice.service.ts` (206 l., autonome) comme **BASE** et y greffer le rattachement multi-projet de `users.service.create()` |
| T9 | `profile.service.ts` dépend de `files` (avatar) et de `staffMember` (dans `getMe`) | ADAPT : retirer `staffMemberId`, garder l'avatar via `FileService` |
| T10 | `file.service.ts` (520 l.) porte des règles familles/élèves (`canReadStudentDocuments`, quotients) | BASE : garder `upload / getById / getDownloadUrl / list / delete` et réécrire `canRead / canWrite / canDelete` sur `projectId` + permissions |
| T11 | Les DTO utilisent parfois `roleId` (backoffice) et parfois `roleCode` ; les listes renvoient `relationShip` (sic) | Uniformiser sur `roleCode` et `roleRelationship` dans le CRM |
| T12 | `MODULE_DEFAULTS` (`RESERVATION`, `MOBILE_ACCESS`, `ATTENDANCE_SHEET`) | `FEATURE_DEFAULTS` = `SALES: true, BILLING: true, SUPPORT: true, STATS: true` |
| T13 | `ClientsService.delete` exige la ressaisie du nom (`CLIENT_NAME_MISMATCH`) | Reprendre ce garde-fou pour la suppression/archivage d'un projet |
| T14 | `LEGAL_DOCUMENTS` pointe sur `periscolia.fr/cgu-periscolia` | **URLs factices pour le moment** (décision du 31/08/2026) : `https://oui-crm.example/cgu` et `https://oui-crm.example/rgpd`, version `1`. À remplacer par les CGU/RGPD de la plateforme quand elles existeront — changer l'URL sans bumper la version ne redemande pas le consentement |
| T15 | Mails : gabarits HTML avec charte Périscolia en constantes (`COLOR_PRIMARY = '#6C5CE7'`, `PLATFORM_NAME`) | Charte neutre OUI-CRM en constantes ; le nom du projet vient de `Settings.company.name` |

---

## 2. Manifeste par phase (SPEC-08)

### Phase 0 — Environnement

| Source soft-m | Cible | Action | Notes |
|---|---|---|---|
| `docker-compose.dev.yml` | idem | ADAPT | Déjà copié ; **ajouter** `minio` (+ `minio-init` : `mc mb`), `mailpit` (ports 1025/8025), variables associées |
| `.env.example` | idem | ADAPT | Ajouter les variables SPEC-03 §4 (JWT ×5, `*_CRYPTR_SECRET`, `MINIO_*`, `SMTP_*`, `SMTP_PROVIDER=mailpit`, `MAILPIT_SMTP_*`, `BCRYPT_ROUNDS`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`, `PLATFORM_NAME`, `EMAIL_FROM`, `BASE_URL`, `CORS_ORIGINS`) |
| `.prettierrc`, `.prettierignore` | idem | COPY | Absents du scaffold |
| `postman/run-tests.js`, `error-tests.postman_collection.json`, `local.postman_environment.json` | idem | ADAPT | Garder la structure et le runner ; remplacer les requêtes par celles de L0 (`x-project-id`, `PROJECT_*`) ; variables `superAdminEmail`, `projectAdminEmail`, `salesRepEmail` |

### Phase 1 — Schéma et seeds

| Source | Cible | Action | Notes |
|---|---|---|---|
| `schema.prisma` : `User`, `Session`, `ActivationToken`, `PasswordResetToken`, `EmailChangeToken`, `Role`, `Permission`, `RolePermission`, `UserRoleClient`, `AuditLog`, `ClientModule`, `File`, `EmailLog`, `InvoiceNumberSequence` | modèles L0 | ADAPT | `UserRoleClient` → `UserRoleProject` (+ `scopeId`, `initials`, `expiresAt` — SPEC-08 R1/R7) ; `Role` + `outOfScopeAccess`, `isSystem`, `projectId?`, unicité `(projectId, code)` ; `ScopeType` `ALL | PROJECT | OWN` ; `ClientModule` → `ProjectFeature` ; `AuditLog` + `projectId` ; `File` catégories CRM ; `InvoiceNumberSequence` → `DocumentNumberSequence` ; retirer `Device`, `deviceId`, `staffMember`, `legalResponsible`… |
| `prisma/seedAuth.ts` | idem | ADAPT | Même structure (`permissionsData`, `rolesData`, `rolePermMapping`, `deleteMany` + `createMany`, `upsert` des rôles) ; contenu = SPEC-06 §3-4 |
| `prisma/seedUsers.ts` | `prisma/seedDev.ts` | BASE | Reprendre la création du `SUPER_ADMIN` (relation `projectId = null`) ; ajouter projet Périscolia via bootstrap, 6 utilisateurs V8, référentiels, grille V8, gabarits, jeu de démo |
| `prisma/runSeed.ts`, `seed.ts` | idem | COPY | `seedAuth` toujours ; `seedDev` si `NODE_ENV=development` |
| `prisma/seedNotificationTypes.ts`, `seedParentStudents.ts` | — | SKIP | |

### Phase 2 — Common et infrastructure

| Source | Cible | Action | Notes |
|---|---|---|---|
| `common/messages.ts` | idem | BASE | Structure (`errorDefinitions` + `ApiMessages.errors.code/message` + `swagger.*`) conservée ; codes de §4 uniquement ; `clientIdHeaderDesc` → `projectIdHeaderDesc` |
| `common/pipes/*`, `common/decorators/api-common-responses`, `is-cuid`, `common/dto/*`, `common/utils/date.utils.ts`, `math.utils.ts`, `common/helper/file-response.helper.ts` | idem | COPY | Déjà présents pour la plupart |
| `common/decorators/is-date-range-valid`, `is-date-within-year-code-range`, `is-year-code-increment`, `is-iana-timezone` | — | SKIP | Spécifiques années scolaires / fuseaux ; **supprimer** du scaffold les trois déjà copiés |
| `common/helper/entity-unique-number.helper.ts` | idem | SKIP | Codes aléatoires familles/staff — pas de besoin |
| `common/helper/managed-email-change.helper.ts` | idem | COPY | Correction d'email par l'admin d'un compte `PENDING` (utile pour `PATCH /users/:id`) |
| `common/helper/scope.helper.ts` (`buildScopeWhere`) | `auth/utils/scope-filter.util.ts` | ADAPT | `CLIENT` → `PROJECT` ; `OWN` → champ propriétaire paramétré par objet (`ownerField`) ; retirer `SCHOOLS`/`FAMILY` |
| `common/legal/legal.constants.ts`, `legal.utils.ts` | idem | ADAPT | URLs factices `oui-crm.example` (T14) |
| `common/enums/contact.enum.ts` | idem | ADAPT | `CLIENT` → `PROJECT` |
| `common/guards/requires-module.guard.ts`, `decorators/requires-module.decorator.ts` | `requires-feature.*` | ADAPT | `ClientModule` → `ProjectFeature`, `FEATURE_NOT_ENABLED` → `FEATURE_NOT_ENABLED`, `req.clientIdHeader` → `req.projectId` |
| `common/pdf/periscolia-theme.ts` | — | SKIP (L5) | Thème PDF, à revoir pour les rapports |
| `storage/` (4 fichiers) | idem | ADAPT | Chemins `clients/{id}` → `projects/{id}` ; `assertStorageAccessScope(projectId, …)` ; MIME `text/html` (T7 — attention : `file-type` ne détecte pas le HTML par magic bytes, valider par parsing) ; `StorageContext.ENTITY_FILE.clientId` → `projectId` |
| `files/files.constants.ts` | idem | BASE | Tables `MAX_SIZE_BY_CATEGORY`, `ALLOWED_MIME_BY_CATEGORY`, `DEFAULT_EXTENSION_BY_CATEGORY`, `NEVER_DELETABLE`, `VALID_OWNER_TYPES_BY_CATEGORY`, `MIME_TO_EXT` avec les catégories CRM (`AVATAR`, `HTML_TEMPLATE`, `SIGNATURE_IMAGE`, `QUOTE_PDF`, `CONTRACT_PDF`, `SIGNED_RETURN`, `IMPORT_SOURCE`, `EXPORT_REPORT`) ; `NEVER_DELETABLE` = `QUOTE_PDF`, `CONTRACT_PDF`, `SIGNED_RETURN` |
| `files/file.service.ts`, `files.utils.ts`, `files.controller.ts` | idem | BASE | Voir T10 ; `FileOwnerType` = `USER`, `PROJECT`, `ORGANIZATION`, `QUOTE`, `CONTRACT`, `IMPORT_BATCH` |
| `mail/mail.module.ts`, `mail.service.ts`, `mail.constants.ts`, `email-log.service.ts` | idem | ADAPT | Garder `sendActivationEmail`, `sendPasswordResetEmail`, `sendEmailChangeConfirmEmail`, `sendEmailChangeSuccessEmail` ; retirer `invoiceAvailable`, `closureCancellation` ; charte (T15) |
| `mail/templates/activation-*`, `password-reset-*`, `email-change-*` + `constants/*` correspondants | idem | ADAPT | Copy et couleurs |
| `jobs/` | idem | COPY | |
| `health/` | idem | COPY | |
| `main.ts` | idem | ADAPT | Déjà copié ; ajouter `helmet()`, CORS `CORS_ORIGINS` + `exposedHeaders: ['Content-Disposition']`, `express-rate-limit` sur `/api/v1/auth` |
| `app.module.ts` | idem | ADAPT | Importer les modules L0 |

### Phase 3 — Authentification et guards

| Source | Cible | Action | Notes |
|---|---|---|---|
| `auth/auth.module.ts` | idem | COPY | 5 `JwtService` nommés, `PassportModule`, `MailModule` |
| `auth/auth.service.ts` | idem | ADAPT | T3 (verrouillage), T4 (statut) ; `expiresIn` renvoyé au login aussi (déjà calculé) |
| `auth/auth.controller.ts` | idem | COPY | 9 routes, décorateurs Swagger déjà en place |
| `auth/dto/*` (10 fichiers) | idem | COPY | |
| `auth/activation-token.service.ts`, `utils/activation-mail.utils.ts` | idem | COPY | Flux complet : token JWT chiffré `cryptr`, hash SHA-256 + bcrypt en base, renvoi automatique si expiré, consentements estampillés dans la transaction |
| `auth/reset-password.service.ts`, `utils/password-reset-mail.utils.ts` | idem | COPY | |
| `auth/email-change.service.ts`, `utils/email-change-mail.utils.ts` | idem | COPY | |
| `auth/strategies/jwt.strategy.ts` | idem | ADAPT | `userRoleClients` → `userRoleProjects` (+ `scope`, `project.features`) ; T4 ; charger les **overrides** et les appliquer dans `relations[i].permissions` |
| `auth/guards/jwt-auth.guards.ts` | idem | ADAPT | T2 |
| `auth/guards/tenant-scoped-guard.ts` | `project.guard.ts` | ADAPT | `x-client-id` → `x-project-id`, `CLIENT_IS_REQUIRED` → `PROJECT_IS_REQUIRED`, `TENANT_MISMATCH` → `PROJECT_MISMATCH`, `USER_HAS_NO_CLIENT` → `USER_HAS_NO_PROJECT` ; refuser une relation `expiresAt < now` ou `SUSPENDED` |
| `auth/guards/permissions.guard.ts` | idem | ADAPT | Les permissions de `relations[]` sont déjà corrigées par les overrides (calcul dans `JwtStrategy`) ; `scopeFilter` via l'util adapté |
| `auth/decorators/*` (4) | idem | ADAPT | `tenant-scoped` → `project-scoped` |
| `auth/interfaces/*`, `types/request-with-scope.interface.ts` | idem | ADAPT | `clientId` → `projectId`, `clientIdHeader` → `projectId` ; ajouter `outOfScopeAccess`, `scopeId`, `features` |
| `auth/enums/user-role.enum.ts` | idem | ADAPT | Codes SPEC-06 §4.1 |
| `auth/auth.utils.ts` (`hasAllScope`) | idem | COPY | |
| `mobile/**` | — | SKIP | |

### Phase 4 — Projets

| Source | Cible | Action | Notes |
|---|---|---|---|
| `clients/clients.controller.ts`, `clients.service.ts`, `clients.utils.ts`, `dto/*` | `projects/*` | BASE | `findAll / create / findOne / update / delete` repris ; champs `Project` (SPEC-02 §2.2) au lieu de SIRET/adresse ; `delete` → archivage avec ressaisie du nom (T13) ; `create` appelle `ProjectBootstrapService` |
| `clients/client-modules.controller.ts`, `.service.ts`, `.constants.ts`, `dto/*-client-modules.dto.ts` | `projects/project-features.*` | ADAPT | T12 ; retirer la règle nursery/reservation |
| `clients/client-services/**`, `client-timezone.constants.ts` | — | SKIP | |
| — | `projects/project-bootstrap.service.ts` | NEW | Transaction : `Settings` par défaut, `ReferenceItem` par défaut du CRM, `PricingGrid` v1, features, gabarits par défaut (SPEC-08 R6) |

### Phase 5 — Profil

| Source | Cible | Action | Notes |
|---|---|---|---|
| `profile/profile.controller.ts`, `profile.service.ts`, `dto/*` | idem | ADAPT | T9 ; `getMe` : `roleRelationships[]` → SPEC-06 §6 (`projectId`, `projectName`, `projectSlug`, `permissions[{code,scope,source}]`, `features`, `scope`, `outOfScopeAccess`, `expiresAt`) ; routes `GET /profile/me`, `GET /profile`, `PATCH /profile`, `PATCH /profile/change-password`, `PATCH/DELETE /profile/avatar` (chemins soft-m conservés, SPEC-07 US-00-03 à aligner) |
| `legal/legal.controller.ts`, `legal.service.ts`, `dto/*`, `legal.module.ts` | idem | COPY | `GET /legal/versions`, `POST /legal/accept` |

### Phase 6 — Utilisateurs, rôles, périmètres

| Source | Cible | Action | Notes |
|---|---|---|---|
| `user-backoffice/users-backoffice.service.ts`, `utils`, `dto/*`, `controller` | `users/*` | BASE | T8 : liste paginée, `findOne`, `create` (PENDING + activation), `update` (garde `CANNOT_UPDATE_OWN_ROLE`, `INVALID_STATUS_TRANSITION`, `EMPTY_UPDATE_PAYLOAD`), `delete` (garde `CANNOT_DELETE_SELF`) — projet-scopés via `UserRoleProject` |
| `users/users.service.ts` → `create()` (l. 117-204), `removeMembership()` (l. 430-445), `invite()` | `users/users.service.ts` | ADAPT | Rattachement d'un email existant à un nouveau projet (`displayOrder` suivant), suppression de la relation puis de l'utilisateur s'il n'a plus de projet ; `invite` = `resend-activation` |
| `users/users.utils.ts` (`buildWhereClause`, `getUserOrThrow`, `mapToUserListResponse`) | idem | ADAPT | `clientId` → `projectId` ; ajouter `scope`, `expiresAt`, `overridesCount` |
| `users/dto/*-structure*`, `query-user-schools-list` | — | SKIP | |
| — | `users/user-overrides.service.ts` | NEW | `PATCH /users/:id/overrides` (SPEC-06 §2) |
| `roles/roles.controller.ts`, `roles.service.ts`, `dto/*` | idem | ADAPT | Garder le filtre backoffice/non-backoffice ; ajouter `permissions[]` dans la réponse, `GET /permissions`, `POST /roles/:id/duplicate`, `PATCH /roles/:id`, `DELETE` (SPEC-07 US-00-06) |
| — | `scopes/*` (+ `ScopeService`, `GET /geo/regions`) | NEW | SPEC-02 §4.2, régions V8 (`REGIONS`, lignes 868-883 de la maquette) |

### Phase 7 — Réglages, gabarits, référentiels

| Source | Cible | Action | Notes |
|---|---|---|---|
| — | `settings/*` | NEW | Pattern `qf-brackets` (GET + upsert) ; upload de gabarit HTML via `FileService` catégorie `HTML_TEMPLATE`, validation des balises Handlebars ; upload de l'image de cachet (`SIGNATURE_IMAGE`) |
| — | `reference-items/*` | NEW | Pattern CRUD `backend-module` ; `assertExists` |

### Phase 8 — Journal

| Source | Cible | Action | Notes |
|---|---|---|---|
| modèle `AuditLog` | idem | ADAPT | soft-m n'a **pas de service** d'audit (table présente, écrite ponctuellement) → `AuditLogService.log(tx, …)` NEW, `GET /audit-log` NEW, export CSV via `sendFileAttachment` |

### Phase 9 — Jobs et qualité

| Source | Cible | Action | Notes |
|---|---|---|---|
| `jobs.service.ts` | idem | COPY | + worker `accounts.expire` NEW |
| `docs/tests/test-*.sh` (modèle) | `docs/tests/` | COPY | Helpers `check`, `check_contains`, `api_call`, `print_detail`, `login`, `db_run` — déjà dans `backend-module/templates.md` |
| `docs/*.feature` (format) | `docs/features/` | ADAPT | Gherkin entièrement en anglais (`Given` / `When` / `Then`, texte inclus — décision du 31/08/2026), `@nominal` / `@error` |
| `docs/dev-guide-*.md` | — | SKIP | Déjà transposés dans les skills |

---

## 3. Bilan volumétrique

| Action | Fichiers | Lignes (approx.) |
|---|---|---|
| COPY | 34 | ~2 600 |
| ADAPT | 31 | ~3 400 |
| BASE | 9 | ~1 900 (dont ~40 % conservés) |
| NEW | 12 modules/fichiers | ~2 500 à écrire |
| SKIP | ~60 | — |

Environ **70 % du lot L0 provient de soft-m**. Les parties neuves sont celles qui n'existent pas
chez soft-m : périmètres géographiques, overrides, bootstrap projet, réglages, référentiels,
journal en tant que service, rôles éditables.

---

## 4. Codes d'erreur repris de `messages.ts`

À copier tels quels (renommage `CLIENT` → `PROJECT` signalé par →) :

- Génériques : `INVALID_DATA`, `INVALID_CUID`, `INTERNAL_ERROR`, `UNAUTHORIZED`, `ACCESS_DENIED`,
  `EMPTY_UPDATE_PAYLOAD`, `EMPTY_PAYLOAD`, `INVALID_STATUS`, `INVALID_STATUS_TRANSITION`.
- Auth : `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_LOCKED`, `AUTH_USER_NOT_FOUND`, `TOKEN_EXPIRED`,
  `REFRESH_TOKEN_REQUIRED`, `REFRESH_TOKEN_INVALID_OR_EXPIRED`, `REFRESH_TOKEN_INVALID_OR_USED`,
  `REFRESH_TOKEN_EXPIRED`, `SESSION_NOT_FOUND`, `SESSION_REVOKED_OR_EXPIRED` ; **nouveau**
  `AUTH_ACCOUNT_NOT_ACTIVE` (T4).
- Guards : `CLIENT_IS_REQUIRED` → `PROJECT_IS_REQUIRED`, `TENANT_MISMATCH` → `PROJECT_MISMATCH`,
  `USER_HAS_NO_CLIENT` → `USER_HAS_NO_PROJECT`, `FEATURE_NOT_ENABLED` → `FEATURE_NOT_ENABLED`,
  `BACKOFFICE_FILTER_REQUIRED`.
- Activation / reset / email : `ACTIVATION_TOKEN_REQUIRED|INVALID|EXPIRED|SECRET_MISSING`,
  `LEGAL_CONSENT_REQUIRED`, `PASSWORD_RESET_TOKEN_REQUIRED|INVALID|EXPIRED|SECRET_MISSING`,
  `EMAIL_UNCHANGED`, `EMAIL_ALREADY_TAKEN`, `EMAIL_CHANGE_TOKEN_REQUIRED|NOT_FOUND|EXPIRED|SECRET_MISSING`,
  `USER_ACTIVE_EMAIL_SELF_SERVICE`, `USER_INACTIVE_EMAIL_CHANGE`, `EMAIL_SEND_FAILED`.
- Utilisateurs : `USER_NOT_FOUND`, `EMAIL_ALREADY_EXISTS`, `EMAIL_EXISTS_FOR_CLIENT` →
  `EMAIL_EXISTS_FOR_PROJECT`, `INVALID_ROLE`, `CANNOT_UPDATE_OWN_ROLE`, `CANNOT_DELETE_SELF`,
  `USER_ALREADY_ACTIVE`, `USER_INACTIVE`, `USER_SHOULD_BE_ACTIVE`, `USER_AVATAR_NOT_SET`,
  `OLD_PASSWORD_MISMATCH`, `PASSWORD_MUST_BE_DIFFERENT_FROM_OLD`, `USER_ALREADY_HAS_ROLE_FOR_CLIENT` →
  `…_FOR_PROJECT`, `USER_ROLE_CLIENT_RELATION_NOT_FOUND` → `USER_ROLE_PROJECT_NOT_FOUND`.
- Storage / fichiers : `STORAGE_FILE_TOO_LARGE`, `STORAGE_INVALID_MIME_TYPE`,
  `STORAGE_INVALID_MAGIC_BYTES`, `STORAGE_OBJECT_NOT_FOUND`, `STORAGE_UPLOAD_FAILED`,
  `STORAGE_DELETE_FAILED`, `STORAGE_ACCESS_DENIED`, `STORAGE_FILE_REQUIRED`, `FILE_NOT_FOUND`,
  `FILE_RETENTION_LOCKED`, `FILE_OWNER_CATEGORY_MISMATCH`, `FILE_OWNER_NOT_FOUND`,
  `FILENAME_INVALID_CHARS`, `FILE_CLIENT_OWNER_MISMATCH` → `FILE_PROJECT_OWNER_MISMATCH`.
- WebSocket (L5) : `WS_MISSING_TOKEN`, `WS_INVALID_SESSION`, `WS_TOKEN_EXPIRED`, `WS_UNAUTHORIZED`.
- Sections Swagger à reprendre : `auth`, `legal`, `profile`, `clients` → `projects`,
  `clientModules` → `projectFeatures`, `users`, `usersBackoffice` (fusionné dans `users`),
  `roles`, `files`, `health`.

---

## 5. Ce que la copie **ne** doit pas embarquer

`Device` / `deviceId` sur `Session`, stratégie `mobile-jwt`, `staffMember`, `legalResponsible`,
`userStructures`, `ContactRequest`, `NotificationType/Setting/Broadcast` (le modèle
notifications du CRM sera plus simple, L5), `client-services`, `timezone` par code postal,
décorateurs `is-year-code-*` / `is-date-within-year-code-range` / `is-iana-timezone` (à retirer
du scaffold), `periscolia-theme.ts`, gabarits mail `invoice-available` et `closure-cancellation`.

---

## 6. Ordre de copie recommandé (phase 2 → 6)

1. `common/` (messages vide + structure, legal, helpers, pipes, decorators) → `npm run build`.
2. `storage/`, `files/` (constantes CRM), `mail/`, `jobs/`, `health/` → build.
3. `auth/` complet + corrections T2/T3/T4, `main.ts`, `app.module.ts` → build, login/refresh
   testés en curl.
4. `projects/` (+ bootstrap, features) → seed dev possible.
5. `profile/`, `legal/` → `GET /profile/me` testé.
6. `users/` (base backoffice + rattachement), `roles/`, `scopes/` → matrice SPEC-06 vérifiée
   par script.

Chaque étape : build vert, script curl, `.feature`, revue du diff — avant la suivante.
