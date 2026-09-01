# OUI-CRM — Découpage en user stories et handoff front

> Découpage de SPEC-01/02 en stories livrables, une par capacité utilisateur. Chaque story porte
> son contrat d'API (routes, formes, erreurs, permissions) et son **handoff front** : l'écran de
> la maquette V8 qui sert de référence fonctionnelle et ce que le front doit afficher et gérer.
> **Le choix de l'UX appartient au développeur front**, qui dispose de la maquette
> `docs/Periscolia_OUICRM_V8.html` ; ce document ne décrit pas d'écrans, il décrit des données et
> des comportements.
> Références : SPEC-02 (routes, modèle), SPEC-03 (pattern), SPEC-04 (moteur), SPEC-05 (import),
> SPEC-06 (permissions).

---

## 0. Conventions communes à toutes les stories

| Sujet | Règle |
|---|---|
| Base | `/api/v1`, JSON, Swagger `/api/docs` (contrat figé à la fin de chaque lot backend) |
| Auth | `Authorization: Bearer <accessToken>` ; access 15 min, refresh 7 j ; `TOKEN_EXPIRED` → appeler `/auth/refresh` puis rejouer |
| Projet | Header `x-project-id` sur toute route marquée **[P]** ; absent → `400 PROJECT_IS_REQUIRED`, non autorisé → `403 PROJECT_MISMATCH` |
| Permission | Indiquée par story ; manquante → `403 ACCESS_DENIED`. Le front masque, le serveur décide |
| Module | Route marquée **[M:SALES]** etc. → `403 FEATURE_NOT_ENABLED` si le module n'est pas activé sur le projet |
| Listes | `?page=1&limit=20&sort=<champ>&order=asc|desc` + filtres ; réponse `{ data: T[], meta: { total, page, limit, totalPages } }` |
| Erreurs | `{ messages: { statusCode: "400", code: "…", text: "…", level: "error", details?: [], meta?: {…} } }` ; validation DTO → `400 INVALID_DATA` avec `text` listant les champs. `text` est humain, **jamais parsé** ; toute valeur exploitable arrive dans `meta`. **Registre des clés `meta`** (toute nouvelle clé est annoncée au handoff pour typage explicite côté front) : `lockedUntil` (ISO 8601 UTC, sur `423 AUTH_ACCOUNT_LOCKED`) |
| Identifiants | cuid ; invalide → `400 INVALID_CUID` |
| Dates | Dates métier `YYYY-MM-DD` ; horodatages ISO 8601 UTC |
| Montants | Nombres décimaux à 2 décimales (`238.8`), jamais formatés côté serveur sauf dans les documents Word |
| Lecture restreinte | Une fiche hors périmètre peut revenir **projetée** (champs réduits, `access: "RESTRICTED"`) : le front doit afficher l'état « suivi par X, statut Y » sans erreur |
| Suppression | Logique ; l'objet disparaît des listes, `404` ensuite |
| Transitions | Une route d'action `POST …/:id/<verbe>` quand la transition a son propre payload, sinon **une seule route** `POST …/:id/status { status, … }` pilotée par une table de transitions (décision du 31/08/2026, `projects`) ; transition invalide → `409 INVALID_STATUS_TRANSITION` |

Formes réutilisées :

```ts
UserRef      = { id, firstName, lastName, initials }
OrgRef       = { id, name, city, department, type }
ContactRef   = { id, civility, firstName, lastName, role, isPrimary }
ReferenceRef = { key, label }                       // valeur d'un référentiel
Money        = number                               // 2 décimales
```

---

## Lot L0 — Socle

### US-00-01 · Se connecter, rester connecté, se déconnecter
**En tant qu'** utilisateur, **je veux** me connecter avec email et mot de passe et rester connecté **afin de** travailler sans ressaisir mes identifiants.
- Règles : sessions à `version` (SPEC-03 §2.1) ; 5 échecs → verrouillage 15 min ; compte `PENDING` ou `INACTIVE` → refus.
- Permissions : aucune (routes publiques).
- API :
  - `POST /auth/login` `{ email, password }` → `200 { accessToken, refreshToken, expiresIn }` · `401 AUTH_INVALID_CREDENTIALS` · `423 AUTH_ACCOUNT_LOCKED` (**`messages.meta.lockedUntil`** = fin du verrouillage en ISO 8601 UTC ; `text` est humain, ne pas le parser) · `403 AUTH_ACCOUNT_NOT_ACTIVE`
  - `POST /auth/refresh` `{ refreshToken }` → `200 { accessToken, refreshToken, expiresIn }` · `401` avec `REFRESH_TOKEN_INVALID_OR_EXPIRED` (illisible), `REFRESH_TOKEN_INVALID_OR_USED` (rotation : ancien token rejoué), `SESSION_NOT_FOUND` (déconnecté), `AUTH_ACCOUNT_NOT_ACTIVE` (compte désactivé entre-temps) — tous → retour au login
  - `POST /auth/logout` (Bearer) → `204`
