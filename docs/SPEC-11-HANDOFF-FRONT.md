# OUI-CRM — Handoff front détaillé des stories livrées

> Contrat front **par route** de chaque story livrée : payloads de requête et de réponse,
> tableau exhaustif des cas d'erreur, effets de session, limites. Complète SPEC-07 (stories +
> règles) et SPEC-06 §6 (`/profile/me`). Mis à jour à **chaque story livrée** (skill
> `backend-dev`, étape 5). Recettes exécutables : `docs/features/*.feature`. Schémas : Swagger
> `/api/docs`. Dernière mise à jour : 01/09/2026 (US-00-01 → 07).

---

## 0. Conventions (toutes routes)

- Base `http://localhost:3001/api/v1`, JSON. Access token ~15 min (`expiresIn` en secondes),
  refresh ~7 j.
- **Erreurs** : `{ "messages": { "statusCode": "400", "code": "…", "text": "…", "level": "error",
  "details"?: [], "meta"?: {} } }`. Router sur `code` ; `text` est humain, **jamais parsé** ;
  `statusCode` est une chaîne. **Registre `meta`** (toute nouvelle clé est annoncée ici) :
  `lockedUntil` (ISO 8601 UTC) sur `423 AUTH_ACCOUNT_LOCKED`.
- **Intercepteur** : `401 TOKEN_EXPIRED` → refresh **single-flight** puis rejouer ; tout autre
  `401` → déconnexion. `403` = interdit mais connecté (ne pas déconnecter). Exception : sur
  `POST /auth/email-change/request`, `401 AUTH_INVALID_CREDENTIALS` = mot de passe re-saisi faux,
  ne pas déconnecter.
