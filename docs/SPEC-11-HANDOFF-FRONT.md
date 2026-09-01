# OUI-CRM — Handoff front détaillé des stories livrées

> Contrat front **par route** de chaque story livrée : payloads de requête et de réponse,
> tableau exhaustif des cas d'erreur, effets de session, limites. Complète SPEC-07 (stories +
> règles) et SPEC-06 §6 (`/profile/me`). Mis à jour à **chaque story livrée** (skill
> `backend-dev`, étape 5) ; chaque section se termine par sa **recette BDD** (`.feature`). Recettes exécutables : `docs/features/*.feature`. Schémas : Swagger
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

### Recette BDD

Scénarios US-00-01 et US-00-02 réunis dans `docs/features/auth.feature`, reproduit à la fin de la section US-00-02.

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

### Recette BDD — `docs/features/auth.feature`

Exécutée par `docs/tests/test-auth.sh` (rapport `docs/tests/test-report-auth.txt`).
```gherkin
# Executed by docs/tests/test-auth.sh — report docs/tests/test-report-auth.txt (83/83, 2026-08-31)
@auth @l0
Feature: Authentication, session and account lifecycle (US-00-01, US-00-02)

  Background:
    Given an ACTIVE user "email.ouicrm+wiem@gmail.com" with the role "SALES_REP" on the project "periscolia"
    And a PENDING test user "email.ouicrm+test-auth@gmail.com" (created by the script, deleted at the end)
    And Mailpit capturing outgoing e-mails

  # ---------------------------------------------------------------- US-00-01 — login
  @nominal
  Scenario: Log in
    When I send a POST "/api/v1/auth/login" with the body:
      """
      { "email": "email.ouicrm+wiem@gmail.com", "password": "<SEED_PASSWORD>" }
      """
    Then the HTTP status is 200
    And the response contains "accessToken", "refreshToken" and "expiresIn"

  @error
  Scenario: Wrong password
    When I send a POST "/api/v1/auth/login" with a wrong password
    Then the HTTP status is 401
    And "messages.code" is "AUTH_INVALID_CREDENTIALS"

  @error
  Scenario: Unknown e-mail — same answer, no existence leak
    When I send a POST "/api/v1/auth/login" with "nobody@example.com"
    Then the HTTP status is 401
    And "messages.code" is "AUTH_INVALID_CREDENTIALS"

  @error
  Scenario: Invalid body
    When I send a POST "/api/v1/auth/login" with { "email": "not-an-email", "password": "" }
    Then the HTTP status is 400
    And "messages.code" is "INVALID_DATA"

  @error
  Scenario: Not yet activated account with the right password
    When I send a POST "/api/v1/auth/login" for the PENDING user with their password
    Then the HTTP status is 403
    And "messages.code" is "AUTH_ACCOUNT_NOT_ACTIVE"

  @error
  Scenario: Lockout after 5 failures
    When I send 5 POST "/api/v1/auth/login" with a wrong password for the test user
    Then the 5th HTTP status is 401
    When I send a POST "/api/v1/auth/login" with the right password
    Then the HTTP status is 423
    And "messages.code" is "AUTH_ACCOUNT_LOCKED"
    And "messages.meta.lockedUntil" carries the end of the lock (ISO 8601 UTC — the front countdown reads this field, never the text)

  # ---------------------------------------------------------------- US-00-01 — session
  @nominal
  Scenario: Refresh the session (rotation)
    When I send a POST "/api/v1/auth/refresh" with { "refreshToken": "<refreshToken from login>" }
    Then the HTTP status is 200
    And the response contains a new "accessToken" and a new "refreshToken"

  @error
  Scenario: Reuse the previous refresh token
    When I send a POST "/api/v1/auth/refresh" with the already consumed refresh token
    Then the HTTP status is 401
    And "messages.code" is "REFRESH_TOKEN_INVALID_OR_USED"

  @error
  Scenario: The previous access token is rejected after rotation
    When I send a POST "/api/v1/auth/logout" with the access token issued before the refresh
    Then the HTTP status is 401
    And "messages.code" is "UNAUTHORIZED"

  @error
  Scenario: Unreadable refresh token
    When I send a POST "/api/v1/auth/refresh" with { "refreshToken": "not-a-jwt" }
    Then the HTTP status is 401
    And "messages.code" is "REFRESH_TOKEN_INVALID_OR_EXPIRED"

  @nominal
  Scenario: Log out
    When I send a POST "/api/v1/auth/logout" with the current access token
    Then the HTTP status is 204
    When I send the same POST "/api/v1/auth/logout" again
    Then the HTTP status is 401
    And "messages.code" is "SESSION_NOT_FOUND"
    When I send a POST "/api/v1/auth/refresh" with the refresh token of that session
    Then the HTTP status is 401
    And "messages.code" is "SESSION_NOT_FOUND"

  @error
  Scenario: Protected route without a token
    When I send a POST "/api/v1/auth/logout" without an Authorization header
    Then the HTTP status is 401
    And "messages.code" is "UNAUTHORIZED"

  # ---------------------------------------------------------------- US-00-02 — activation
  @nominal
  Scenario: Validate an activation link
    When I send a POST "/api/v1/auth/activation/validate" with { "token": "<token from the link>" }
    Then the HTTP status is 200
    And the response contains "email", "firstName", "lastName"
    And "legalDocuments" contains the codes "CGU" and "RGPD" with "version" and "url"

  @error
  Scenario: Unreadable activation token
    When I send a POST "/api/v1/auth/activation/validate" with { "token": "garbage" }
    Then the HTTP status is 400
    And "messages.code" is "ACTIVATION_TOKEN_INVALID"

  @error
  Scenario: Expired activation token — a new link is sent
    When I send a POST "/api/v1/auth/activation/validate" with an expired token
    Then the HTTP status is 410
    And "messages.code" is "ACTIVATION_TOKEN_EXPIRED"
    And the user receives a new activation e-mail

  @error
  Scenario: Activation without full consent
    When I send a POST "/api/v1/auth/activation/complete" with { "acceptCgu": true, "acceptRgpd": false }
    Then the HTTP status is 400
    And "messages.code" is "LEGAL_CONSENT_REQUIRED"

  @error
  Scenario: Activation with a weak password
    When I send a POST "/api/v1/auth/activation/complete" with { "password": "short1", "acceptCgu": true, "acceptRgpd": true }
    Then the HTTP status is 400
    And "messages.code" is "PASSWORD_TOO_WEAK"
    And "messages.text" describes the policy ("at least 10 characters with letters and digits")

  @nominal
  Scenario: Activate the account — a session opens
    When I send a POST "/api/v1/auth/activation/complete" with the body:
      """
      { "token": "<token>", "password": "NouveauMotDePasse2026", "acceptCgu": true, "acceptRgpd": true }
      """
    Then the HTTP status is 200
    And the response contains "accessToken", "refreshToken" and "expiresIn"
    And the user is ACTIVE with cguVersion = 1, rgpdVersion = 1 and the acceptance dates set
    When I send the same token to "/api/v1/auth/activation/validate" again
    Then the HTTP status is 400 (token consumed)
    When I log in with the chosen password
    Then the HTTP status is 200

  # ---------------------------------------------------------------- US-00-02 — forgotten password
  @nominal
  Scenario: Request a password reset — same answer whether the e-mail exists or not
    When I send a POST "/api/v1/auth/password-reset/request" with { "email": "nobody@example.com" }
    Then the HTTP status is 200 and "success" is true
    When I send a POST "/api/v1/auth/password-reset/request" with the e-mail of an ACTIVE account
    Then the HTTP status is 200
    And a password reset e-mail is received

  @error
  Scenario: Validate an unreadable or expired reset token
    When I send a POST "/api/v1/auth/password-reset/validate" with { "token": "garbage" }
    Then the HTTP status is 400 and "messages.code" is "PASSWORD_RESET_TOKEN_INVALID"
    When I send a POST "/api/v1/auth/password-reset/validate" with an expired token
    Then the HTTP status is 410 and "messages.code" is "PASSWORD_RESET_TOKEN_EXPIRED"

  @nominal
  Scenario: Reset the password — every session is closed
    When I send a POST "/api/v1/auth/password-reset/validate" with a valid token
    Then the HTTP status is 200 and "valid" is true
    When I send a POST "/api/v1/auth/password-reset/complete" with { "password": "weak" }
    Then the HTTP status is 400 and "messages.code" is "PASSWORD_TOO_WEAK"
    When I send a POST "/api/v1/auth/password-reset/complete" with a compliant password
    Then the HTTP status is 200
    And the access token of the previous session answers 401
    And logging in with the new password answers 200

  # ---------------------------------------------------------------- US-00-02 — e-mail change
  @error
  Scenario: Request an e-mail change — refusals
    When I send a POST "/api/v1/auth/email-change/request" without an Authorization header
    Then the HTTP status is 401
    When I send the request with a wrong "currentPassword"
    Then the HTTP status is 401 and "messages.code" is "AUTH_INVALID_CREDENTIALS"
    When I send the request with my current address
    Then the HTTP status is 400 and "messages.code" is "EMAIL_UNCHANGED"
    When I send the request with the address of another user
    Then the HTTP status is 409 and "messages.code" is "EMAIL_ALREADY_TAKEN"

  @nominal
  Scenario: Request an e-mail change — link sent to the new address
    When I send a POST "/api/v1/auth/email-change/request" (Bearer) with the body:
      """
      { "newEmail": "email.ouicrm+test-auth2@gmail.com", "currentPassword": "<password>" }
      """
    Then the HTTP status is 200
    And a confirmation e-mail is received at the new address

  @nominal @error
  Scenario: Confirm the e-mail change
    When I send a POST "/api/v1/auth/email-change/confirm" with { "token": "garbage" }
    Then the HTTP status is 404 and "messages.code" is "EMAIL_CHANGE_TOKEN_NOT_FOUND"
    When I send the confirmation with an expired token
    Then the HTTP status is 410 and "messages.code" is "EMAIL_CHANGE_TOKEN_EXPIRED"
    When I send the confirmation with the token from the link
    Then the HTTP status is 200 and "email" is "email.ouicrm+test-auth2@gmail.com"
    And the access token of the previous session answers 401
    And logging in with the new address answers 200
    And logging in with the old address answers 401
```

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

