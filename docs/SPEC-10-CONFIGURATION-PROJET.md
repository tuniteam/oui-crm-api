# OUI-CRM — Configuration d'un projet

> Répond à la question « à la création d'un projet, comment configurer les variables de l'onglet
> ⚙️ Paramètres du classeur ? ». Décisions du 31/08/2026.
> **Documents liés** : SPEC-02 §2.2-2.3 (modèle), SPEC-05 (import), SPEC-07 US-00-04/08/09,
> SPEC-08 phases 4 et 7 (`ProjectBootstrapService`).

---

## 1. Ce qui constitue la configuration d'un projet

| Élément | Table | Origine dans le classeur `OUICRM_v2_1.xlsx` (onglet ⚙️ Paramètres) |
|---|---|---|
| Réglages : TVA, plafond de remise, objectifs, validité des devis, préavis, engagement, conservation, identité société et signataire | `Settings` | — (valeurs V8 / société) |
| **Probabilités par étape du pipeline** | `Settings.stageProbabilities` | colonne **⚡ Pondération** |
| Référentiels : types de cibles, étiquettes, sources de leads, éditeurs et solutions, services, types et résultats d'action, catégories de tickets, types de formation, motifs de perte | `ReferenceItem` | 🌡️ Étiquettes, 📡 Sources, 🖥️ Éditeurs, 📝 Actions / commentaires |
| Périmètres géographiques | `Scope` | 🗺️ Secteurs / instances |
| Features activées | `ProjectFeature` | — |
| Grille tarifaire (offres) | `PricingGrid` | — (grille V8 pour Périscolia) |
| Gabarits HTML et image de cachet | `File` (`HTML_TEMPLATE`, `SIGNATURE_IMAGE`) | — |
| Utilisateurs et affectations | `UserRoleProject` | 👤 Commerciaux |

Ne sont **pas** de la configuration : les statuts de prospection (📋 Statut prospection) et les
statuts de pipeline (📋 Statuts pipeline), qui sont des enums porteurs de logique ; le classeur y
est raccordé par les tables de correspondance de SPEC-05 §3. Le mois de signature prévisionnel
est une donnée d'opportunité, pas un paramètre.

## 2. Probabilités par étape (décision du 31/08/2026)

`Settings.stageProbabilities` : JSON `{ QUALIFICATION: 10, DEMONSTRATION: 30, QUOTE_SENT: 50,
NEGOTIATING: 70, VERBAL_AGREEMENT: 90, WON: 100, LOST: 0 }` — valeurs V8 par défaut, modifiables
par projet dans Réglages › Règles commerciales (`settings:update`), `WON` et `LOST` figés.

Probabilité effective d'une opportunité = `opportunity.probabilityOverride ?? settings.stageProbabilities[stage]`.
Un changement des valeurs du projet s'applique immédiatement aux opportunités sans surcharge
(le pipeline pondéré est recalculé, jamais stocké).

Correspondance de la pondération du classeur (SPEC-05) : `Analyse devis` 25 → `QUOTE_SENT`,
`Relance` 40 → `QUOTE_SENT`, `Négociation` 60 → `NEGOTIATING`, `Accord Oral` 80 → `VERBAL_AGREEMENT`,
`Signé` 90 → `WON` (forcé à 100). Deux statuts du classeur tombant sur la même étape : la valeur
du classeur est conservée **par opportunité** (`probabilityOverride`, décision SPEC-05 Q4) ; les
valeurs par étape du projet Périscolia sont initialisées à 25 / 60 / 80 pour `QUOTE_SENT` /
`NEGOTIATING` / `VERBAL_AGREEMENT` par l'import de configuration (§4).

## 3. Trois niveaux de configuration

### 3.1 Bootstrap automatique — `ProjectBootstrapService`