- **Routes [P]** : header **`x-project-id`** (id d'une relation de `/profile/me`) — jamais dans
  l'URL. `400 PROJECT_IS_REQUIRED` · `403 PROJECT_MISMATCH` (projet non affecté / inexistant) ·
  `403 PROJECT_NOT_ACTIVE` (projet `DRAFT`/`ARCHIVED` : « projet indisponible ») ·
  `403 USER_HAS_NO_PROJECT`. Un backoffice adresse tout projet existant (liste : `GET /projects`).
- Permission manquante → `403 ACCESS_DENIED`. Le front **masque** d'après `/profile/me`, le
  serveur décide ; le scope `OWN` est filtré **côté serveur**, jamais côté front.
- Validation DTO → `400 INVALID_DATA` (`text` liste les champs ; `null` sur un champ non
  nullable est refusé). Id invalide → `400 INVALID_CUID`. Listes : `?page=1&limit=20` (max 100),
  réponse `{ data, meta: { total, page, limit, totalPages } }`.
- Politique de mot de passe : ≥ 10 caractères, ≥ 1 lettre, ≥ 1 chiffre (`400 PASSWORD_TOO_WEAK`,
  politique dans `text`).
- Comptes de démo : alias `email.ouicrm+…@gmail.com`, mot de passe `SEED_PASSWORD` (`.env`).
  E-mails locaux dans Mailpit (`http://localhost:8025`).

---

## US-00-01 · Connexion, session, déconnexion (publiques sauf logout)

### `POST /auth/login`
Requête `{ "email": "email.ouicrm+wiem@gmail.com", "password": "…" }` →
`200 { "accessToken": "eyJ…", "refreshToken": "eyJ…", "expiresIn": 900 }`. Ensuite : `GET /profile/me`.

| Erreur | Quand | Réaction front |
|---|---|---|
| `401 AUTH_INVALID_CREDENTIALS` | e-mail inconnu **ou** mot de passe faux (réponse identique) | message unique |
| `423 AUTH_ACCOUNT_LOCKED` | 5 échecs → verrouillage 15 min | compte à rebours sur **`meta.lockedUntil`** |
| `403 AUTH_ACCOUNT_NOT_ACTIVE` | compte `PENDING`/désactivé, bon mot de passe | « vérifiez l'e-mail d'activation » |
| `400 INVALID_DATA` | e-mail malformé, mot de passe vide | validation formulaire |
| `429` | > 50 requêtes/15 min/IP sur `/auth/*` (prod) | « réessayez plus tard » |

### `POST /auth/refresh`
Requête `{ "refreshToken" }` → `200` nouveau couple + `expiresIn`. **Rotation à usage unique** :
l'ancien couple meurt ; remplacer les deux tokens atomiquement ; **un seul refresh en vol**.

| Erreur (toutes `401` → déconnexion) | Quand |
|---|---|
| `REFRESH_TOKEN_INVALID_OR_EXPIRED` | illisible ou > 7 j |
| `REFRESH_TOKEN_INVALID_OR_USED` | déjà consommé (rejeu / refresh concurrent) |
| `SESSION_NOT_FOUND` | logout, reset, changement d'e-mail |
| `AUTH_ACCOUNT_NOT_ACTIVE` | compte désactivé entre-temps |

### `POST /auth/logout` (Bearer)
→ `204`, access + refresh invalidés. `401 SESSION_NOT_FOUND` = déjà déconnecté (succès).

---

## US-00-02 · Activation, mot de passe oublié, changement d'e-mail

Pages publiques : `/activate?token=`, `/reset?token=`, `/email-change?token=` (`FRONT_URL` +
chemin). Token transmis tel quel dans le body.

### `POST /auth/activation/validate` `{ "token" }`
→ `200 { "email", "firstName", "lastName", "legalDocuments": [{ "code": "CGU", "version": 1, "url" }, { "code": "RGPD", … }] }`
— afficher identité + chaque document (lien) au-dessus des cases obligatoires (itérer, ne pas
coder la liste).

| Erreur | Quand | Réaction |
|---|---|---|
| `400 ACTIVATION_TOKEN_INVALID` | illisible, inconnu, consommé, compte déjà actif | « lien invalide » + login |
| `410 ACTIVATION_TOKEN_EXPIRED` | > 72 h — **nouveau lien renvoyé automatiquement** | l'annoncer |

### `POST /auth/activation/complete`
`{ "token", "password", "acceptCgu": true, "acceptRgpd": true }` → `200 { accessToken, refreshToken, expiresIn }`
— **session ouverte**, entrer dans l'app directement.

| Erreur | Quand |
|---|---|
| `400 LEGAL_CONSENT_REQUIRED` | une case décochée |
| `400 PASSWORD_TOO_WEAK` | politique |
| `400 ACTIVATION_TOKEN_INVALID` / `410 …_EXPIRED` | comme validate (token consommé au succès) |

### `POST /auth/password-reset/request` `{ "email" }`
→ **toujours** `200 { "success": true }` (anti-énumération). Message unique. Lien 30 min.

### `POST /auth/password-reset/validate` `{ "token" }`
→ `200 { "valid": true }` · `400 PASSWORD_RESET_TOKEN_INVALID` · `410 PASSWORD_RESET_TOKEN_EXPIRED`
(proposer de refaire une demande).

### `POST /auth/password-reset/complete` `{ "token", "password" }`
→ `200 { "success": true }` ; **toutes les sessions fermées** → login. `400 PASSWORD_TOO_WEAK` ·
`400/410` comme validate.

### `POST /auth/email-change/request` (Bearer) `{ "newEmail", "currentPassword" }`
→ `200 { "success": true }` — lien 30 min envoyé **à la nouvelle adresse**.

| Erreur | Quand |
|---|---|
| `401 AUTH_INVALID_CREDENTIALS` | mot de passe re-saisi faux — **ne pas déconnecter** |
| `400 EMAIL_UNCHANGED` | nouvelle = actuelle |
| `409 EMAIL_ALREADY_TAKEN` | adresse prise |
| `403 USER_INACTIVE` | compte non actif |

### `POST /auth/email-change/confirm` `{ "token" }`
→ `200 { "success": true, "email": "nouvelle@…" }` ; sessions fermées, avis à l'ancienne adresse
→ login pré-rempli avec la **nouvelle** adresse. `404 EMAIL_CHANGE_TOKEN_NOT_FOUND` ·
`410 EMAIL_CHANGE_TOKEN_EXPIRED` · `409 EMAIL_ALREADY_TAKEN` (prise pendant la fenêtre).

---

## US-00-03 · Profil & légal (Bearer, jamais `x-project-id`)

### `GET /profile/me` — l'unique lecture de profil (après login, après `legal/accept`)
```json
{
  "contactId": "cmth…", "email": "…", "firstName": "Wiem", "lastName": "Bousaid",
  "phone": "0601020304", "passwordChangedAt": "2026-08-31T10:00:00.000Z",
  "initials": "WB", "avatarUrl": "https://…presignée (~15 min)…",
  "contactType": "PROJECT",
  "roleRelationships": [{
    "roleCode": "SALES_REP", "roleLabel": "Sales representative",
    "projectId": "cmth…", "projectName": "Périscolia", "projectSlug": "periscolia",
    "displayOrder": 1, "outOfScopeAccess": "RESTRICTED",
    "permissions": [{ "code": "quotes:read", "scope": "OWN", "source": "ROLE" }],
    "modules": ["SALES","BILLING","SUPPORT","STATS"],
    "scope": { "name": "Normandie", "regions": ["Normandie"], "departments": ["14","27","50","61","76"], "portfolioOnly": false },
    "expiresAt": null
  }],
  "legalReacceptanceRequired": false, "legalDocumentsToAccept": []
}
```
Backoffice : `contactType: "BACKOFFICE"`, relation `projectId/projectName/projectSlug: null`,
scopes `ALL`, `modules: []`, `scope: null`, jamais bloqué par le légal. Champs nullables :
`phone`, `passwordChangedAt`, `initials`, `avatarUrl`, `scope`, `expiresAt`. Relations
suspendues/expirées absentes ; `roleRelationships: []` possible. Erreurs : `401`, `404 USER_NOT_FOUND`.

### `PATCH /profile` `{ "firstName"?, "lastName"?, "phone"? (null efface) }`
→ `200 { id, email, firstName, lastName, phone }` · `400 EMPTY_UPDATE_PAYLOAD` · `400 INVALID_DATA`.

### `PATCH /profile/change-password` `{ "oldPassword", "newPassword" }`
→ `200 { "success": true }` ; **autres sessions fermées, la courante survit**.
`400 OLD_PASSWORD_MISMATCH` (ne pas déconnecter) · `400 PASSWORD_TOO_WEAK` ·
`400 PASSWORD_MUST_BE_DIFFERENT_FROM_OLD`.

### `PATCH /profile/avatar` (multipart `file`, JPEG/PNG ≤ 2 Mo) → `200 { "avatarUrl" }` ; `DELETE /profile/avatar` → `204`
`400 STORAGE_FILE_REQUIRED` · `400 STORAGE_FILE_TOO_LARGE` · `400 STORAGE_INVALID_MIME_TYPE` ·
`400 STORAGE_INVALID_MAGIC_BYTES` · `500 STORAGE_UPLOAD_FAILED` · `404 USER_AVATAR_NOT_SET`
(DELETE sans avatar — idempotent).

### `POST /legal/accept` `{ "cgu"?: true, "rgpd"?: true }`
Déclencheur : `legalReacceptanceRequired: true` → bloquer l'app (hors backoffice), afficher
`legalDocumentsToAccept`. Acceptation partielle possible → `200 { "accepted": ["CGU"], "legalReacceptanceRequired": true|false }`.
`400 INVALID_DATA` si aucun `true`.

---

## US-00-04 · Projets (backoffice, `projects:*`, **pas** de `x-project-id`)

Cycle de vie : `DRAFT` (création) → `ACTIVE` → `ARCHIVED` → `ACTIVE`. Non-backoffice → `403 ACCESS_DENIED`.

### `GET /projects?page&limit&status&search`
→ `200 { "data": [{ "id", "slug", "name", "productName", "status", "features": ["SALES",…] (activées), "userCount", "createdAt" }], "meta" }`.

### `POST /projects` `{ "slug", "name", "productName", "description"?, "copyFromProjectId"? }`
→ `201 { "id", "slug" }` — **DRAFT** + bootstrap (réglages, référentiels génériques, périmètre
« Tout le territoire », 4 features, grille v1 vide) ; copie : réglages sauf identité société,
pondérations, features, référentiels, périmètres, grille active → v1, gabarits + cachet.
Slug `^[a-z0-9]+(-[a-z0-9]+)*$` (2–50), **immuable**. `409 PROJECT_SLUG_EXISTS` ·
`404 PROJECT_NOT_FOUND` (source) · `400 INVALID_DATA`.

### `GET /projects/:id`
→ liste + `description`, `activatedAt`, `updatedAt`, `features: [{ code, enabled }]` (4 codes). `404`.

### `PATCH /projects/:id` `{ "name"?, "productName"?, "description"? (null efface) }`
→ `200 { id, slug }` · `400 EMPTY_UPDATE_PAYLOAD` · `400 INVALID_DATA` (slug refusé) · `409 PROJECT_ARCHIVED`.

### `PATCH /projects/:id/features` `{ "features": ["SALES","STATS"] }` = ensemble **activé**
→ `200 { "features": [{ code, enabled }] }` · `400 INVALID_DATA` · `409 PROJECT_ARCHIVED`.

### `POST /projects/:id/status` `{ "status": "ACTIVE" | "ARCHIVED", "name"? }` → `204`
`DRAFT→ACTIVE` · `ACTIVE→ARCHIVED` (**`name` exact obligatoire**) · `ARCHIVED→ACTIVE`.
`409 INVALID_STATUS_TRANSITION` (rafraîchir l'état) · `400 PROJECT_NAME_MISMATCH` · `400 INVALID_DATA` (`DRAFT` jamais cible).

### `GET /projects/:id/config-export`
→ XLSX (`Content-Disposition: attachment; filename="<slug>-config-<date>.xlsx"`, header exposé
au CORS) ; feuilles `Settings`, `StageProbabilities`, `ReferenceItems`, `Scopes`, `Users`
(données personnelles). `404`.

---

## US-00-05 · Utilisateurs du projet — `/users` [P] (`users:read|create|update|delete`)

### `GET /users?page&limit&search&roleCode&status`
```json
{ "data": [{ "id", "email", "firstName", "lastName", "initials": "WB",
  "status": "ACTIVE", "roleCode": "SALES_REP", "roleLabel": "Sales representative",
  "scope": { "id", "name": "Normandie" } | null, "expiresAt": null, "isExternal": false,
  "overridesCount": { "added": 1, "removed": 1 }, "lastLoginAt": "…" | null }], "meta": { … } }
```
`status` **composite** : `PENDING | ACTIVE | INACTIVE` (compte) ou `SUSPENDED` (affectation) —
même valeur pour le filtre. `isExternal` dérivé (`expiresAt` renseigné). `search` : e-mail,
prénom, nom, initiales.

### `POST /users` → `201 { "id", "status" }`
`{ "email", "firstName", "lastName", "initials" (≤ 3), "roleCode", "scopeId"?, "isExternal", "expiresAt"?: "YYYY-MM-DD" }`
Trois issues : e-mail inconnu → `PENDING` + e-mail d'activation ; existant sur un autre projet →
**rattachement** (`ACTIVE`) ; affectation **suspendue** ici → **réactivation** avec les valeurs soumises.

| Erreur | Quand |
|---|---|
| `400 EXPIRATION_REQUIRED_FOR_EXTERNAL` | `isExternal: true` sans `expiresAt` |
| `400 INVALID_ROLE` | code inconnu, rôle backoffice, rôle d'un autre projet |
| `409 INITIALS_ALREADY_USED` | initiales prises dans le projet |
| `409 EMAIL_EXISTS_FOR_PROJECT` | déjà activement affecté à ce projet |
| `404 SCOPE_NOT_FOUND` | `scopeId` inconnu / autre projet |

### `GET /users/:id` → ligne + `phone` + `permissions: [{ code, scope, source }]` effectives ; `404 USER_NOT_FOUND` (aussi si pas sur ce projet).

### `PATCH /users/:id` `{ firstName?, lastName?, initials?, roleCode?, scopeId? (null retire), expiresAt? (null retire) }`
→ `200` détail · `400 EMPTY_UPDATE_PAYLOAD` · `400 CANNOT_UPDATE_OWN_ROLE` · `400 INVALID_ROLE` ·
`409 INITIALS_ALREADY_USED` · `404 SCOPE_NOT_FOUND`.

### `PATCH /users/:id/overrides` `{ "added": [codes], "removed": [codes] }` — remplace l'ensemble
→ `200` détail (ajouts en `PROJECT` / `source: "OVERRIDE"`) · `400 INVALID_DATA` (code dans les
deux listes) · `400 PERMISSION_NOT_FOUND`.

### `POST /users/:id/resend-activation` → `200 { "sent": true }` · `409 USER_ALREADY_ACTIVE`.

### `DELETE /users/:id` → `204` (affectation `SUSPENDED`, réversible par re-POST ; sessions révoquées
seulement sans autre affectation active) · `400 CANNOT_DELETE_SELF` · `409 USER_IS_LAST_ADMIN`.

---

## US-00-06 · Rôles — `/roles`, `/permissions` [P] (`roles:read|update` : admin projet et directeur commercial)

### `GET /roles`
→ `200 { "data": [{ "id", "code", "label", "isSystem", "outOfScopeAccess": "NONE|RESTRICTED|FULL", "permissions": [{ "code", "scope": "PROJECT|OWN" }], "usersCount" }] }`
— 7 rôles système non backoffice (lecture seule → « Dupliquer ») + rôles du projet.

### `GET /permissions`
→ `200 { "data": [{ "code": "quotes:validate", "module": "quotes", "action": "validate", "label" }] }` (72) — grouper par `module` pour la matrice.

### `POST /roles/:id/duplicate` `{ "code": "SALES_REP_SENIOR", "label" }` → `201 { "id", "code" }`
`400 INVALID_DATA` (code ≠ `UPPER_SNAKE`, ≤ 50) · `409 ROLE_CODE_EXISTS` (projet ou système) ·
`404 ROLE_NOT_FOUND` (source backoffice / autre projet).

### `PATCH /roles/:id` `{ label?, outOfScopeAccess?, permissions?: [{ code, scope }] }` (remplacement complet)
→ `200` rôle · `403 ROLE_IS_SYSTEM` · `400 EMPTY_UPDATE_PAYLOAD` · `400 INVALID_DATA` (scope `ALL`,
doublon) · `400 PERMISSION_NOT_FOUND` · `404`.

### `DELETE /roles/:id` → `204` · `403 ROLE_IS_SYSTEM` · `409 ROLE_IN_USE` · `404`.

---

## US-00-07 · Périmètres — `/scopes`, `/geo/regions` [P] (`scopes:read|update`)

### `GET /geo/regions` → `200 { "data": [{ "name": "Normandie", "departments": ["14","27","50","61","76"] }] }` (14, statique — cacher).

### `GET /scopes`
→ `200 { "data": [{ "id", "name", "description", "regions": [], "departments": [], "portfolioOnly", "nature": "ALL|PROSPECTS|CUSTOMERS", "usersCount", "resolvedDepartments": [] }] }`
— `resolvedDepartments` vide = tout le territoire.

### `POST /scopes` `{ "name", "description"?, "regions"?, "departments"?, "portfolioOnly"?, "nature"? }` → `201 { "id", "name" }`
### `PATCH /scopes/:id` (mêmes champs, listes remplacées en bloc) → `200` périmètre

| Erreur | Quand |
|---|---|
| `400 INVALID_DATA` | région hors `/geo/regions`, département hors `01–95 / 2A / 2B / 971–976`, `null` |
| `409 SCOPE_NAME_EXISTS` | nom déjà utilisé dans le projet |
| `400 EMPTY_UPDATE_PAYLOAD` | `PATCH {}` |
| `404 SCOPE_NOT_FOUND` | id inconnu / autre projet |

### `DELETE /scopes/:id` → `204` · `409 SCOPE_IN_USE` · `404`.