### Recette BDD — `docs/features/profile.feature`

Exécutée par `docs/tests/test-profile.sh`.
```gherkin
# Executed by docs/tests/test-profile.sh — report docs/tests/test-report-profile.txt (52/52, 2026-08-31)
@profile @legal @l0
Feature: Profile, project accesses and legal re-acceptance (US-00-03)

  Background:
    Given an ACTIVE user "email.ouicrm+wiem@gmail.com" (SALES_REP on "periscolia", scope "Normandie")
    And the backoffice user "email.ouicrm+superadmin@gmail.com" (SUPER_ADMIN)
    And an ACTIVE test user "email.ouicrm+test-profile@gmail.com" without any relation and without recorded consents
    And every route is account-level: Bearer only, never "x-project-id"

  @nominal
  Scenario: Single profile read for a project user
    When I send a GET "/api/v1/profile/me" as the sales rep
    Then the HTTP status is 200
    And "contactType" is "PROJECT", "initials" is "WB", "phone" and "avatarUrl" are present (nullable)
    And "roleRelationships[0]" carries "roleCode" = "SALES_REP", its display "roleLabel", the project id/name/slug, "outOfScopeAccess", "displayOrder" and "expiresAt"
    And "passwordChangedAt" is present at the root (nullable — profile security section)
    And its "permissions" are effective ones, e.g. { "code": "quotes:read", "scope": "OWN", "source": "ROLE" } (overrides already applied)
    And its "modules" list the enabled features (["SALES", …]) and "scope" carries name, regions, departments, portfolioOnly
    And "legalReacceptanceRequired" is false and "legalDocumentsToAccept" is empty

  @nominal
  Scenario: Single profile read for a backoffice user
    When I send a GET "/api/v1/profile/me" as the super admin
    Then the HTTP status is 200
    And "contactType" is "BACKOFFICE" with a relation whose "projectId" is null and permissions in scope "ALL"
    And "legalReacceptanceRequired" is false (backoffice users are never gated)

  @error
  Scenario: Profile routes require a token
    When I send a GET "/api/v1/profile/me" without an Authorization header
    Then the HTTP status is 401

  @nominal @error
  Scenario: Update the profile
    When I send a PATCH "/api/v1/profile" with {}
    Then the HTTP status is 400 and "messages.code" is "EMPTY_UPDATE_PAYLOAD"
    When I send a PATCH "/api/v1/profile" with { "phone": "0601020304" }
    Then the HTTP status is 200 and the phone shows up in "/profile/me"
    When I send a PATCH "/api/v1/profile" with { "phone": null }
    Then the HTTP status is 200 (phone cleared)

  @nominal @error
  Scenario: Change the password — other sessions closed, current one kept
    Given the test user holds two sessions
    When I send a PATCH "/api/v1/profile/change-password" with a wrong "oldPassword"
    Then the HTTP status is 400 and "messages.code" is "OLD_PASSWORD_MISMATCH"
    When I send it with a weak "newPassword"
    Then the HTTP status is 400 and "messages.code" is "PASSWORD_TOO_WEAK"
    When I send it with "newPassword" equal to the current password
    Then the HTTP status is 400 and "messages.code" is "PASSWORD_MUST_BE_DIFFERENT_FROM_OLD"
    When I send it with a compliant new password
    Then the HTTP status is 200 and "success" is true
    And the current session still answers 200 on "/profile/me"
    And the other session answers 401
    And logging in with the new password answers 200
    And an audit entry "profile.password.change" exists

  @nominal @error
  Scenario: Legal re-acceptance gate
    When the test user (no recorded consents) sends a GET "/api/v1/profile/me"
    Then "legalReacceptanceRequired" is true and "legalDocumentsToAccept" lists CGU and RGPD with "version" and "url"
    When they send a POST "/api/v1/legal/accept" with {}
    Then the HTTP status is 400 and "messages.code" is "INVALID_DATA"
    When they send a POST "/api/v1/legal/accept" with { "cgu": true }
    Then the HTTP status is 200, "accepted" is ["CGU"] and "legalReacceptanceRequired" is still true (RGPD missing)
    When they send a POST "/api/v1/legal/accept" with { "rgpd": true }
    Then the HTTP status is 200 and "legalReacceptanceRequired" is false
    And "/profile/me" agrees

  @nominal @error
  Scenario: Avatar upload, replacement and deletion
    When I send a PATCH "/api/v1/profile/avatar" (multipart) with a PNG file
    Then the HTTP status is 200 and "avatarUrl" is a presigned URL, also visible in "/profile/me"
    When I upload a second PNG
    Then the HTTP status is 200 and only one AVATAR file row remains (single per owner)
    When I upload a text file declared as image/png
    Then the HTTP status is 400 and "messages.code" is "STORAGE_INVALID_MAGIC_BYTES"
    When I send a DELETE "/api/v1/profile/avatar"
    Then the HTTP status is 204
    When I send it again
    Then the HTTP status is 404 and "messages.code" is "USER_AVATAR_NOT_SET"
    And "avatarUrl" is back to null in "/profile/me"
```

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