- Handoff front : écran V8 = aucun (la V8 a un sélecteur d'utilisateur libre, `renderSessionPicker`). Stocker les deux tokens ; intercepteur : sur `401 TOKEN_EXPIRED` refresh une fois puis rejouer, sur tout autre `401` déconnecter. **Le refresh doit être single-flight** (rotation à usage unique : deux refresh concurrents ⇒ le second reçoit `REFRESH_TOKEN_INVALID_OR_USED` et déconnecterait) — un seul refresh en vol, les requêtes en 401 attendent son résultat puis rejouent. Stratégie réactive retenue (décision du 31/08/2026) ; `expiresIn` reste disponible pour passer en refresh proactif (planifié à ~80 % de la durée) sans changement d'API si l'équipe le décide plus tard. Après login, appeler US-00-03. Le `423` porte l'heure de fin dans `messages.meta.lockedUntil` (ISO) — compte à rebours sur ce champ, jamais en parsant `text`. Livré le 31/08/2026 — `docs/features/auth.feature`.

### US-00-02 · Activer mon compte, réinitialiser mon mot de passe, changer d'email
**En tant que** nouvel utilisateur, **je veux** activer mon compte depuis l'email reçu en choisissant mon mot de passe et en acceptant les CGU/RGPD.
- Règles : token d'activation 72 h ; consentement CGU + RGPD obligatoire, versions estampillées ; reset 30 min ; changement d'email confirmé par lien 30 min.
- API (publiques sauf mention) :
  - `POST /auth/activation/validate` `{ token }` → `200 { email, firstName, lastName, legalDocuments: [{ code, version, url }] }` · `400 ACTIVATION_TOKEN_INVALID` · `410 ACTIVATION_TOKEN_EXPIRED`
  - `POST /auth/activation/complete` `{ token, password, acceptCgu: true, acceptRgpd: true }` → `200 { accessToken, refreshToken, expiresIn }` (session ouverte, plus besoin de login) · `400 LEGAL_CONSENT_REQUIRED` · `400 PASSWORD_TOO_WEAK` · `400/410` comme validate
  - `POST /auth/password-reset/request` `{ email }` → `200 { success: true }` toujours (pas de fuite d'existence ; e-mail envoyé seulement aux comptes ACTIVE)
  - `POST /auth/password-reset/validate` `{ token }` → `200 { valid: true }` · `400 PASSWORD_RESET_TOKEN_INVALID` · `410 PASSWORD_RESET_TOKEN_EXPIRED`
  - `POST /auth/password-reset/complete` `{ token, password }` → `200 { success: true }` ; toutes les sessions de l'utilisateur sont fermées · `400 PASSWORD_TOO_WEAK` · `400/410`
  - `POST /auth/email-change/request` (Bearer) `{ newEmail, currentPassword }` → `200 { success: true }` · `401 AUTH_INVALID_CREDENTIALS` · `400 EMAIL_UNCHANGED` · `409 EMAIL_ALREADY_TAKEN` · `403 USER_INACTIVE` ; `POST /auth/email-change/confirm` `{ token }` → `200 { success: true, email }` ; sessions fermées, avis envoyé à l'ancienne adresse · `404 EMAIL_CHANGE_TOKEN_NOT_FOUND` · `410 EMAIL_CHANGE_TOKEN_EXPIRED` · `409 EMAIL_ALREADY_TAKEN`
- Politique de mot de passe : **10 caractères minimum, au moins une lettre et un chiffre** (`PASSWORD_TOO_WEAK`, texte de la politique dans `text`).
- Handoff front : pages publiques `/activate?token=`, `/reset?token=`, `/email-change?token=` (base `FRONT_URL` côté API). Afficher les documents légaux retournés avant les cases à cocher. Sur `410` d'activation, indiquer qu'un nouveau lien vient d'être envoyé. Livré le 31/08/2026 — `docs/features/auth.feature`.

### US-00-03 · Voir mes projets et mes accès, choisir mon projet
**En tant qu'** utilisateur connecté, **je veux** voir les projets auxquels j'ai accès et ce que j'y peux faire **afin de** choisir mon espace de travail.
- Règles : SPEC-06 §6 — backoffice (`contactType = BACKOFFICE`, relation sans projet, scope `ALL`) vs non backoffice (une relation par projet) ; relations suspendues/expirées absentes.
- API (Bearer, **sans** `x-project-id` ; chemins soft-m conservés, décision du 31/08/2026 — revue KISS : `GET /profile` fusionné dans `/me`, pas de `GET /legal/versions`, les documents arrivent par `activation/validate` et `/profile/me`) :
  - `GET /profile/me` → `MeResponseDto` (SPEC-06 §6) **+ `phone` + `avatarUrl`** (presignée, null si absent) — l'unique lecture de profil
  - `PATCH /profile` `{ firstName?, lastName?, phone? }` → `{ id, email, firstName, lastName, phone }` · `400 EMPTY_UPDATE_PAYLOAD`
  - `PATCH /profile/change-password` `{ oldPassword, newPassword }` → `{ success: true }` ; **toutes les autres sessions fermées**, la courante conservée · `400 OLD_PASSWORD_MISMATCH` · `400 PASSWORD_TOO_WEAK` · `400 PASSWORD_MUST_BE_DIFFERENT_FROM_OLD`
  - `PATCH /profile/avatar` (multipart `file`, JPEG/PNG ≤ 2 Mo, magic bytes) → `{ avatarUrl }` — remplace l'existant · `400 STORAGE_*` ; `DELETE /profile/avatar` → `204` · `404 USER_AVATAR_NOT_SET`
  - `POST /legal/accept` `{ cgu?: true, rgpd?: true }` → `{ accepted, legalReacceptanceRequired }` (versions estampillées serveur) · `400 INVALID_DATA` si rien à accepter
- Handoff front : écran V8 = bandeau utilisateur + `renderSessionPicker` (à remplacer par un choix de projet). Une seule relation → sélection automatique. Mémoriser le projet courant et injecter `x-project-id` sur tous les appels **[P]**. Construire les gardes de navigation à partir de `roleRelationships[i].permissions` (`code` + `scope` + `source`) et `modules` — jamais pour décider. Si `legalReacceptanceRequired`, bloquer l'app (hors backoffice) et afficher `legalDocumentsToAccept` → `POST /legal/accept`. Le backoffice voit un sélecteur de projet libre (`GET /projects`). Livré le 31/08/2026 — `docs/features/profile.feature`.

### US-00-04 · Administrer les projets (backoffice)
**En tant qu'** opérateur de la plateforme, **je veux** créer un projet et activer ses modules.
- Permissions : `projects:read|create|update` (scope `ALL`, backoffice). Routes plateforme : **pas de header `x-project-id`**.
- Cycle de vie (décision du 31/08/2026) : un projet est créé en **`DRAFT`** (configurable par le backoffice, fermé à ses utilisateurs : `403 PROJECT_NOT_ACTIVE` sur toute route projet), ouvert, fermé ou rouvert par `POST /projects/:id/status`. Le `slug` est immuable.
- API :
  - `GET /projects?page&limit&status&search` → `{ data: [{ id, slug, name, productName, status, features: ["SALES",…] (activées), userCount, createdAt }], meta }`
  - `POST /projects` `{ slug, name, productName, description?, copyFromProjectId? }` → `201 { id, slug }` · `409 PROJECT_SLUG_EXISTS` · `404 PROJECT_NOT_FOUND` (source de copie) · `400 INVALID_DATA` (slug `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–50)
  - `GET /projects/:id` → `{ id, slug, name, productName, description, status, activatedAt, features: [{ code, enabled }] (tous les codes), userCount, createdAt, updatedAt }`
  - `PATCH /projects/:id` `{ name?, productName?, description? }` → `200 { id, slug }` · `400 EMPTY_UPDATE_PAYLOAD` · `409 PROJECT_ARCHIVED`
  - `PATCH /projects/:id/features` `{ features: ["SALES","BILLING"] }` = ensemble **activé** (les autres passent à `false`) → `200 { features: [{ code, enabled }] }` · `409 PROJECT_ARCHIVED`
  - `POST /projects/:id/status` `{ status: "ACTIVE" | "ARCHIVED", name? }` → `204` — **une seule route** (décision du 31/08/2026) pilotée par la table `DRAFT → ACTIVE`, `ACTIVE → ARCHIVED` (nom exact obligatoire), `ARCHIVED → ACTIVE` · `409 INVALID_STATUS_TRANSITION` · `400 PROJECT_NAME_MISMATCH` · `400 INVALID_DATA` (`DRAFT` n'est jamais une cible)
  - `GET /projects/:id/config-export` → XLSX (`Content-Disposition: attachment; filename="<slug>-config-<date>.xlsx"`), feuilles `Settings`, `StageProbabilities`, `ReferenceItems`, `Scopes`, `Users` — permission `projects:read` (backoffice ; SPEC-10 §4 disait `settings:read`, l'export côté projet viendra avec `/settings` en phase G si besoin)
  - Toutes les opérations écrivent dans `AuditLog` (`project.create|update|features.update|activate|archive|restore|config.export`).
- Handoff front : pas d'écran V8 (nouveau). Création d'un projet = bootstrap automatique (SPEC-10 §3.1 : réglages, référentiels génériques, périmètre « Tout le territoire », features, grille v1 vide) ou copie de la configuration d'un projet existant (`copyFromProjectId` : réglages sauf identité société, pondération, features, référentiels, périmètres, grille active → v1, gabarits + cachet — jamais organismes, utilisateurs, devis) ; la configuration métier se fait ensuite par les écrans ou par l'import `PROJECT_CONFIG` (US-01-06). Livré le 31/08/2026 — `docs/features/projects.feature`.

### US-00-05 · Gérer les utilisateurs de mon projet
**En tant qu'** administrateur de projet, **je veux** créer un compte (qui reçoit un email d'activation), lui donner un rôle, un périmètre, une expiration, des surcharges, et le désactiver.
- Règles : email unique global ; un utilisateur déjà existant sur un autre projet est **rattaché** (pas recréé) ; externes → `expiresAt` obligatoire ; surcharges = permissions ajoutées/retirées (SPEC-06 §2).
- Permissions : `users:read|create|update|delete`, `[P]`.
- API :
  - `GET /users?search&roleCode&status` → `{ data: [{ id, email, firstName, lastName, initials, status, roleCode, roleLabel, scope: { id, name }, expiresAt, isExternal, overridesCount: { added, removed }, lastLoginAt }] }`
  - `POST /users` `{ email, firstName, lastName, initials, roleCode, scopeId, isExternal, expiresAt? }` → `201 { id, status }` (`PENDING` créé, `ACTIVE` rattaché/réactivé) · `409 EMAIL_EXISTS_FOR_PROJECT` · `409 INITIALS_ALREADY_USED` · `400 INVALID_ROLE` · `400 EXPIRATION_REQUIRED_FOR_EXTERNAL`
  - `GET /users/:id` → détail + `permissions: [{ code, scope, source }]`
  - `PATCH /users/:id` `{ roleCode?, scopeId?, expiresAt?, firstName?, lastName?, initials? }`
  - `PATCH /users/:id/overrides` `{ added: ["quotes:validate"], removed: ["organizations:export"] }` → permissions effectives
  - `POST /users/:id/resend-activation` → `200`
  - `DELETE /users/:id` → `204` — affectation `SUSPENDED` (réversible : re-`POST /users` avec le même e-mail **réactive** avec le rôle/périmètre soumis) ; sessions révoquées **seulement si** l'utilisateur n'a plus aucune affectation active · `400 CANNOT_DELETE_SELF` · `409 USER_IS_LAST_ADMIN` (dernier rôle portant `users:update`)
  - Précisions livrées : `status` de la liste = statut du compte **ou** `SUSPENDED` (affectation) — filtre identique ; `isExternal` est **dérivé** (`expiresAt` renseigné, le flag n'existe qu'à la création pour exiger la date) ; `409 EMAIL_EXISTS_FOR_PROJECT` (code livré) ; overrides = **remplacement de l'ensemble** (idempotent), réponse = permissions effectives ; audit `user.*` sur chaque opération.
- Handoff front : écran V8 = Paramètres › Utilisateurs (`SETPANE.users`, `openUserModal`, `surchargesHTML`). Afficher l'écart de surcharges (« +2, −1 »). Les rôles disponibles viennent de US-00-06, les périmètres de US-00-07. Livré le 01/09/2026 — `docs/features/users.feature`.

### US-00-06 · Consulter et adapter les rôles
**En tant qu'** administrateur de projet, **je veux** voir la matrice des rôles et dupliquer un rôle système pour l'adapter.
- Règles : rôles système non modifiables ; duplication → rôle du projet éditable ; `outOfScopeAccess` porté par le rôle (SPEC-06 §4.1).
- Permissions : `roles:read|update`, `[P]`.
- API : `GET /roles` → `{ data: [{ id, code, label, isSystem, isBackoffice, outOfScopeAccess, permissions: [{ code, scope }], usersCount }] }` · `GET /permissions` → catalogue `[{ code, module, action, label }]` · `POST /roles/:id/duplicate` `{ code, label }` → `201` · `PATCH /roles/:id` `{ label?, outOfScopeAccess?, permissions: [{ code, scope }] }` · `403 ROLE_IS_SYSTEM` · `DELETE /roles/:id` · `409 ROLE_IN_USE`.
- Précisions livrées : `GET /roles` renvoie les rôles système **non backoffice** + ceux du projet (`isBackoffice` n'est pas exposé — jamais vrai ici) ; `usersCount` = affectations actives du projet ; `PATCH` `permissions` = **remplacement complet** des grants, scope `ALL` refusé (`400 INVALID_DATA`, réservé au backoffice), code inconnu `400 PERMISSION_NOT_FOUND` ; `duplicate` copie les grants et `outOfScopeAccess`, `409 ROLE_CODE_EXISTS` si le code existe (projet **ou** système) ; `404 ROLE_NOT_FOUND` pour un rôle backoffice ou d'un autre projet ; `DELETE` refuse tant qu'une affectation (même suspendue) référence le rôle. Audit `role.*`.
- Handoff front : écran V8 = Paramètres › Rôles et droits (`SETPANE.roles`, `openRoleModal`, `dupRole`). La matrice 13 objets × 5 verbes de la V8 se rend depuis `GET /permissions` groupé par `module`. Livré le 01/09/2026 — `docs/features/roles.feature`.

### US-00-07 · Gérer les périmètres géographiques
**En tant qu'** administrateur de projet, **je veux** définir des périmètres (régions, départements, portefeuille, nature) et les affecter aux utilisateurs.
- Permissions : `scopes:read|update`, `[P]`.
- API : `GET /scopes` → `{ data: [{ id, name, description, regions: [], departments: [], portfolioOnly, nature, campaignIds: [], usersCount, resolvedDepartments: [] }] }` · `POST /scopes` · `PATCH /scopes/:id` · `DELETE /scopes/:id` · `409 SCOPE_IN_USE` · `GET /geo/regions` → `[{ name, departments: [] }]` (statique).
- Handoff front : écran V8 = Paramètres › Périmètres (`openPerimetreModal`, `regionsHTML`, `countPerimetre`). `resolvedDepartments` évite au front de recalculer régions → départements.

### US-00-08 · Régler mon projet
**En tant qu'** administrateur de projet, **je veux** renseigner l'identité de la société, le signataire, la TVA, le plafond de remise, les objectifs, la validité des devis, le préavis, l'engagement par défaut, la durée de conservation.
- Permissions : `settings:read|update`, `[P]`.
- API : `GET /settings` → `{ vatRate, revenueTarget, meetingTarget, quoteValidityDays, noticeMonths, defaultCommitmentMonths, discountCap, retentionMonths, stageProbabilities: { QUALIFICATION, DEMONSTRATION, QUOTE_SENT, NEGOTIATING, VERBAL_AGREEMENT, WON, LOST }, company: { name, siren, siret, rcs, address, phone, email, signatory } }` · `PATCH /settings` (partiel) · `GET /settings/documents` → gabarits actifs `[{ type, version, fileName, uploadedAt }]` + `signatureImage: { fileId, fileName } | null` · `POST /settings/documents/:type` (multipart `.html`) → nouvelle version active · `400 TEMPLATE_INVALID` (balises Handlebars manquantes ou rendu d'essai en échec, `details`) · `POST /settings/signature-image` (multipart PNG/JPEG ≤ 2 Mo) · `GET /settings/documents/:type/preview` → PDF d'essai sur données fictives.
- Handoff front : écrans V8 = Paramètres › Société, Règles commerciales, Documents et numérotation (`SETPANE.societe`, `regles`, `documents`). Les formats de numérotation sont fixes (SPEC-01 §4.3) : afficher des exemples, pas de saisie.

### US-00-09 · Administrer les référentiels
**En tant qu'** administrateur de projet, **je veux** ajouter ou désactiver une valeur de liste (type de structure, source de lead, solution concurrente, service, étiquette, type d'action, catégorie de ticket…).
- Règles : une valeur utilisée ne se supprime pas, elle se désactive ; `key` immuable.
- Permissions : `references:read` (tous les rôles ayant `organizations:read`), `references:update`, `[P]`.
- API : `GET /reference-items?category=` → `{ data: [{ id, category, key, label, order, active, metadata, usageCount }] }` · `POST /reference-items` `{ category, key, label, order?, metadata? }` · `PATCH /reference-items/:id` `{ label?, order?, active?, metadata? }` · `409 REFERENCE_KEY_EXISTS`.
- Handoff front : écran V8 = Paramètres › Référentiels (`SETPANE.referentiels`, figé dans la V8 — devient éditable). Charger tous les référentiels une fois au choix du projet et les mettre en cache : toutes les listes déroulantes de l'application en dépendent.

### US-00-10 · Consulter le journal d'activité
**En tant que** direction ou administrateur, **je veux** voir qui a fait quoi et exporter le journal.
- Permissions : `auditLog:read|export`, `[P]`.
- API : `GET /audit-log?from&to&userId&action&objectType&objectId` → `{ data: [{ id, createdAt, user: UserRef|null, action, objectType, objectId, objectLabel, metadata, ip }] }` · `POST /exports/audit-log` (US-05-03).
- Handoff front : écran V8 = Paramètres › Journal d'activité (`SETPANE.journal`, `exportJournal`). `objectLabel` (numéro de devis, nom d'organisme) est résolu côté serveur.

---

## Lot L1 — Base commerciale

### US-01-01 · Rechercher et lister les organismes
**En tant que** commercial, **je veux** retrouver les organismes de mon périmètre par recherche, filtres et tri, avec l'état de leur suivi.
- Règles : filtrage périmètre + `scopeFilter` (SPEC-02 §4.2) ; hors périmètre → projection restreinte si le rôle le permet ; recherche trigram sur nom, ville, SIRET.
- Permissions : `organizations:read`, `[P]`, **[M:SALES]**.
- API : `GET /organizations?search&type&department&region&salesStatus&customerStatus&priority&tag&solution&salesRepId&leadSource&completenessMax&sort&order&page&limit` → `{ data: [{ id, name, type, city, department, population, bracketLabel, salesStatus, customerStatus, priority, tags, solution: ReferenceRef, salesRep: UserRef|null, lastActivityAt, nextActivityAt, completeness: { score, missing: [] }, access: "FULL"|"RESTRICTED" }], meta }` — en `RESTRICTED` seuls `id, name, type, city, department, salesStatus, customerStatus, salesRep, access` sont présents.
- Handoff front : écran V8 = Organismes (`RENDER.organismes`, `filterBar`, `drawOrgRows`, `setSort`). Les valeurs de filtres viennent des référentiels (US-00-09) et de `GET /users`. Le compteur « fiches incomplètes » de la V8 = filtre `completenessMax=99`.

### US-01-02 · Créer un organisme
**En tant que** commercial, **je veux** créer une fiche en la pré-remplissant depuis le registre officiel, ou à la main, sans créer de doublon.
- Règles : recherche registre par nom ou SIRET, dégradée si indisponible ; doublon sur SIRET (409) puis sur nom + code postal (avertissement, `force: true` pour passer outre) ; strate calculée ; type ∈ référentiel `STRUCTURE_TYPE`.
- Permissions : `organizations:create`, `[P]`.
- API :
  - `GET /organizations/search-registry?q=` → `{ data: [{ name, siret, siren, address, postalCode, city, inseeCode, department, isActive }] }` · `503 REGISTRY_UNAVAILABLE` · `504 REGISTRY_TIMEOUT` (le front bascule en saisie manuelle)
  - `POST /organizations` `{ name, type, displayPrefix?, siret?, inseeCode?, address?, postalCode?, city?, department, population?, epci?, phone?, email?, website?, solution?, leadSource?, priority?, tags?, salesRepId?, notes?, force?: boolean }` → `201 { id, name, completeness }` · `409 ORGANIZATION_SIRET_EXISTS` · `409 ORGANIZATION_POSSIBLE_DUPLICATE` (`details: [{ id, name, city }]`, relancer avec `force: true`) · `400 INVALID_REFERENCE_VALUE`
- Handoff front : écran V8 = `openCreateOrg`, `createMode`, `lookupEntreprise`, `buildManualForm`, `checkDup`. Le contact principal se crée ensuite (US-01-04).

### US-01-03 · Consulter et modifier une fiche organisme
**En tant que** commercial, **je veux** voir la synthèse d'un organisme (identité, environnement, suivi, complétude) et la corriger.
- Règles : accès `NONE` → 404 ; `RESTRICTED` → projection ; statuts modifiables uniquement par les routes d'action (US-01-10) et automatismes ; population absente signalée (bloque le devis, SPEC-04 déc. 5).
- Permissions : `organizations:read`, `organizations:update`, `[P]`.
- API : `GET /organizations/:id` → tous les champs + `bracketLabel`, `region`, `salesRep`, `consultant`, `trainer` (UserRef), `completeness`, `counts: { contacts, activities, opportunities, quotes, contracts, tickets, trainings }`, `access` · `GET /organizations/:id/completeness` → `{ score, missing: ["SIRET","POPULATION",…], blocks: { quote: bool, contract: bool } }` · `PATCH /organizations/:id` (mêmes champs que la création, tous optionnels, hors statuts) → `200` détail.
- Handoff front : écran V8 = panneau latéral onglet Synthèse (`openDrawer`, `paneHTML('synthese')`, `openDrawerRestreint`). Les onglets Contacts / Actions / Commercial / Client / Support correspondent aux stories US-01-04, US-01-08, US-02-03/09, US-03/04, US-04-03 ; les masquer selon `permissions`.

### US-01-04 · Gérer les contacts d'un organisme
**En tant que** commercial, **je veux** enregistrer les interlocuteurs, désigner le représentant légal et marquer ceux qui refusent d'être démarchés.
- Règles : au plus un `isPrimary` (le nouveau remplace) ; `optOut` exclut des campagnes ; email requis pour être ciblé par une campagne email.
- Permissions : `contacts:read|create|update|delete`, `[P]`.
- API : `GET /organizations/:id/contacts` → `{ data: [ContactRef + { email, phone, mobile, optOut, notes, extractedFromNote }] }` · `POST /organizations/:id/contacts` `{ civility, firstName, lastName, role, email?, phone?, mobile?, isPrimary?, optOut?, notes? }` → `201` · `PATCH /contacts/:id` · `DELETE /contacts/:id` → `204` · `409 CONTACT_HAS_ACTIVITIES` (proposer la désactivation).
- Handoff front : écran V8 = onglet Contacts (`openContactModal`, `saveContact`). `extractedFromNote = true` = contact issu de l'import, à vérifier.

### US-01-05 · Agir sur plusieurs organismes à la fois
**En tant que** commercial ou directeur, **je veux** affecter un commercial, changer le statut, ajouter à une campagne ou supprimer plusieurs fiches sélectionnées.
- Règles : seules les fiches en accès `FULL` sont traitées ; les autres sont comptées en `skipped` ; suppression logique, refusée si contrat.
- Permissions : `organizations:bulk` (+ `organizations:delete` pour `DELETE`), `[P]`.
- API : `POST /organizations/bulk` `{ ids: [], action: "ASSIGN_SALES_REP"|"SET_SALES_STATUS"|"SET_PRIORITY"|"ADD_TO_CAMPAIGN"|"DELETE", payload: { salesRepId? | salesStatus? | priority? | campaignId? } }` → `200 { processed, skipped: [{ id, reason }] }`.
- Handoff front : écran V8 = barre de sélection (`drawBulk`, `bulkSet`, `bulkCampaign`, `bulkDelete`). Sélection « tout » = ids de la page courante ou requête `?selectAll=true` avec les mêmes filtres que la liste (`filters` renvoyés dans le payload).

### US-01-06 · Importer des organismes (fichier XLSX/CSV, dont le classeur de reprise)
**En tant qu'** administrateur, **je veux** importer un fichier, voir le rapport en simulation, puis confirmer.
- Règles : SPEC-05 ; profils `GENERIC` (gabarit téléchargeable), `OUICRM_V2_1` (reprise) et `PROJECT_CONFIG` (configuration du projet depuis l'onglet ⚙️ Paramètres ou le gabarit — SPEC-10 §3.3, permissions `settings:update` + `references:update` + `scopes:update`) ; `dryRun` d'abord ; lot annulable tant qu'aucune fiche n'a été modifiée.
- Permissions : `organizations:import`, `[P]`.
- API : `GET /import/template?profile=GENERIC` → `.xlsx` · `POST /import?profile=&dryRun=true` (multipart) → `200 ImportReport { dryRun, ok, batchId?, totals: { created, updated, skipped, errors, warnings }, resources: [{ resource, created, updated, skipped }], errors: [{ sheet, row, field?, code, message }], warnings: [...] }` · `POST /import?profile=&dryRun=false` → idem avec `batchId` · `POST /import/errors-pdf` (rapport) → `.pdf` · `DELETE /import/batches/:batchId` → `204` · `409 IMPORT_BATCH_MODIFIED` · `413 IMPORT_TOO_MANY_ROWS`.
- Handoff front : écran V8 = `openImport`, `parseImport`, `runImport` (limité au CSV dans la V8). Afficher le rapport ligne par ligne avec le numéro de ligne Excel ; ne proposer la confirmation que si `ok = true` ou après acquittement des avertissements.

### US-01-07 · Exporter la base
**En tant que** directeur ou administrateur, **je veux** exporter la liste filtrée des organismes.
- Règles : export = fichier commercial hors de l'entreprise → permission rare, journalisé avec le volume.
- Permissions : `organizations:export`, `[P]`.
- API : `POST /exports/organizations-list` `{ format: "CSV"|"XLSX", filters: {…mêmes filtres que US-01-01…}, columns?: [] }` → `200` fichier (`Content-Disposition`) ou `202 { jobId }` au-delà de 2 000 lignes, puis `GET /exports/jobs/:jobId` → `{ status, downloadUrl }`.
- Handoff front : écran V8 = `exportOrgsCSV`. Gérer les deux réponses (synchrone / asynchrone).

### US-01-08 · Planifier et réaliser une action
**En tant que** commercial, **je veux** planifier un appel, un RDV, une démo ou une relance, puis la clôturer avec un compte rendu et un résultat.
- Règles : réaliser une action passe l'organisme `NOT_CONTACTED`/`TO_CONTACT` → `IN_PROGRESS` ; planifier un RDV ou une démo → `MEETING_SCHEDULED` ; type et résultat ∈ référentiels ; scope `OWN` pour un commercial (ses actions).
- Permissions : `activities:read|create|update|delete`, `[P]`.
- API : `GET /activities?organizationId&userId&status&type&from&to` → `{ data: [{ id, organization: OrgRef, contact: ContactRef|null, user: UserRef, type: ReferenceRef, date, time, durationMin, location, status, report, result: ReferenceRef|null, campaign: { id, name }|null }] }` · `POST /activities` `{ organizationId, contactId?, type, date, time?, durationMin?, location?, report?, campaignId? }` → `201` · `PATCH /activities/:id` · `POST /activities/:id/complete` `{ report, result?, completedAt? }` → `200` · `POST /activities/:id/cancel` · `DELETE /activities/:id`.
- Handoff front : écran V8 = onglet Actions et `openActionModal`, `saveAction`. La liste d'une fiche = `GET /activities?organizationId=`. « Actions en retard / du jour » du tableau de bord = `status=PLANNED&to=today`.

### US-01-09 · Voir mon agenda et l'exporter vers Outlook
**En tant que** commercial ou formateur, **je veux** voir dans une seule vue mes actions, formations, échéances de contrat et fins de validité de devis.
- Permissions : `activities:read` (agenda), `[P]`.
- API : `GET /agenda?from&to&userId&kinds=ACTIVITY,TRAINING,CONTRACT_END,QUOTE_EXPIRY` → `{ data: [{ kind, id, date, time?, title, subtitle, organization: OrgRef, user: UserRef|null, status, isLate }] }` · `GET /activities/:id/ics` → `text/calendar` (RDV physiques et démonstrations uniquement, sinon `400 ICS_NOT_AVAILABLE`).
- Handoff front : écran V8 = Agenda (`RENDER.agenda`, `agendaCalendrier`, `agendaListe`, `exportICS`). Une seule requête par mois affiché.

### US-01-10 · Suivre la prospection en kanban
**En tant que** commercial, **je veux** faire avancer un organisme d'un statut commercial à l'autre.
- Règles : transitions libres entre les 5 statuts sauf `CLOSED` ← automatique aussi ; `CLOSED` remis en `TO_CONTACT` après 6 mois par un job ; motif facultatif.
- Permissions : `organizations:update`, `[P]`.
- API : `GET /organizations/board` → `{ columns: [{ salesStatus, count, items: [OrgRef + { priority, tags, salesRep, nextActivityAt, lastActivityAt }] }] }` (périmètre appliqué, limite 200 par colonne + `hasMore`) · `POST /organizations/:id/sales-status` `{ salesStatus, reason? }` → `200` · `409 ORGANIZATION_INVALID_TRANSITION`.
- Handoff front : écran V8 = Suivi prospection (`RENDER.prospection`, drag & drop). `dnd-kit` côté front ; en cas de 409, replacer la carte.

### US-01-11 · Mener une campagne
**En tant que** commercial, **je veux** figer une liste cible, la travailler et mesurer ce qu'elle produit.
- Règles : ajout d'organismes → `TO_CONTACT` s'ils étaient `NOT_CONTACTED` ; les contacts `optOut` sont exclus des ciblages email (hors périmètre de ce lot : pas d'envoi d'email de masse).
- Permissions : `campaigns:read|create|update|delete`, `[P]`.
- API : `GET /campaigns` → `{ data: [{ id, name, status, owner: UserRef, startDate, endDate, criteria, organizationsCount, results: { activities, opportunities, quotes, signed } }] }` · `POST /campaigns` `{ name, description?, criteria?, ownerId?, startDate?, endDate? }` · `PATCH /campaigns/:id` · `POST /campaigns/:id/status` `{ status }` · `POST /campaigns/:id/organizations` `{ ids: [] }` → `{ added, alreadyIn }` · `DELETE /campaigns/:id/organizations/:orgId` · `GET /campaigns/:id/organizations` (liste paginée) · `GET /campaigns/:id/results` → détail par organisme.
- Handoff front : écran V8 = Campagnes (`RENDER.campagnes`, `openCampaignModal`). L'ajout depuis la liste d'organismes passe par US-01-05.

### US-01-12 · Rechercher partout
**En tant qu'** utilisateur, **je veux** taper un nom, un numéro de devis ou de contrat et trouver l'objet.
- Permissions : celles de chaque type retourné (les types non autorisés sont omis), `[P]`.
- API : `GET /search?q=` → `{ organizations: [OrgRef], contacts: [ContactRef + { organization: OrgRef }], quotes: [{ id, number, organization, status, firstYearHt }], contracts: [{ id, number, organization, status }] }` (10 par type).
- Handoff front : écran V8 = `openGlobalSearch`, `globalSearch`.

### US-01-13 · Supprimer un organisme
**En tant que** directeur, **je veux** supprimer une fiche créée par erreur.
- Règles : logique ; refus si contrat ; purge définitive uniquement par RGPD (US-06-01).
- Permissions : `organizations:delete`, `[P]`.
- API : `DELETE /organizations/:id` → `204` · `409 ORGANIZATION_HAS_CONTRACTS`.

---

## Lot L2 — Cycle de vente

### US-02-01 · Gérer la grille tarifaire
**En tant qu'** administrateur de projet, **je veux** consulter la grille active, en préparer une nouvelle version et l'activer à une date.
- Règles : SPEC-04 ; une grille = strates × formules × options × frais × extras ; nouvelle version = copie modifiable ; activation → les devis brouillons se recalculent, les devis soumis restent figés.
- Permissions : `pricing:read`, `pricing:update`, `[P]`, **[M:SALES]**.
- API : `GET /pricing-grids` → `{ data: [{ id, version, effectiveDate, active, createdBy: UserRef, createdAt, quotesCount }] }` · `GET /pricing-grids/active` et `GET /pricing-grids/:id` → `{ id, version, content: PricingGridContent }` · `POST /pricing-grids` `{ fromVersion?, content, effectiveDate }` → `201` · `400 PRICING_GRID_INVALID` (`details` : tableaux de prix de longueur ≠ nombre de strates) · `POST /pricing-grids/:id/activate` → `200`.
- Handoff front : écran V8 = Paramètres › Grille tarifaire (`SETPANE.tarifs`, `setPrice`, `openStrateModal`, `normaliserStrates`, `openOptionModal`…). Le serveur ne « cale » plus les tableaux silencieusement : il refuse une grille incohérente.

### US-02-02 · Simuler un devis en temps réel
**En tant que** commercial, **je veux** voir le montant se mettre à jour à chaque changement de formule, d'option, de remise ou de date.
- Règles : SPEC-04 §2-3 ; calcul serveur unique ; population obligatoire.
- Permissions : `quotes:read`, `[P]`, **[M:SALES]**.
- API : `POST /quotes/simulate` `{ organizationId, config: QuoteConfig, startDate, pricingGridId? }` → `200 QuoteResult` (SPEC-04 §2.2, lignes, `mrrList`, `mrrNet`, `oneShot`, `firstYear`, `multiYear`, `maxDiscount`, `requiresValidation: bool`) · `400 ORGANIZATION_POPULATION_REQUIRED` · `400 PRICING_PLAN_UNKNOWN`.
- Handoff front : écran V8 = `openQuoteModal`, `refreshQuote`, `setOpt`, `setExtra`. Débounce ~200 ms sur les saisies ; afficher `requiresValidation` (remise > plafond) avant la soumission.

### US-02-03 · Créer et modifier un devis brouillon
**En tant que** commercial, **je veux** enregistrer un devis (initial, additionnel ou de renouvellement) rattaché à un organisme et à une opportunité.
- Règles : numéro attribué à la création (`DEV-AAAA-QQQ-II001`) ; modifiable tant que `DRAFT` ; suppression possible en `DRAFT` seulement ; rattaché à l'opportunité ouverte de l'organisme (créée si absente).
- Permissions : `quotes:create|update|delete` (scope `OWN` pour un commercial), `[P]`, **[M:SALES]**.
- API : `GET /quotes?organizationId&opportunityId&status&ownerId&from&to` → `{ data: [{ id, number, legacyNumber, origin, type, status, organization: OrgRef, owner: UserRef, issueDate, validUntil, startDate, plan, mrrNet, oneShotTotal, firstYearHt, maxDiscount, requiresValidation, signedAt }] }` · `POST /quotes` `{ organizationId, opportunityId?, type, config, startDate? }` → `201 { id, number }` · `GET /quotes/:id` → détail + `config`, `result: QuoteResult`, `lines: QuoteLine[]`, `documents: [{ id, fileName, createdAt }]`, `history: [{ status, at, by }]` · `PATCH /quotes/:id` `{ config?, startDate?, type? }` · `409 QUOTE_NOT_EDITABLE` · `DELETE /quotes/:id` · `409 QUOTE_NOT_DELETABLE`.
- Handoff front : écran V8 = Devis (`RENDER.devis`, `saveQuote`, `deleteQuote`). Un devis `origin = IMPORTED` s'affiche avec ses montants mais sans configurateur ni génération Word.

### US-02-04 · Soumettre un devis
**En tant que** commercial, **je veux** envoyer mon devis ; s'il dépasse le plafond de remise, il part en validation.
- Règles : fige lignes et grille ; `maxDiscount > discountCap` → `PENDING_VALIDATION` + notification aux valideurs, sauf si le commercial a `quotes:discountAboveCap` ; sinon `SENT` ; opportunité → `QUOTE_SENT` ; organisme → `IN_PROGRESS`.
- Permissions : `quotes:submit`, `[P]`.
- API : `POST /quotes/:id/submit` → `200 { status: "SENT"|"PENDING_VALIDATION", requiresValidation }` · `409 QUOTE_INVALID_TRANSITION` · `400 ORGANIZATION_POPULATION_REQUIRED`.
- Handoff front : écran V8 = même modale, statut « À valider » dans la liste (`QUOTE_STATUS`).

### US-02-05 · Valider ou refuser un devis en attente
**En tant que** direction commerciale, **je veux** approuver ou renvoyer en brouillon un devis au-delà du plafond.
- Permissions : `quotes:validate`, `[P]`.
- API : `GET /quotes?status=PENDING_VALIDATION` · `POST /quotes/:id/validate` → `200 { status: "SENT" }` · `POST /quotes/:id/reject` `{ reason? }` → `200 { status: "DRAFT" }` · `409 QUOTE_INVALID_TRANSITION`.
- Handoff front : écran V8 = `validerDevis`, `trancherDevis` (modale avec remise, MRR, frais, total, responsable). Notification temps réel : événement socket `quote.pendingValidation` (US-05-04).

### US-02-06 · Suivre la vie d'un devis
**En tant que** commercial, **je veux** noter une relance, une entrée en négociation, un refus ; le devis expire seul.
- Règles : `SENT → FOLLOWED_UP → NEGOTIATING`, chacun peut aller en `REJECTED` ou `SIGNED` ; `EXPIRED` par job à `validUntil` ; propagation vers l'opportunité (SPEC-01 §3.8).
- Permissions : `quotes:update`, `[P]`.
- API : `POST /quotes/:id/follow-up` · `POST /quotes/:id/negotiate` · `POST /quotes/:id/decline` `{ reason }` (refus par le client → opportunité `LOST`) · `POST /quotes/:id/reopen` (depuis `EXPIRED`, crée une copie `DRAFT` avec un nouveau numéro).
- Handoff front : écran V8 = sélecteur de statut de la liste Devis (`setQuoteStatus`). Une relance manuelle crée aussi une activité `FOLLOW_UP` réalisée.

### US-02-07 · Signer un devis
**En tant que** commercial (ses devis) ou direction, **je veux** enregistrer la signature, ce qui crée le contrat et ouvre le déploiement.
- Règles : `signedAt` obligatoire ; organisme **complet** requis ; crée `Contract` (copie des montants), passe l'organisme `IN_DEPLOYMENT`, ouvre `Deployment`, affecte consultant/formateur par défaut, opportunité `WON`, lance `invoices.schedule` ; retour signé joignable.
- Permissions : `quotes:sign`, `[P]`.
- API : `POST /quotes/:id/sign` `{ signedAt, consultantId?, trainerId? }` → `200 { contractId, contractNumber, deploymentId }` · `409 ORGANIZATION_INCOMPLETE` (`details`: champs manquants) · `409 QUOTE_INVALID_TRANSITION` · `POST /quotes/:id/signed-return` (multipart PDF) → `201 { fileId }`.
- Handoff front : écran V8 = passage en « Signé » + `createContractFrom`. Afficher le blocage de complétude avec lien vers la fiche (US-01-03).

### US-02-08 · Générer le devis PDF
**En tant que** commercial, **je veux** télécharger le devis en PDF, avec le cachet du signataire.
- Règles : gabarit HTML actif du projet (SPEC-02 §5.3), données SPEC-01 §6.2, image de cachet du projet injectée ; autorisé dès `DRAFT` (document « projet », filigrane `BROUILLON`), mais seul le PDF généré à la soumission est archivé comme officiel (`QUOTE_PDF`). Autres formats plus tard (`format=docx`).
- Permissions : `quotes:read`, `[P]`.
- API : `GET /quotes/:id/document?format=pdf` → `.pdf` (`Content-Disposition: <Projet>_Devis_<numero>.pdf`) · `GET /quotes/:id/documents` → archives · `404 TEMPLATE_NOT_CONFIGURED` · `422 QUOTE_IMPORTED_NO_DOCUMENT` · `400 FORMAT_NOT_SUPPORTED` ; réponse avec en-tête `X-Document-Warnings: SIGNATURE_IMAGE_MISSING` si le cachet n'est pas configuré.
- Handoff front : écran V8 = `genDevisDocx`. Téléchargement direct ou ouverture dans un onglet ; afficher l'avertissement de cachet manquant.

### US-02-09 · Piloter le pipeline d'opportunités
**En tant que** commercial, **je veux** créer une opportunité, la faire changer d'étape, ajuster sa probabilité, la marquer perdue avec un motif, et voir son historique.
- Règles : une opportunité ouverte par organisme ; étapes et probabilités SPEC-01 §3.7 ; `probabilityOverride` (SPEC-05 Q4) ; `WON` et `LOST` uniquement par la signature/refus d'un devis ou par la route `lose` ; valeur = devis le plus élevé ou estimation SPEC-04 déc. 8.
- Permissions : `opportunities:read|create|update|delete` (scope `OWN` commercial), `[P]`, **[M:SALES]**.
- API : `GET /opportunities?stage&ownerId&organizationId&from&to` → `{ data: [{ id, label, organization: OrgRef, owner: UserRef, stage, stageProbability, probabilityOverride, probability, value, valueSource: "QUOTE"|"ESTIMATE", expectedCloseDate, source, createdAt, quotesCount, lastActivityAt }] }` · `GET /opportunities/board` → colonnes par étape avec totaux pondérés · `POST /opportunities` `{ organizationId, label?, source?, expectedCloseDate?, ownerId? }` · `PATCH /opportunities/:id` `{ label?, expectedCloseDate?, probabilityOverride?, ownerId? }` · `POST /opportunities/:id/stage` `{ stage }` (`QUALIFICATION`…`VERBAL_AGREEMENT` uniquement) · `POST /opportunities/:id/lose` `{ lossReason, comment? }` · `GET /opportunities/:id` → détail + `stages: [{ stage, date }]` + `quotes: []`.
- Handoff front : écran V8 = Opportunités (`RENDER.opportunites`, kanban + `setOppStage`, `openOppModal`, `valeurOpp`). Le total pondéré d'une colonne = Σ `value × probability`.

### US-02-10 · Devis additionnel et de renouvellement
**En tant que** commercial, **je veux** émettre un devis additionnel pour un client, ou un devis de renouvellement depuis un contrat qui arrive à échéance.
- Règles : `ADDITIONAL` → pas de frais de mise en place par défaut ; `RENEWAL` → pré-rempli depuis la configuration du contrat, `startDate` = lendemain de la fin ; la signature d'un `RENEWAL` crée un nouveau contrat et passe l'ancien en `EXPIRED` à sa date.
- Permissions : `quotes:create`, `[P]`.
- API : `POST /quotes` avec `type: "ADDITIONAL"|"RENEWAL"` et `contractId?` (pré-remplissage) — même contrat que US-02-03.
- Handoff front : écrans V8 = Devis (type) et Renouvellements (bouton « Devis de renouvellement », US-03-05).

---

## Lot L3 — Contractualisation

### US-03-01 · Consulter les contrats et générer le contrat PDF
**En tant qu'** administrateur facturation, **je veux** voir les contrats en cours, leurs dates, montants et documents.
- Permissions : `contracts:read`, `[P]`, **[M:BILLING]**.
- API : `GET /contracts?status&organizationId&endBefore` → `{ data: [{ id, number, organization: OrgRef, quote: { id, number }, plan, billing, signedAt, startDate, commitmentMonths, endDate, autoRenew, noticeMonths, noticeDeadline, mrrList, mrrNet, arrList, arrNet, oneShotTotal, status, invoicesCount, overdueCount }] }` · `GET /contracts/:id` (+ `config` du devis, `invoices` résumé, `documents`) · `GET /contracts/:id/document?format=pdf` → `.pdf` (archivé `CONTRACT_PDF` à la signature) · `PATCH /contracts/:id` `{ noticeMonths?, autoRenew?, notes? }`.
- Handoff front : écran V8 = Contrats (`RENDER.contrats`, `genContratDocx`).

### US-03-02 · Générer et compléter l'échéancier
**En tant qu'** administrateur facturation, **je veux** générer les factures à venir d'un contrat ou de tous les contrats, sans jamais créer de doublon.
- Règles : SPEC-02 §5.2 ; `SETUP` puis `M1..` ou `A1..` sur 12 mois glissants ; pas de ligne pour les mois offerts ; job quotidien.
- Permissions : `invoices:create`, `[P]`, **[M:BILLING]**.
- API : `POST /contracts/:id/schedule` → `200 { created, existing }` · `POST /invoices/schedule-all` → `{ created, contracts }`.
- Handoff front : écran V8 = bouton « Mettre à jour l'échéancier » (`generateAllInvoices`, `generateInvoicesFor`).

### US-03-03 · Suivre les factures et le dépôt Chorus Pro
**En tant qu'** administrateur facturation, **je veux** émettre une facture, renseigner les références Chorus Pro, enregistrer le dépôt et le paiement, voir les retards.
- Règles : `TO_ISSUE → ISSUED → DEPOSITED_CHORUS → PAID` ; `OVERDUE` par job (échéance dépassée, non payée) ; dépôt refusé sans `buyerSiret` et (`serviceCode` ou `commitmentNumber`) ; dépôt manuel (SPEC-02 déc. 9).
- Permissions : `invoices:read|update`, `invoices:chorus`, `[P]`, **[M:BILLING]**.
- API : `GET /invoices?status&organizationId&contractId&from&to&overdueOnly` → `{ data: [{ id, number, organization: OrgRef, contract: { id, number }, period, label, ht, vatRate, vat, ttc, issueDate, dueDate, paidAt, status, isLate, chorus: { buyerSiret, serviceCode, commitmentNumber, depositReference, depositedAt }, chorusReady: bool }], summary: { invoicedTtc, paidTtc, pendingTtc, overdueTtc, overdueCount } }` · `PATCH /invoices/:id` `{ chorus: {…} }` · `POST /invoices/:id/issue` · `POST /invoices/:id/deposit` `{ depositReference, depositedAt }` · `409 INVOICE_CHORUS_INCOMPLETE` (`details`) · `POST /invoices/:id/pay` `{ paidAt, amount? }` · `POST /invoices/:id/cancel` `{ reason }`.
- Handoff front : écran V8 = Factures (`RENDER.factures`, `openInvoice`, `saveInvoice`) avec les 4 KPI (`summary`).

### US-03-04 · Préavis et résiliation
**En tant qu'** administrateur facturation, **je veux** enregistrer un préavis reçu puis la résiliation, ce qui arrête l'échéancier.
- Règles : `ACTIVE → NOTICE_RECEIVED → TERMINATED` ; résiliation → factures `TO_ISSUE` postérieures annulées ; organisme `TERMINATED_CUSTOMER` (statut client `Client résilié`).
- Permissions : `contracts:update`, `[P]`.
- API : `POST /contracts/:id/notice` `{ receivedAt, effectiveDate }` · `POST /contracts/:id/terminate` `{ terminatedAt, reason }` → `{ cancelledInvoices }`.
- Handoff front : écran V8 = statuts de contrat (`CTR_STAT`).

### US-03-05 · Anticiper les renouvellements
**En tant que** direction commerciale, **je veux** voir les contrats qui arrivent à échéance, la date limite de dénonciation et l'ARR en jeu.
- Règles : `noticeDeadline = endDate − noticeMonths` ; paliers 30/60/90/180 j ; alertes par job (US-05-04).
- Permissions : `contracts:read`, `[P]`.
- API : `GET /renewals?within=180` → `{ data: [{ contract: {…US-03-01…}, daysLeft, noticeDeadline, noticeDeadlinePassed, alertLevel: "EXPIRED"|"30"|"60"|"90"|"180"|"LATER", renewalQuote: { id, number, status }|null }], summary: [{ within: 30, count, arr }, …] }`.
- Handoff front : écran V8 = Renouvellements (`RENDER.renouvellements`). Bouton « Devis de renouvellement » → US-02-10.

---

## Lot L4 — Après-vente

### US-04-01 · Piloter les déploiements
**En tant que** consultant, **je veux** faire avancer chaque nouveau client de « Dossier ouvert » à « Mise en production ».
- Règles : 6 étapes ; `GO_LIVE` → organisme `ACTIVE_CUSTOMER` ; consultant affecté = scope portefeuille.
- Permissions : `deployments:read|update`, `[P]`, **[M:SUPPORT]**.
- API : `GET /deployments/board` → colonnes par étape `[{ stage, items: [{ id, organization: OrgRef, consultant: UserRef, openedAt, goLiveTarget, progressPct, trainings: { done, total }, openTickets }] }]` · `POST /deployments/:id/stage` `{ stage }` · `PATCH /deployments/:id` `{ consultantId?, goLiveTarget?, notes? }`.
- Handoff front : écran V8 = Déploiements (`RENDER.deploiements`, `dropDeploy`, `setDeployStage`).

### US-04-02 · Planifier et réaliser les formations
**En tant que** formateur, **je veux** voir mes sessions, les planifier et rédiger le compte rendu.
- Permissions : `trainings:read|create|update|delete`, `[P]`, **[M:SUPPORT]**.
- API : `GET /trainings?organizationId&trainerId&status&from&to` → `{ data: [{ id, organization: OrgRef, type: ReferenceRef, trainer: UserRef, date, time, durationMin, location, status, attendees, report }] }` · `POST /trainings` · `PATCH /trainings/:id` · `POST /trainings/:id/complete` `{ attendees, report }` · `POST /trainings/:id/cancel` · `DELETE /trainings/:id`.
- Handoff front : écran V8 = Formations (`RENDER.formations`, `openFormationModal`, `saveFormation`). Les formations apparaissent aussi dans l'agenda (US-01-09).

### US-04-03 · Traiter les tickets de support
**En tant que** consultant, **je veux** enregistrer les demandes des clients, les assigner et les faire avancer jusqu'à résolution.
- Permissions : `tickets:read|create|update|delete`, `[P]`, **[M:SUPPORT]**.
- API : `GET /tickets?organizationId&status&category&assigneeId&priority` → `{ data: [{ id, organization: OrgRef, subject, category: ReferenceRef, status, priority, date, assignee: UserRef|null, resolvedAt, ageDays }] }` · `POST /tickets` `{ organizationId, subject, description?, category, priority?, assigneeId? }` · `PATCH /tickets/:id` · `POST /tickets/:id/status` `{ status, comment? }` · `GET /tickets/:id` (+ `comments: [{ at, by, text, status }]`) · `POST /tickets/:id/comments`.
- Handoff front : écran V8 = Support (`RENDER.support`, `setTicketStatut`) et onglet Support de la fiche.

### US-04-04 · Suivre le portefeuille clients
**En tant que** direction, **je veux** voir mes clients sous contrat avec leur valeur, leur échéance et la santé de la relation.
- Permissions : `contracts:read` + `organizations:read`, `[P]`.
- API : `GET /portfolio?customerStatus&consultantId&renewalWithin` → `{ data: [{ organization: OrgRef, customerStatus, deploymentStage, contract: { number, plan, mrrNet, startDate, endDate }, consultant: UserRef, trainings: { done, total }, openTickets, lastActivityAt, health: "GOOD"|"WATCH"|"RISK" }], summary: { customers, active, inDeployment, mrrNet, arrNet, avgMrr, renewalsWithin6Months } }`.
- Handoff front : écran V8 = Portefeuille (`RENDER.portefeuille`). `health` calculé serveur (tickets ouverts, retard de facture, inactivité).

---

## Lot L5 — Pilotage

### US-05-01 · Tableau de bord
**En tant que** commercial ou direction, **je veux** mes indicateurs sur une période, pour moi, mon équipe ou un collaborateur.
- Règles : `KPI_CONFIG` (SPEC-03 §2.12) ; portée `TEAM`/`USER` réservée au scope `PROJECT` ; démonstrations comptées au franchissement d'étape.
- Permissions : `dashboard:read`, `[P]`.
- API : `GET /dashboard?period=MONTH|QUARTER|YEAR|CUSTOM&from&to&scope=ME|TEAM|USER&userId` → `{ kpis: { activitiesDone, meetings, demos, quotesSent, quotesSigned, revenueSigned, revenueTarget, pipelineWeighted, conversionRate, lateActivities, todayActivities, pendingValidations }, series: { demosByMonth: [{ month, value }], signedByMonth, quotesByMonth }, funnel: [{ stage, count, value }] }` · `GET /dashboard/kpis` → codes disponibles pour le rôle.
- Handoff front : écran V8 = Tableau de bord (`RENDER.dashboard`, `dashData`, `svgBars`, `svgLine`, `svgFunnel`) — ApexCharts côté front.

### US-05-02 · Statistiques et concurrence
**En tant que** direction, **je veux** la répartition de la base, l'entonnoir de conversion et la carte des éditeurs en place.
- Permissions : `stats:read`, `stats:export`, `[P]`.
- API : `GET /stats/base?by=type|bracket|department|region|salesStatus|leadSource` → `[{ key, label, count }]` · `GET /stats/pipeline?from&to` → entonnoir, délais moyens par étape, taux · `GET /stats/competition` → `[{ vendor, solution, organizations, prospects, customers, won, lost }]` · `GET /stats/map` → `[{ department, count, customers }]` (Leaflet).
- Handoff front : écran V8 = Statistiques (`RENDER.stats`).

### US-05-03 · Exporter
**En tant qu'** utilisateur autorisé, **je veux** lancer un export disponible et le télécharger, y compris plus tard.
- Règles : registre d'exports (SPEC-03 §2.10) ; permission par descripteur ; journalisé.
- API : `GET /exports` → `[{ key, label, permission, formats, params, modes }]` · `GET /exports/:key/preview?…` → `{ count, warnings }` · `POST /exports/:key` `{ format, params }` → fichier ou `202 { jobId }` · `GET /exports/jobs?mine=true` → historique `[{ id, key, status, createdAt, downloadUrl, expiresAt }]`.
- Handoff front : écran V8 = boutons d'export dispersés (`exportOrgsCSV`, `exportJournal`, `exportJSON`). Un composant unique « Exporter » alimenté par `GET /exports`.

### US-05-04 · Être notifié
**En tant qu'** utilisateur, **je veux** être prévenu d'un devis à valider, d'un ticket assigné, d'une échéance de contrat.
- API : socket.io namespace `/notifications`, `auth: { token }` ; événements `quote.pendingValidation`, `quote.validated`, `quote.rejected`, `ticket.assigned`, `contract.renewalAlert`, `import.finished`, `export.finished` avec `{ type, at, projectId, payload: { id, label, url } }` · `GET /notifications?unread=true` · `POST /notifications/:id/read`.
- Handoff front : pas d'écran V8 (toasts `toast()` seulement). Reconnexion avec le nouveau token après refresh.

---

## Lot L6 — Administration et RGPD

### US-06-01 · Purger les prospects hors délai et répondre à une demande RGPD
**En tant qu'** administrateur, **je veux** voir les prospects sans contact depuis plus de N mois, les purger après confirmation, et exporter les données d'une personne.
- Règles : `retentionMonths` ; purge = suppression physique organisme + contacts + activités, journalisée ; candidats recalculés par job mensuel.
- Permissions : `data:purge`, `settings:read`, `[P]`.
- API : `GET /gdpr/purge-candidates` → `{ data: [{ organization: OrgRef, lastActivityAt, monthsSince }], neverWorked: count }` · `POST /gdpr/purge` `{ ids: [] , confirm: true }` → `{ purged }` · `GET /gdpr/contacts/:id/export` → JSON des données de la personne.
- Handoff front : écran V8 = Paramètres › Sauvegarde et conservation (`SETPANE.donnees`, `purgeAnciens`, `doPurge`).

### US-06-02 · Sauvegarder et restaurer
**En tant qu'** administrateur, **je veux** exporter une sauvegarde complète du projet et la restaurer.
- Règles : `data:export` et `data:restore` réservés ; restauration = remplacement complet du projet, journalisée, confirmée par le nom du projet.
- API : `POST /exports/backup` → `.json` (via US-05-03) · `POST /data/restore` (multipart, `{ confirmName }`) → `202 { jobId }` · `409 RESTORE_CONFIRMATION_MISMATCH`.
- Handoff front : écran V8 = `exportJSON`, `importJSON`, `resetDB` (la réinitialisation de démo n'existe pas en production).

---

## Récapitulatif

| Lot | Stories | Écrans V8 couverts |
|---|---|---|
| L0 | US-00-01 → 10 | Session, Paramètres › Société / Utilisateurs / Rôles / Périmètres / Journal / Règles / Documents / Référentiels |
| L1 | US-01-01 → 13 | Organismes + fiche (Synthèse, Contacts, Actions), Prospection, Agenda, Campagnes, recherche globale, import/export |
| L2 | US-02-01 → 10 | Devis, Opportunités, Paramètres › Grille tarifaire, génération PDF |
| L3 | US-03-01 → 05 | Contrats, Factures, Renouvellements |
| L4 | US-04-01 → 04 | Déploiements, Formations, Support, Portefeuille |
| L5 | US-05-01 → 04 | Tableau de bord, Statistiques, exports, notifications |
| L6 | US-06-01 → 02 | Paramètres › Sauvegarde et conservation |

Chaque story backend est livrée avec ses scénarios Gherkin, son script curl et son rapport
(skill `backend-dev`) ; le Swagger publié à la fin du lot fait foi sur les formes exactes — en cas
d'écart avec ce document, le Swagger gagne et ce document est corrigé.
