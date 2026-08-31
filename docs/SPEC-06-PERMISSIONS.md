# OUI-CRM — Permissions, rôles et scopes

> **Source** : maquette V8, `rolesParDefaut()` (lignes 868-910), `OBJETS`, `VERBES`, `SENSIBLES`,
> `HORS_PERIMETRE`, `can()` / `canS()` / `acces()` (lignes 861-990).
> **Modèle** : SPEC-02 §2.2 et §4.1 (tables `Permission`, `RolePermission`, `UserRoleProject`,
> `UserPermissionOverride`, `Scope`), pattern soft-m (SPEC-03 §2.2).
> Ce document est la **définition exécutable** : c'est lui que `prisma/seedAuth.ts` implémente.
> Lot : **L0**.

---

## 1. Les cinq notions

| Notion | Définition | Table |
|---|---|---|
| **Permission** | Une action nommée `module:action` (`quotes:validate`). Catalogue fixe, seedé, non modifiable par l'interface. | `Permission` |
| **Scope** d'une permission | Jusqu'où elle porte : `ALL` (tous les projets — backoffice), `PROJECT` (tout le projet), `OWN` (seulement les objets dont l'utilisateur est propriétaire : `salesRepId`, `ownerId`, `userId`). | `RolePermission.scope` |
| **Rôle** | Un ensemble de permissions avec leur scope, plus un comportement **hors périmètre géographique**. 8 rôles système seedés ; un projet peut dupliquer un rôle système et le modifier (`isSystem = false`, `projectId` renseigné). | `Role`, `RolePermission` |
| **Affectation** | Un utilisateur a un rôle **par projet** (`UserRoleProject`), avec un statut, une date d'expiration optionnelle (comptes externes), ses initiales pour ce projet et un périmètre géographique (`scopeId`). Un rôle backoffice s'affecte avec `projectId = null`. | `UserRoleProject` |
| **Surcharge** | Pour un utilisateur et un projet, une permission ajoutée (`granted = true`) ou retirée (`granted = false`) par rapport à son rôle. | `UserPermissionOverride` |

Le **périmètre géographique** (`Scope` : régions, départements, portefeuille, nature) n'est pas
une permission : il filtre *quelles fiches* on voit, la permission dit *ce qu'on peut faire*.
Les deux se combinent dans chaque requête (SPEC-02 §4.2).

## 2. Règle d'évaluation

Pour une requête sur le projet `P` par l'utilisateur `U`, permission demandée `code` :

1. `U` a-t-il une affectation active et non expirée sur `P` (ou un rôle backoffice) ? Sinon `PROJECT_MISMATCH`.
2. `UserPermissionOverride(U, P, code)` existe avec `granted = false` → **refus** (`ACCESS_DENIED`).
3. … existe avec `granted = true` → **accordé**, scope = `PROJECT` (une surcharge n'accorde jamais `ALL`).
4. Sinon `RolePermission(rôle de U sur P, code)` existe → accordé avec son scope.
5. Sinon refus.

Ordre : **retrait > ajout > rôle**. Le scope résolu est déposé dans `req.scopeFilter[code]` :
`ALL` → `{}` ; `PROJECT` → `{ projectId }` ; `OWN` → `{ projectId, <ownerField>: U.id }`.

**Accès hors périmètre géographique** (`Role.outOfScopeAccess`) : pour une fiche hors du
`Scope` de l'utilisateur, `FULL` = comme dans le périmètre, `RESTRICTED` = lecture restreinte
(nom, type, ville, département, statuts, commercial), `NONE` = invisible (404).

## 3. Catalogue des permissions

Codes en camelCase `module:action`. Les libellés sont en anglais (colonne `label`).

| Module | Codes | Notes |
|---|---|---|
| `organizations` | `read`, `create`, `update`, `delete`, `export`, `import`, `bulk` | `export` = fichier commercial hors de l'entreprise |
| `contacts` | `read`, `create`, `update`, `delete` | |
| `activities` | `read`, `create`, `update`, `delete` | inclut l'agenda et l'export ICS |
| `campaigns` | `read`, `create`, `update`, `delete` | |
| `opportunities` | `read`, `create`, `update`, `delete` | `update` inclut le changement d'étape et `probabilityOverride` |
| `quotes` | `read`, `create`, `update`, `delete`, `submit`, `validate`, `sign`, `discountAboveCap` | `validate` = ex-`validerDevis`, `sign` = ex-`signerDevis`, `discountAboveCap` = ex-`remiseHorsPlafond` |
| `contracts` | `read`, `update` | création uniquement par `quotes:sign` |
| `invoices` | `read`, `create`, `update`, `chorus` | `create` = générer l'échéancier ; `chorus` = enregistrer le dépôt |
| `deployments` | `read`, `update` | création automatique à la signature |
| `trainings` | `read`, `create`, `update`, `delete` | |
| `tickets` | `read`, `create`, `update`, `delete` | |
| `dashboard` | `read` | |
| `stats` | `read`, `export` | |
| `pricing` | `read`, `update` | `update` = nouvelle version de grille (ex-`modifierTarifs`) |
| `settings` | `read`, `update` | réglages du projet, société, documents |
| `references` | `read`, `update` | référentiels |
| `users` | `read`, `create`, `update`, `delete` | ex-`gererUtilisateurs` |
| `roles` | `read`, `update` | duplication et édition des rôles du projet |
| `scopes` | `read`, `update` | périmètres géographiques |
| `auditLog` | `read`, `export` | |
| `data` | `export`, `restore`, `purge` | ex-`exporterBase`, `restaurerSauvegarde`, `supprimerDefinitif` |
| `projects` | `read`, `create`, `update` | backoffice uniquement |

Total : 63 permissions.

## 4. Rôles système et matrice

Transposition de la V8. Légende des scopes : **P** = `PROJECT`, **O** = `OWN`, **A** = `ALL`,
`—` = pas la permission. `r/c/u/d/e` = read / create / update / delete / export.

### 4.1 Rôles

| Code | Libellé | Backoffice | Hors périmètre | Origine V8 |
|---|---|---|---|---|
| `SUPER_ADMIN` | Platform administrator | oui | `FULL` | nouveau (opérateur OUI-CRM) |
| `PROJECT_ADMIN` | Project administrator | non | `FULL` | `ADMIN` |
| `SALES_DIRECTOR` | Sales director | non | `FULL` | `DIRCO` |
| `SALES_REP` | Sales representative | non | `RESTRICTED` | `COM` |
| `DEPLOYMENT_CONSULTANT` | Deployment consultant | non | `NONE` | `CONSULT` |
| `TRAINER` | Trainer | non | `NONE` | `FORM` |
| `BILLING_ADMIN` | Billing administrator | non | `RESTRICTED` | `ADMFAC` |
| `OBSERVER` | Observer | non | `NONE` | `OBS` |

### 4.2 Matrice CRUD par module

| Module | PROJECT_ADMIN | SALES_DIRECTOR | SALES_REP | DEPLOYMENT_CONSULTANT | TRAINER | BILLING_ADMIN | OBSERVER |
|---|---|---|---|---|---|---|---|
| organizations | r c u d e — P | r c u d e — P | r c u — P | r u — P | r — P | r — P | r — P |
| contacts | r c u d — P | r c u d — P | r c u — P | r c u — P | r — P | r — P | r — P |
| activities | r c u d — P | r c u d — P | r c u — **O** | r c u — P | — | — | r — P |
| campaigns | r c u d — P | r c u d — P | r c u — P | — | — | — | r — P |
| opportunities | r c u d — P | r c u d — P | r c u — **O** | — | — | — | r — P |
| quotes | r c u d — P | r c u d — P | r c u — **O** | r — P | — | r — P | — |
| contracts | r u — P | r u — P | r — **O** | r — P | — | r u — P | — |
| invoices | r c u — P | r u — P | — | — | — | r c u — P | — |
| deployments | r u — P | r u — P | r — P | r u — P | r — P | — | r — P |
| trainings | r c u d — P | r u — P | r — P | r c u — P | r u — P | — | r — P |
| tickets | r c u d — P | r u — P | r — P | r c u d — P | — | — | r — P |
| dashboard | r — P | r — P | r — **O** | — | — | r — P | — |
| stats | r e — P | r e — P | r — **O** | — | — | r — P | — |
| pricing | r u — P | r — P | r — P | — | — | — | — |
| settings, references, scopes, roles | r u — P | r — P | — | — | — | — | — |
| users | r c u d — P | r — P | — | — | — | — | — |
| auditLog | r e — P | r — P | — | — | — | — | — |

`SUPER_ADMIN` : toutes les permissions en scope **A**, plus `projects:*`.

Le scope **O** de `SALES_REP` sur activités, opportunités, devis, contrats, dashboard et stats
est la transposition exacte de `voirMontantsAutres = false` : un commercial ne voit que ses
montants, y compris dans les agrégats. Le périmètre géographique s'applique en plus.

### 4.3 Permissions d'action

| Permission | PROJECT_ADMIN | SALES_DIRECTOR | SALES_REP | BILLING_ADMIN | Autres |
|---|---|---|---|---|---|
| `organizations:export` | ✓ | — | — | — | — |
| `organizations:import` | ✓ | ✓ | — | — | — |
| `organizations:bulk` | ✓ | ✓ | ✓ (O) | — | — |
| `quotes:submit` | ✓ | ✓ | ✓ (O) | — | — |
| `quotes:validate` | ✓ | ✓ | — | — | — |
| `quotes:sign` | ✓ | ✓ | ✓ (O) | — | — |
| `quotes:discountAboveCap` | ✓ | ✓ | — | — | — |
| `invoices:chorus` | ✓ | — | — | ✓ | — |
| `data:export` | ✓ | — | — | — | — |
| `data:purge` | ✓ | ✓ | — | — | — |
| `data:restore` | ✓ | — | — | — | — |

Lecture des choix V8 conservés tels quels : la direction commerciale valide les remises et
purge, mais **n'exporte pas la base et ne modifie pas les tarifs** ; le commercial **signe** ses
propres devis mais ne les valide pas ; l'administration facturation voit tous les montants
(scope P) sans toucher à la prospection.

## 5. Contrat du seed (`prisma/seedAuth.ts`)

```ts
permissionsData: { code: string; label: string }[]              // §3, 72 entrées
rolesData: { code; label; isBackoffice; isSystem: true; outOfScopeAccess }[]   // §4.1
rolePermMapping: { role: string; permission: string; scope: ScopeType }[]     // §4.2 + §4.3
```

- `permission.deleteMany()` puis `createMany()` — le catalogue est remplacé à chaque seed.
- `role.upsert({ where: { code } })` pour les rôles système ; les rôles dupliqués par un projet
  (`isSystem = false`) ne sont **jamais** touchés par le seed.
- `rolePermission` des rôles système : supprimé et recréé.
- Le seed de développement crée en plus le super admin plateforme, le projet Périscolia et les
  6 utilisateurs de la V8 (`SEED_PASSWORD`) avec leurs affectations et périmètres. **Toutes les
  adresses de démo sont des alias Gmail d'une seule boîte réelle** `email.ouicrm@gmail.com`
  (`email.ouicrm+<alias>@gmail.com`, décision du 31/08/2026) : les mails d'activation, de
  réinitialisation et de changement d'adresse sont réellement reçus. Un compte de démo est
  identifié par ses initiales dans le projet : changer une adresse dans le seed **renomme** le
  compte au lieu d'en créer un second.

| Utilisateur | E-mail | Rôle | Périmètre |
|---|---|---|---|
| Super Admin (`SA`, backoffice, sans projet) | `email.ouicrm+superadmin@gmail.com` | `SUPER_ADMIN` | — |
| Abdoulaye S. (`AS`) | `email.ouicrm+admin@gmail.com` | `PROJECT_ADMIN` | France entière |
| Wiem Bousaid (`WB`) | `email.ouicrm+wiem@gmail.com` | `SALES_REP` | Normandie |
| Fred Yolland (`FY`) | `email.ouicrm+fred@gmail.com` | `SALES_REP` | Grand Ouest hors Normandie |
| Bassem A. (`BA`) | `email.ouicrm+bassem@gmail.com` | `PROJECT_ADMIN` | France entière |
| Camille Fontaine (`CF`, externe, expire à +365 j) | `email.ouicrm+camille@gmail.com` | `TRAINER` | Mes clients uniquement |
| Sofia Marchetti (`SM`, externe, expire à +365 j) | `email.ouicrm+sofia@gmail.com` | `DEPLOYMENT_CONSULTANT` | Mes clients uniquement |

## 6. Ce que le front reçoit — `GET /profile/me` (comme soft-m)

Même principe que soft-m : **un utilisateur backoffice** (rôle `isBackoffice`, affectation sans
projet) et **un utilisateur non backoffice** (une affectation par projet). La route n'est pas
scopée par projet — `JwtAuthGuard` seul, pas de header — et renvoie **toutes les affectations** ;
le front en choisit une et envoie ensuite `x-project-id` sur chaque appel.

Copie de `MeResponseDto` / `ProfileService.getMe` de soft-m, `client` → `project`, avec les
ajouts CRM (scope de chaque permission, périmètre géographique) et la fusion de l'ex-`GET
/profile` (`phone`, `avatarUrl`) — contrat livré le 31/08/2026, à jour ci-dessous :

```json
{
  "contactId": "…",                       // id utilisateur
  "email": "email.ouicrm+wiem@gmail.com",
  "firstName": "Wiem", "lastName": "Bousaid",
  "phone": "0601020304",                  // null si absent
  "initials": "WB",                       // celles de la 1re relation active, null si aucune
  "avatarUrl": "https://…presignée…",     // ~15 min, null si pas d'avatar — ne pas la stocker
  "contactType": "PROJECT",              // BACKOFFICE | PROJECT (ex-CLIENT)
  "roleRelationships": [
    {
      "roleCode": "SALES_REP",
      "projectId": "…", "projectName": "Périscolia", "projectSlug": "periscolia",
      "displayOrder": 1,
      "outOfScopeAccess": "RESTRICTED",
      "permissions": [
        { "code": "quotes:create", "scope": "OWN", "source": "ROLE" },
        { "code": "quotes:validate", "scope": "PROJECT", "source": "OVERRIDE" }
      ],
      "modules": ["SALES", "BILLING"],
      "scope": { "name": "Normandie", "regions": ["Normandie"], "departments": ["14","27","50","61","76"], "portfolioOnly": false },
      "expiresAt": null                   // sinon date "YYYY-MM-DD" (dernier jour de validité)
    }
  ],
  "legalReacceptanceRequired": false,
  "legalDocumentsToAccept": []            // sinon [{ "code", "version", "url" }]
}
```

- Un utilisateur backoffice a une relation `projectId = null`, `permissions` en scope `ALL`,
  `modules = []`, et `contactType = "BACKOFFICE"` ; `legalReacceptanceRequired` est toujours
  `false` pour lui (jamais bloqué par les CGU), comme dans soft-m.
- `permissions` est déjà **corrigé par les surcharges** (`source` = `ROLE` | `OVERRIDE`) : le
  front n'a aucune règle à appliquer.
- Les relations `SUSPENDED` ou expirées ne sont pas renvoyées.

Le front s'en sert pour lister les projets accessibles et masquer boutons et onglets —
**jamais** pour décider : chaque route est protégée côté serveur par `ProjectGuard` +
`PermissionsGuard`, qui rechargent les mêmes données à chaque requête.

## 7. Tests (`permissions.guard.spec.ts`, `rbac.service.spec.ts`)

| Cas | Attendu |
|---|---|
| Rôle accorde, pas de surcharge | accordé, scope du rôle |
| Rôle accorde, surcharge `granted = false` | refus |
| Rôle n'accorde pas, surcharge `granted = true` | accordé, scope `PROJECT` |
| Surcharges contradictoires (impossible par unicité `(userId, projectId, permissionId)`) | contrainte base |
| Deux affectations du même projet avec les mêmes initiales | `409 INITIALS_ALREADY_USED` (SPEC-08 R7) |
| Rôle dupliqué avec le code d'un rôle système sur un autre projet | accepté — unicité `(projectId, code)` (SPEC-08 R2) |
| Affectation expirée (`expiresAt < now`) | `PROJECT_MISMATCH` même avec la permission |
| Rôle backoffice, header d'un projet quelconque | accordé, scope `ALL` |
| `SALES_REP` liste les devis | `where` contient `ownerId = user.id` |
| `SALES_REP` détail d'un devis d'un collègue | 404 |
| `SALES_REP` fiche hors périmètre | projection restreinte |
| `TRAINER` fiche hors périmètre | 404 |
| Rôle dupliqué par un projet, permission retirée | refus ; le rôle système d'origine inchangé |