### Recette BDD — `docs/features/projects.feature`

Exécutée par `docs/tests/test-projects.sh`.
```gherkin
# Executed by docs/tests/test-projects.sh — report docs/tests/test-report-projects.txt (70/70, 2026-08-31)
@projects @l0 @backoffice
Feature: Project administration (US-00-04)

  Background:
    Given a backoffice user "email.ouicrm+superadmin@gmail.com" with the role "SUPER_ADMIN" (projects:read/create/update, scope ALL)
    And a project admin "email.ouicrm+admin@gmail.com" and a sales rep "email.ouicrm+wiem@gmail.com" on the project "periscolia"
    And the routes are platform-level: no "x-project-id" header

  @nominal
  Scenario: List projects
    When I send a GET "/api/v1/projects?limit=5" as the super admin
    Then the HTTP status is 200
    And "data" contains the project "periscolia" with its enabled "features" and "userCount" = 6
    And "meta.total" is present

  @error
  Scenario: Project routes are backoffice only
    When I send a GET "/api/v1/projects" as the project admin
    Then the HTTP status is 403 and "messages.code" is "ACCESS_DENIED"
    When I send a POST "/api/v1/projects" as the sales rep
    Then the HTTP status is 403
    When I send a GET "/api/v1/projects" without a token
    Then the HTTP status is 401

  @error
  Scenario: Create — validation errors
    When I send a POST "/api/v1/projects" with { "slug": "Bad Slug", "name": "X", "productName": "X" }
    Then the HTTP status is 400 and "messages.code" is "INVALID_DATA"
    When I send a POST "/api/v1/projects" with the slug "periscolia"
    Then the HTTP status is 409 and "messages.code" is "PROJECT_SLUG_EXISTS"
    When I send a POST "/api/v1/projects" with an unknown "copyFromProjectId"
    Then the HTTP status is 404 and "messages.code" is "PROJECT_NOT_FOUND"

  @nominal
  Scenario: Create a project — DRAFT with a generic bootstrap
    When I send a POST "/api/v1/projects" with the body:
      """
      { "slug": "test-projects-1", "name": "Projet Test", "productName": "Produit Test", "description": "…" }
      """
    Then the HTTP status is 201 and the response contains "id" and "slug"
    And the project has default settings (discountCap 30), 4 enabled features, generic reference items, the scope "Tout le territoire", an empty pricing grid v1
    And an audit entry "project.create" exists
    When I send a GET "/api/v1/projects/<id>"
    Then the HTTP status is 200, "status" is "DRAFT" and "features" lists every feature code with its flag

  @error
  Scenario: A DRAFT or ARCHIVED project is closed to its users
    Given the project admin is assigned to the DRAFT project
    When they send a request with the header "x-project-id" of that project on a project-scoped route
    Then the HTTP status is 403 and "messages.code" is "PROJECT_NOT_ACTIVE"
    # Covered by src/auth/guards/project.guard.spec.ts until a project-scoped route ships (phase F)

  @nominal @error
  Scenario: Update — slug immutable
    When I send a PATCH "/api/v1/projects/<id>" with {}
    Then the HTTP status is 400 and "messages.code" is "EMPTY_UPDATE_PAYLOAD"
    When I send a PATCH "/api/v1/projects/<id>" with { "slug": "other" }
    Then the HTTP status is 400 (property not allowed)
    When I send a PATCH "/api/v1/projects/<id>" with { "name": "Projet Test 2", "description": null }
    Then the HTTP status is 200
    And the detail shows "name" = "Projet Test 2" and "description" = null

  @nominal @error
  Scenario: Features — the list is the enabled set
    When I send a PATCH "/api/v1/projects/<id>/features" with { "features": ["SALES", "STATS"] }
    Then the HTTP status is 200
    And "features" shows BILLING and SUPPORT disabled, SALES and STATS enabled
    When I send a PATCH "/api/v1/projects/<id>/features" with { "features": ["NOPE"] }
    Then the HTTP status is 400

  @nominal @error
  Scenario: Status change — DRAFT → ACTIVE (single route, transition table)
    When I send a POST "/api/v1/projects/<id>/status" with { "status": "DRAFT" }
    Then the HTTP status is 400 and "messages.code" is "INVALID_DATA" (DRAFT is never a target)
    When I send a POST "/api/v1/projects/<id>/status" with { "status": "ARCHIVED", "name": "Projet Test 2" }
    Then the HTTP status is 409 and "messages.code" is "INVALID_STATUS_TRANSITION" (a DRAFT project cannot be archived)
    When I send a POST "/api/v1/projects/<id>/status" with { "status": "ACTIVE" }
    Then the HTTP status is 204
    And the detail shows "status" = "ACTIVE" and "activatedAt" set
    When I send the same POST "/api/v1/projects/<id>/status" with { "status": "ACTIVE" } again
    Then the HTTP status is 409 and "messages.code" is "INVALID_STATUS_TRANSITION"

  @nominal
  Scenario: Create a project by copying another configuration
    When I send a POST "/api/v1/projects" with { "slug": "test-projects-1-copy", "name": "Copie", "productName": "Produit copié", "copyFromProjectId": "<periscolia id>" }
    Then the HTTP status is 201
    And the new project has Périscolia's settings (revenueTarget, stageProbabilities QUOTE_SENT = 25) but an empty company identity
    And its reference items (structure types…), its 5 scopes, the V8 pricing grid as version 1 and a copy of the stamp image
    And no user is assigned to it

  @nominal @error
  Scenario: Export the configuration as XLSX
    When I send a GET "/api/v1/projects/<periscolia id>/config-export" as the super admin
    Then the HTTP status is 200 with Content-Type "…spreadsheetml…" and an attachment "periscolia-config-<date>.xlsx"
    And the workbook has the sheets Settings, StageProbabilities (7 rows), ReferenceItems, Scopes (4 rows), Users (6 rows)
    When I send the same GET as the project admin
    Then the HTTP status is 403

  @nominal @error
  Scenario: Status change — ACTIVE → ARCHIVED with name confirmation
    When I send a POST "/api/v1/projects/<id>/status" with { "status": "ARCHIVED" }
    Then the HTTP status is 400 and "messages.code" is "PROJECT_NAME_MISMATCH" (name required)
    When I send a POST "/api/v1/projects/<id>/status" with { "status": "ARCHIVED", "name": "wrong name" }
    Then the HTTP status is 400 and "messages.code" is "PROJECT_NAME_MISMATCH"
    When I send a POST "/api/v1/projects/<id>/status" with { "status": "ARCHIVED", "name": "<exact name>" }
    Then the HTTP status is 204
    When I send a PATCH "/api/v1/projects/<id>" or "/features" on the archived project
    Then the HTTP status is 409 and "messages.code" is "PROJECT_ARCHIVED"
    When I archive it again
    Then the HTTP status is 409 and "messages.code" is "INVALID_STATUS_TRANSITION"
    And the project is listed under "/api/v1/projects?status=ARCHIVED"

  @nominal
  Scenario: Status change — ARCHIVED → ACTIVE (restore)
    When I send a POST "/api/v1/projects/<archived id>/status" with { "status": "ACTIVE" }
    Then the HTTP status is 204 and the detail shows "status" = "ACTIVE"

  @error
  Scenario: Unknown or invalid identifier
    When I send a GET "/api/v1/projects/<unknown cuid>"
    Then the HTTP status is 404 and "messages.code" is "PROJECT_NOT_FOUND"
    When I send a GET "/api/v1/projects/not-a-cuid"
    Then the HTTP status is 400 and "messages.code" is "INVALID_CUID"

  @nominal
  Scenario: Audit trail
    Then the audit log of the test projects reads, in order:
      """
      project.create, project.update, project.features.update, project.activate, project.create, project.archive, project.activate, project.restore
      """
```

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