Appelé dans la transaction de `POST /projects` et par le seed. Crée, à partir de la constante
`DEFAULT_PROJECT_CONFIG` (code, versionnée avec l'application) :

- `Settings` par défaut (TVA 20, plafond 30, validité 30 j, préavis 2, engagement 36,
  conservation 36, `stageProbabilities` V8, société vide) ;
- référentiels **génériques** de CRM : `TAG` (Chaud), `LEAD_SOURCE` (8 sources de SPEC-05 §3.3),
  `ACTIVITY_TYPE` (8 types V8), `ACTIVITY_RESULT` (7), `TICKET_CATEGORY` (6), `TRAINING_TYPE`
  (5), `LOSS_REASON` (Budget non voté, Concurrent retenu, Sans suite, Abandonné, Autre),
  `STRUCTURE_TYPE` minimal (`ORGANIZATION` = « Organisation ») — les types spécifiques à un
  marché (communes, SIVOS…) viennent de l'import ou de la saisie ;
- `Scope` « Tout le territoire » ;
- `ProjectFeature` : `SALES`, `BILLING`, `SUPPORT`, `STATS` activés ;
- `PricingGrid` version 1 **vide** (une strate « Tous », une formule « Standard » à 0 €) —
  le projet ne peut pas émettre de devis tant que la grille n'est pas renseignée
  (`PRICING_GRID_EMPTY`, 409 à la simulation).

Le projet est utilisable immédiatement pour la prospection ; les offres se configurent ensuite.

### 3.2 Écrans de paramétrage

Réglages (US-00-08), référentiels (US-00-09), périmètres (US-00-07), utilisateurs (US-00-05),
grille tarifaire (US-02-01), gabarits et cachet (US-00-08). C'est la voie normale d'ajustement.

### 3.3 Import d'un fichier de configuration — profil `PROJECT_CONFIG`

Ressource du framework d'import (SPEC-03 §2.11, SPEC-05), réservée à `settings:update` +
`references:update` + `scopes:update`, avec `dryRun` et rapport ligne par ligne comme tout import.

- **Entrée A — l'onglet ⚙️ Paramètres tel quel** : le parseur localise chaque bloc par son
  en-tête (`STATUT PROSPECTION`, `ÉTIQUETTES`, `SOURCES`, `ÉDITEURS`, `STATUTS PIPELINE`,
  `PONDÉRATION`, `SECTEURS / INSTANCES`, `ACTIONS / COMMENTAIRES`, `COMMERCIAUX`), emojis retirés,
  et lit les valeurs sous chaque en-tête jusqu'à la première cellule vide. Blocs inconnus →
  avertissement, pas d'erreur.
- **Entrée B — le gabarit OUI-CRM** (`GET /import/template?profile=PROJECT_CONFIG`, XLSX) : une
  feuille par catégorie (`Settings`, `StageProbabilities`, `ReferenceItems` avec colonnes
  `category | key | label | order | metadata`, `Scopes`, `Users`). Même parseur, même rapport.
- **Règles de fusion** : une valeur existante (même `category` + `key` normalisée) est mise à
  jour (libellé, ordre), jamais dupliquée ; une valeur absente du fichier n'est **pas** désactivée
  (l'import ajoute, il ne retire pas) ; les utilisateurs sont créés `PENDING` avec envoi
  d'activation, rattachés s'ils existent déjà.
- **Correspondances** appliquées pour l'entrée A : SPEC-05 §3.3 (sources), §3.4 (éditeurs →
  `VENDOR` + `SOLUTION`), §3.5 (actions), §3.6 (commerciaux) ; étiquettes → `TAG` + règle
  priorité ; secteurs → un `Scope` par ligne (`NORMANDIE` → région Normandie ; `OUEST` →
  Bretagne + Pays de la Loire ; valeur inconnue → `Scope` vide + avertissement) ; pondération →
  §2.
- **Idempotent** : rejouer le même fichier ne change rien (rapport : 0 créé, n inchangés).

Pour Périscolia, le seed de développement exécute ce profil sur `docs/OUICRM_v2_1.xlsx` **avant**
l'import des Leads et du Pipeline (SPEC-05), de sorte que les valeurs référencées existent.

### 3.4 Créer un projet à partir d'un autre (backoffice)

`POST /projects` accepte `copyFromProjectId?` : copie `Settings` (hors identité société),
référentiels, périmètres, `stageProbabilities`, features, grille active (en version 1 du nouveau
projet) et gabarits HTML + cachet — **jamais** les organismes, utilisateurs, devis ou contrats.
C'est le moyen le plus rapide de lancer un second produit vendu par la même équipe.

## 4. Contrat d'API (complète SPEC-07 US-00-04 et US-01-06)

| Route | Permission | Rôle |
|---|---|---|
| `POST /projects` `{ …, copyFromProjectId? }` | `projects:create` (backoffice) | Bootstrap + copie optionnelle |
| `GET /import/template?profile=PROJECT_CONFIG` | `settings:update` | Gabarit XLSX |
| `POST /import?profile=PROJECT_CONFIG&dryRun=` | `settings:update` + `references:update` + `scopes:update` | Import de configuration, rapport `ImportReport` |
| `GET /settings` → `stageProbabilities` · `PATCH /settings { stageProbabilities }` | `settings:read` / `settings:update` | `WON`/`LOST` non modifiables (`400 STAGE_PROBABILITY_FIXED`) |
| `GET /projects/:id/config-export` | `projects:read` (backoffice — livré phase D ; un export côté projet sous `/settings` avec `settings:read` pourra s'ajouter en phase G) | Export XLSX au format du gabarit — permet de dupliquer ou d'archiver une configuration |

## 5. Répercussions

- SPEC-02 §2.3 : `Settings.stageProbabilities` ; §3.2 : `copyFromProjectId`, `config-export`.
- SPEC-01 §3.7 : probabilité effective = surcharge ?? probabilité **du projet** pour l'étape.
- SPEC-05 : le profil `OUICRM_V2_1` s'exécute après `PROJECT_CONFIG` ; §3.2 note les pondérations.
- SPEC-07 US-00-04, US-00-08, US-01-06 : routes ci-dessus.
- SPEC-08 phase 4 (`ProjectBootstrapService` + `DEFAULT_PROJECT_CONFIG` + copie) et phase 7
  (`stageProbabilities` dans `Settings`) ; le profil d'import `PROJECT_CONFIG` est en **L1** avec
  le framework d'import (US-01-06), le seed L0 utilisant le même code en interne.