### Recette BDD — `docs/features/users.feature`

Exécutée par `docs/tests/test-users.sh`.
```gherkin
# Executed by docs/tests/test-users.sh — report docs/tests/test-report-users.txt (67/67, 2026-09-01)
@users @l0
Feature: Project user administration (US-00-05)

  Background:
    Given the project "periscolia" and its admin "email.ouicrm+admin@gmail.com" (users:read/create/update/delete)
    And the sales rep "email.ouicrm+wiem@gmail.com" (no users permission)
    And the backoffice super admin (may address any project)
    And every route requires the "x-project-id" header (first project-scoped routes of the API)

  @error
  Scenario: Guards — the project header rules
    When the admin sends a GET "/api/v1/users" without "x-project-id"
    Then the HTTP status is 400 and "messages.code" is "PROJECT_IS_REQUIRED"
    When the sales rep sends a GET "/api/v1/users" with the project header
    Then the HTTP status is 403 and "messages.code" is "ACCESS_DENIED"
    When the admin sends a GET "/api/v1/users" with an unknown project id
    Then the HTTP status is 403 and "messages.code" is "PROJECT_MISMATCH"

  @error
  Scenario: A DRAFT project is closed to its members (live)
    Given a DRAFT project and a member holding users:read on it
    When they send a GET "/api/v1/users" with that project's header
    Then the HTTP status is 403 and "messages.code" is "PROJECT_NOT_ACTIVE"
    When the project is activated and the call replayed
    Then the HTTP status is 200

  @nominal
  Scenario: List and filters
    When the admin sends a GET "/api/v1/users?limit=50"
    Then the HTTP status is 200 with the 6 assignments of the project
    And each row carries initials, composite "status", "roleCode" + "roleLabel", "scope" {id, name}, "expiresAt", derived "isExternal", "overridesCount" {added, removed}, "lastLoginAt"
    And "?search=wiem" returns 1 row, "?roleCode=PROJECT_ADMIN" returns 2, "?status=SUSPENDED" filters on the assignment

  @error
  Scenario: Create — validation errors
    When the admin posts an external user without "expiresAt"
    Then the HTTP status is 400 and "messages.code" is "EXPIRATION_REQUIRED_FOR_EXTERNAL"
    When the role code is backoffice or unknown
    Then the HTTP status is 400 and "messages.code" is "INVALID_ROLE"
    When the initials are already used in the project
    Then the HTTP status is 409 and "messages.code" is "INITIALS_ALREADY_USED"
    When the e-mail is already actively assigned to this project
    Then the HTTP status is 409 and "messages.code" is "EMAIL_EXISTS_FOR_PROJECT"

  @nominal
  Scenario: Create a new user — PENDING + activation e-mail
    When the admin sends a POST "/api/v1/users" with the body:
      """
      { "email": "email.ouicrm+test-users@gmail.com", "firstName": "Test", "lastName": "Users",
        "initials": "TU", "roleCode": "SALES_REP", "scopeId": "<Normandie>", "isExternal": false }
      """
    Then the HTTP status is 201 with { "id", "status": "PENDING" }
    And an activation e-mail is received (Mailpit)
    And GET "/api/v1/users/<id>" returns the detail with effective "permissions" [{code, scope, source}]

  @nominal
  Scenario: Attach an existing user to another project
    When the super admin posts the e-mail of an existing user on another (active) project
    Then the HTTP status is 201 with "status": "ACTIVE" — no second account is created
    And the new assignment takes the next "displayOrder"

  @nominal @error
  Scenario: Update
    When the admin patches with {}
    Then the HTTP status is 400 and "messages.code" is "EMPTY_UPDATE_PAYLOAD"
    When the admin changes their OWN "roleCode"
    Then the HTTP status is 400 and "messages.code" is "CANNOT_UPDATE_OWN_ROLE"
    When the admin patches { "roleCode": "TRAINER", "expiresAt": "2027-08-31" } on another user
    Then the HTTP status is 200, the role changes and "isExternal" becomes true
    When the admin patches initials already used
    Then the HTTP status is 409 and "messages.code" is "INITIALS_ALREADY_USED"

  @nominal @error
  Scenario: Permission overrides — replace the whole set
    When a code appears in both "added" and "removed"
    Then the HTTP status is 400 and "messages.code" is "INVALID_DATA"
    When a code does not exist in the catalogue
    Then the HTTP status is 400 and "messages.code" is "PERMISSION_NOT_FOUND"
    When the admin sends { "added": ["quotes:validate"], "removed": ["organizations:read"] }
    Then the HTTP status is 200 and the effective permissions contain quotes:validate (PROJECT, OVERRIDE) and no organizations:read
    And the list shows "overridesCount": { "added": 1, "removed": 1 }
    When the admin sends { "added": [], "removed": [] }
    Then the permissions are back to the role's

  @nominal @error
  Scenario: Resend activation
    When the admin resends the activation of a PENDING user
    Then the HTTP status is 200 and { "sent": true }
    When the target is already active
    Then the HTTP status is 409 and "messages.code" is "USER_ALREADY_ACTIVE"

  @nominal @error
  Scenario: Suspend, last-admin guard, reactivate
    When the admin deletes their own assignment
    Then the HTTP status is 400 and "messages.code" is "CANNOT_DELETE_SELF"
    When the super admin deletes another admin's assignment
    Then the HTTP status is 204 and the row shows "status": "SUSPENDED" in the list
    When the last assignment holding users:update would be suspended
    Then the HTTP status is 409 and "messages.code" is "USER_IS_LAST_ADMIN"
    When the suspended user's e-mail is POSTed again on the project
    Then the HTTP status is 201 — the assignment is REACTIVATED with the submitted role/scope/initials
    And audit entries user.create / user.suspend / user.reactivate / user.overrides.update exist
```

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

### Recette BDD — `docs/features/roles.feature`

Exécutée par `docs/tests/test-roles.sh`.
```gherkin
# Executed by docs/tests/test-roles.sh — report docs/tests/test-report-roles.txt (46/46, 2026-09-01)
@roles @l0
Feature: Role matrix of a project (US-00-06)

  Background:
    Given the project "periscolia" and its admin "email.ouicrm+admin@gmail.com" (roles:read/update)
    And the sales rep "email.ouicrm+wiem@gmail.com" (no roles permission in the matrix)
    And every route requires the "x-project-id" header

  @nominal @error
  Scenario: List roles and the permissions catalogue
    When the admin sends a GET "/api/v1/roles"
    Then the HTTP status is 200 with the 7 non-backoffice system roles (SUPER_ADMIN is never listed)
    And each role carries "code", "label", "isSystem", "outOfScopeAccess", "permissions" [{code, scope}] and "usersCount"
    When the admin sends a GET "/api/v1/permissions"
    Then the HTTP status is 200 with the 72 catalogue entries [{code, module, action, label}]
    When the sales rep sends a GET "/api/v1/roles"
    Then the HTTP status is 403 and "messages.code" is "ACCESS_DENIED"
    When the header is missing
    Then the HTTP status is 400 and "messages.code" is "PROJECT_IS_REQUIRED"

  @nominal @error
  Scenario: Duplicate a system role into an editable project role
    When the sales rep posts "/api/v1/roles/<SALES_REP>/duplicate"
    Then the HTTP status is 403
    When the admin posts { "code": "bad code", "label": "x" }
    Then the HTTP status is 400 (code must be UPPER_SNAKE)
    When the admin posts the code of an existing role (system or project)
    Then the HTTP status is 409 and "messages.code" is "ROLE_CODE_EXISTS"
    When the admin duplicates a backoffice role
    Then the HTTP status is 404 and "messages.code" is "ROLE_NOT_FOUND"
    When the admin posts { "code": "SALES_REP_SENIOR", "label": "Commercial senior" }
    Then the HTTP status is 201 with { "id", "code" }
    And the new role carries the same grants as its source and shows "isSystem": false in the list

  @nominal @error
  Scenario: Update a project role — grants are replaced as a whole
    When the admin patches a system role
    Then the HTTP status is 403 and "messages.code" is "ROLE_IS_SYSTEM"
    When the admin patches {} on a project role
    Then the HTTP status is 400 and "messages.code" is "EMPTY_UPDATE_PAYLOAD"
    When a grant uses scope "ALL"
    Then the HTTP status is 400 and "messages.code" is "INVALID_DATA" (ALL is reserved to backoffice roles)
    When a grant code does not exist
    Then the HTTP status is 400 and "messages.code" is "PERMISSION_NOT_FOUND"
    When the admin patches { "label": "Commercial senior v2", "outOfScopeAccess": "FULL", "permissions": [quotes:read PROJECT, quotes:validate PROJECT] }
    Then the HTTP status is 200 and the role now has exactly those 2 grants

  @nominal @error
  Scenario: A project role is assignable and protected while in use
    When the admin assigns the project role to a user (PATCH /users/:id { roleCode })
    Then the user's "roleLabel" is the project role label and the role shows "usersCount": 1
    When the admin deletes the role while it is assigned
    Then the HTTP status is 409 and "messages.code" is "ROLE_IN_USE"

  @nominal @error
  Scenario: Delete
    When the admin deletes a system role
    Then the HTTP status is 403 and "messages.code" is "ROLE_IS_SYSTEM"
    When the admin deletes an unused project role
    Then the HTTP status is 204
    When the admin deletes it again
    Then the HTTP status is 404 and "messages.code" is "ROLE_NOT_FOUND"
    And the audit trail reads role.duplicate, role.update, role.delete
```

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

### Recette BDD — `docs/features/scopes.feature`

Exécutée par `docs/tests/test-scopes.sh`.
```gherkin
# Executed by docs/tests/test-scopes.sh — report docs/tests/test-report-scopes.txt (33/33, 2026-09-01)
@scopes @l0
Feature: Geographic scopes of a project (US-00-07)

  Background:
    Given the project "periscolia" and its admin "email.ouicrm+admin@gmail.com" (scopes:read/update)
    And the sales rep "email.ouicrm+wiem@gmail.com" (no scopes permission)
    And every route requires the "x-project-id" header

  @nominal @error
  Scenario: Regions table and scope list
    When the admin sends a GET "/api/v1/geo/regions"
    Then the HTTP status is 200 with the 14 regions and their department codes (e.g. Normandie → 14, 27, 50, 61, 76)
    When the admin sends a GET "/api/v1/scopes"
    Then the HTTP status is 200 with the project's scopes, each carrying name, description, regions, departments, portfolioOnly, nature, "usersCount" and "resolvedDepartments"
    And "resolvedDepartments" is the regions expanded + explicit departments, deduplicated and sorted; empty means the whole territory
    When the sales rep sends a GET "/api/v1/scopes"
    Then the HTTP status is 403
    When the header is missing
    Then the HTTP status is 400

  @nominal @error
  Scenario: Create a scope
    When the admin posts an unknown region name
    Then the HTTP status is 400 and "messages.code" is "INVALID_DATA"
    When the admin posts an invalid department code
    Then the HTTP status is 400
    When the admin posts a name already used in the project
    Then the HTTP status is 409 and "messages.code" is "SCOPE_NAME_EXISTS"
    When the admin posts { "name": "Corse et Riviera", "regions": ["Corse"], "departments": ["06"], "portfolioOnly": true, "nature": "PROSPECTS" }
    Then the HTTP status is 201 with { "id", "name" }
    And the list shows "resolvedDepartments": ["06", "2A", "2B"]

  @nominal @error
  Scenario: Update a scope
    When the admin patches {}
    Then the HTTP status is 400 and "messages.code" is "EMPTY_UPDATE_PAYLOAD"
    When the admin renames onto an existing name
    Then the HTTP status is 409
    When the admin patches { "name": "… v2", "regions": ["Bretagne"], "departments": [], "portfolioOnly": false, "nature": "ALL" }
    Then the HTTP status is 200 — the lists are replaced as a whole and "resolvedDepartments" is recomputed (22, 29, 35, 56)
    When the scope id is unknown
    Then the HTTP status is 404 and "messages.code" is "SCOPE_NOT_FOUND"

  @nominal @error
  Scenario: A scope in use cannot be deleted
    When the admin assigns the scope to a user (PATCH /users/:id { scopeId })
    Then the user's "scope" ref shows the new scope and the scope shows "usersCount": 1
    When the admin deletes the scope while assigned
    Then the HTTP status is 409 and "messages.code" is "SCOPE_IN_USE"

  @nominal @error
  Scenario: Delete
    When the admin deletes an unused scope
    Then the HTTP status is 204
    When the admin deletes it again
    Then the HTTP status is 404
    And the audit trail reads scope.create, scope.update, scope.delete

  @nominal
  Scenario: Visibility engine (unit-tested, wired to organizations at L1)
    Given a role with outOfScopeAccess FULL, or no scope, or an empty scope
    Then "whereVisible" is {} (nothing restricts)
    Given a scope with regions, portfolioOnly, nature and campaigns
    Then "whereVisible" ANDs department IN resolved, owner = user (salesRep/consultant/trainer), isCustomer, campaigns hasSome
    And "access" returns FULL inside the scope, RESTRICTED outside for a RESTRICTED role, NONE for a NONE role
```
