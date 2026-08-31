# OUI-CRM — Import de reprise du classeur `OUICRM_v2_1.xlsx`

> **Source** : `docs/OUICRM_v2_1.xlsx` (14/08/2026), suivi commercial Périscolia tenu sur Excel.
> **Décision liée** : SPEC-02 décision 8 (reprise de l'existant, import prioritaire en L1).
> **Cadre** : framework d'import de SPEC-03 §2.11 (`ImportResource`, `dryRun`, rapport ligne par ligne).
> Lot : **L1**. Import **ponctuel** (une exécution en recette, une en production), mais construit
> comme un profil d'import réutilisable (`OUICRM_V2_1`).
> Statut : 5 décisions tranchées le 31/08/2026 (§6) ; spec prête pour le lot L1.
> **Préalable** : l'onglet ⚙️ Paramètres est importé d'abord par le profil `PROJECT_CONFIG`
> (SPEC-10 §3.3) — référentiels, périmètres, commerciaux, probabilités par étape — pour que les
> valeurs référencées par Leads et Pipeline existent.

---

## 1. Ce que contient le classeur

| Feuille | Lignes utiles | Contenu | Reprise |
|---|---|---|---|
| `🎯 Leads` | ~62 (données à partir de la ligne 7 ; ligne 5 = en-têtes, ligne 6 = type de champ) | Un lead = une collectivité : département, nom, source, étiquette (Chaud/Tiède/Froid), éditeur en place, statut de prospection, commentaire libre, date de RDV, commentaire 2 (colonne I sans en-tête) | **Oui** → organismes, activités, contacts (partiel) |
| `📋 Pipeline Opportunités` | 61 (données à partir de la ligne 6 ; ligne 5 = en-têtes ; lignes 1-4 = totaux) | Un devis par ligne : n° devis, commercial, secteur, département, collectivité, date d'envoi, statut, dernière action, date prochaine action, pondération, mois de signature prévu, abonnement €, prestations €, total €, date de signature, ancien éditeur, client ? | **Oui** → organismes (complément), opportunités, devis hérités, activités |
| `⚙️ Paramètres` | 30 | Listes de valeurs du classeur : statuts de prospection, étiquettes, sources, éditeurs, statuts pipeline, pondérations, secteurs, mois, actions, commerciaux | **Oui** → profil `PROJECT_CONFIG` (SPEC-10 §3.3) : référentiels, périmètres, commerciaux, probabilités par étape ; tables de correspondance (§3) pour les enums |
| `Feuil1` | 7 | Extrait de 7 lignes du pipeline | **Non** — redondant |

Absents du classeur, donc **non repris** : SIRET, code INSEE, adresse, code postal, ville
(le nom de la collectivité en tient lieu), population, EPCI, email, téléphone structuré,
nombre d'écoles, services. La **complétude** de chaque organisme importé sera faible : c'est
attendu, le CRM le signale sur chaque fiche et l'enrichissement (Recherche d'entreprises) se
fait ensuite fiche par fiche.

Lignes à ignorer automatiquement : lignes de titre et de totaux (1-4), ligne « type de champ »
(`Champs saisie`, `Liste déroulante`, `Saisie date`, `Case à cocher…`), lignes dont la
collectivité est vide.

---

## 2. Mapping des colonnes

### 2.1 `Leads` → `Organization` (+ `Activity`, `Contact`)

| Colonne | Champ cible | Règle |
|---|---|---|
| A `Dept` | `department` | Complété sur 2 caractères (`1` → `01`) ; `2A`/`2B` acceptés ; sinon rejet |
| B `Commune / Collectivité` | `name` + `type` | Nom conservé tel quel (espaces normalisés). `type` déduit du préfixe : `Mairie`, `Commune` → `COMMUNE` ; `SIVOS` → `SIVOS` ; `SIVU`, `SIVOM`, `CC`, `Communauté` → type correspondant ; sinon `COMMUNE` avec avertissement |
| C `Source` | `leadSource` | Table §3.3 (décision Q3) |
| D `etiquuette` | `priority` + tag | Chaud → `HIGH` + tag `HOT` ; Tiède → `NORMAL` ; Froid → `LOW` (décision Q2) |
| E `Éditeur` | `solution` | Table §3.4 ; valeur inconnue → `OTHER` + avertissement |
| F `Statut Prospection` | `salesStatus` | Table §3.1 |
| G `Commentaire` | `notes` + `Contact` + `Activity` | Copié intégralement dans `notes`. Extraction **best effort** d'un contact (§4) et d'une activité `NOTE` |
| H `DATE RDV` | `Activity` | Si renseignée : activité `MEETING` (`RDV physique`) à cette date, `DONE` si passée, `PLANNED` sinon, rattachée au commercial par défaut (décision Q1) |
| I (sans en-tête) | `notes` | Concaténé à la suite du commentaire, séparateur ` — ` |

Champs fixés : `projectId` = Périscolia, `salesRepId` = Wiem Bousaid (décision Q1),
`customerStatus` = `NOT_CUSTOMER`, `createdAt` = date d'import, `importBatchId` = identifiant
du lot (pour pouvoir annuler l'import d'un bloc).

### 2.2 `Pipeline Opportunités` → `Organization` (complément), `Opportunity`, `Quote` hérité, `Activity`

Chaque ligne = un devis. Plusieurs lignes peuvent viser la même collectivité (61 lignes, 43
collectivités) : **une opportunité par collectivité**, plusieurs devis rattachés.

| Colonne | Champ cible | Règle |
|---|---|---|
| A `N° Devis` | `Quote.legacyNumber` | Conservé tel quel (`2026-137-WB02`) ; **pas de renumérotation**. Vide → devis créé sans numéro hérité, avertissement |
| B `Commercial` | `Opportunity.ownerId`, `Quote.ownerId`, `Organization.salesRepId` | Table §3.6 ; inconnu → commercial par défaut + avertissement |
| C `SECTEUR` | contrôle | Sert à vérifier la cohérence avec le département ; non stocké (la région se déduit du département). `OUEST` accepté sans contrôle |
| D `Dept` | `department` | Comme Leads |
| E `Commune / Collectivité` | rapprochement d'organisme | §5 — crée l'organisme s'il n'existe pas dans Leads |
| F `Date Envoi` | `Quote.issueDate`, `Opportunity.createdAt` | Date ; vide → date d'import + avertissement |
| G `Statut` | `Opportunity.stage`, `Quote.status` | Table §3.2 |
| H `Action/commentaire` | `Activity` réalisée | Table §3.5 ; datée de `Date Envoi` (seule date connue), `DONE` |
| I `Date prochaine Action` | `Activity` planifiée | Activité `FOLLOW_UP` (`Relance`) `PLANNED` à cette date ; passée → `PLANNED` quand même, elle apparaîtra en retard dans l'agenda (c'est l'état réel) |
| J `Pondération` | `Opportunity.probabilityOverride` | Valeur 25–90 reprise telle quelle ; elle remplace la probabilité de l'étape pour cette opportunité (décision Q4). Vide → `null` (probabilité de l'étape) |
| K `Mois Signature Prévisionnel` | `Opportunity.expectedCloseDate` | Mois → dernier jour du mois, année = année de `Date Envoi` si le mois est postérieur, sinon année + 1 |
| L `Abos €` | `Quote.arrList`, `mrrList = arrList / 12` | Le montant est **annuel** (238,80 = 19,90 × 12 ; 958,80 = 79,90 × 12). Vérification : si `Abos / 12` ne correspond à aucun prix de la grille active, avertissement |
| M `Prestas €` | `Quote.oneShotTotal` | Frais de mise en place (et matériel) |
| N `Total €` | contrôle | Doit valoir `L + M` à 0,01 près, sinon avertissement (le classeur contient des écarts : ex. 238,80 + 1 062,50 = 1 301,30 ✓) |
| O `Date signature` | `Quote.signedAt` | Renseignée avec statut `Signé - Validé` → devis `SIGNED` daté ; statut signé sans date → `signedAt` = `Date Envoi` + avertissement. **Aucun contrat créé** (décision Q5) |
| P `Ancien Éditeur` | `Organization.solution` | Table §3.4, seulement si l'organisme n'a pas déjà une solution issue de Leads |
| Q `➔ Client?` | avertissement | Coché → avertissement `CUSTOMER_FLAG_IGNORED` : l'organisme reste `NOT_CUSTOMER` tant que le contrat n'est pas créé à la main (décision Q5) |

Le devis hérité est créé avec `origin = IMPORTED`, `config = null`, deux `QuoteLine`
synthétiques (« Abonnement — repris du classeur » et « Prestations — repris du classeur »),
`pricingGridId` = grille active, `maxDiscount = 0`. Il est **figé** (jamais recalculé) et
identifiable dans les listes par son origine. Il n'est pas régénérable en PDF.

### 2.3 Non repris

Totaux et KPI des lignes 1-4 (recalculés par le CRM), `Feuil1`, mois de signature comme
texte, pondération comme probabilité.

---

## 3. Tables de correspondance

### 3.1 Statut de prospection (Leads F) → `salesStatus` / opportunité

| Classeur | `salesStatus` | Opportunité créée |
|---|---|---|
| `RDV PRIS 🔄` | `MEETING_SCHEDULED` | Non (sauf si présente dans Pipeline) |
| `Opportunité detectée ✅` | `IN_PROGRESS` | Oui, étape `QUALIFICATION` si aucun devis en Pipeline |
| `Opportunité abandonnée 🔄` | `CLOSED` | Oui si présente dans Pipeline (étape `LOST`), sinon non |
| vide | `TO_CONTACT` | Non |

### 3.2 Statut pipeline (Pipeline G) → étape d'opportunité / statut de devis

| Classeur | `Opportunity.stage` | `Quote.status` |
|---|---|---|
| `Analyse devis` | `QUOTE_SENT` | `SENT` |
| `Relance` | `QUOTE_SENT` | `FOLLOWED_UP` |
| `Négociation` | `NEGOTIATING` | `NEGOTIATING` |
| `Accord Oral` | `VERBAL_AGREEMENT` | `NEGOTIATING` |
| `Signé - Validé ✅` | `WON` | `SIGNED` |
| `Sans suite - SS` | `LOST` (motif `NO_RESPONSE`) | `EXPIRED` |
| `Abandonné / Perdu` | `LOST` (motif `ABANDONED`) | `REJECTED` |

Une opportunité avec plusieurs devis prend l'étape **la plus avancée** ; un devis `SIGNED`
l'emporte sur tout.

### 3.3 Source (Leads C) → `LEAD_SOURCE` (référentiel, question Q3)

`Prospection` → `OUTBOUND` · `Formulaire site web`, `Plezi -Formulaire site web` → `WEB_FORM` ·
`Bouche à oreille` → `WORD_OF_MOUTH` · `Campagne marketing` → `MARKETING` ·
`Apporteur affaire` → `REFERRAL_PARTNER` · `Appel entrant` → `INBOUND_CALL` ·
`Transfert Lead` → `LEAD_TRANSFER` · `Parrainage` → `SPONSORSHIP`.
Valeurs composées (`Prospection | Formulaire site web`) → première valeur + avertissement.

### 3.4 Éditeur (Leads E, Pipeline P) → `SOLUTION` (référentiel V8, complété)

| Classeur | Solution cible | Éditeur |
|---|---|---|
| `BL`, `BL-enfance` | `BL Enfance` | Berger-Levrault |
| `JVS mairistem`, `JVS Mairistem (Ex Modularis)`, `Jvs-Paraschool`, `MODULARIS`, `Papier + JVS Compta` | `JVS Enfance` | JVS-Mairistem |
| `Inoé` | `iNoé` — **à ajouter** | Aiga |
| `Arpège` | `Concerto` | Arpège |
| `3DOUEST` | `Portail Familles 3D Ouest` | 3D Ouest |
| `Agora-Plus` | `Agora Plus` — **à ajouter** | Agora Plus |
| `COSOLUCE` | `Cosoluce` — **à ajouter** | Cosoluce |
| `Papier`, `papier`, `Papier -msg`, `Régie` | `Excel / papier` | — |
| `Non equipée` | `Aucun logiciel identifié` | — |
| `autres`, inconnu | `Autre solution` | — |

### 3.5 Action (Pipeline H) → `ACTIVITY_TYPE`

`📞 Appel sortant`, `📲 Appel entrant`, `☎️ RDV téléphonique` → `CALL` · `📤 Email envoyé`,
`📥 Email reçu` → `EMAIL` · `💻 RDV visio` → `VIDEO_MEETING` · `🤝 RDV physique` → `MEETING` ·
`🖥️ Démonstration` → `DEMO` · `📄 Devis envoyé` → `EMAIL` (résultat `DOCUMENTATION_SENT`) ·
`🔁 Relance 1/2/3` → `FOLLOW_UP` (le rang dans le compte rendu) · `📝 Note interne` → `NOTE` ·
`⚡ Autre` → `NOTE`. Les emojis sont retirés avant comparaison.

### 3.6 Commerciaux (Pipeline B, Paramètres)

`Wiem B.` → Wiem Bousaid (`WB`) · `Fred Y.` → Fred Yolland (`FY`) · `Commercial 3/4/5` → non
affectés (valeurs de démonstration du classeur) → commercial par défaut + avertissement.

---

## 4. Extraction des contacts depuis le commentaire (best effort)

Le commentaire des Leads suit souvent le motif `Civilité NOM : … téléphone`. Règle :

1. Civilité + nom : `^(M\.|Mme|Mr|Mlle)\s*([A-ZÉÈÀÇ' -]{2,})\s*:` → `Contact.civility`,
   `Contact.lastName` (mis en casse normale : `RASSE` → `Rasse`), `isPrimary = true` (unique
   contact, on suppose le décideur), `role = ""` (inconnu).
2. Téléphone : premier motif `(\+33|0)\s?\d([ .]?\d{2}){4}` → `Contact.phone`, normalisé
   `02 35 34 24 01`.
3. Le reste du commentaire (« 2 devis : Confort/Essentiel +2 agents. Strate 1001-2500 ») reste
   dans `Organization.notes` et devient une `Activity` `NOTE` datée de `DATE RDV` ou de la date
   d'import.
4. Pas de motif reconnu → pas de contact, avertissement « contact non extrait ».
5. Chaque contact extrait est marqué `metadata.extractedFromNote = true` pour révision manuelle.

Aucun email n'est disponible : les contacts importés sont donc **inéligibles aux campagnes
email** tant qu'ils ne sont pas complétés.

---

## 5. Rapprochement et doublons

Clé de rapprochement d'un organisme, en l'absence de SIRET : `department` + nom **normalisé**
(minuscules, accents retirés, préfixes `mairie de`, `mairie d'`, `commune de`, `ville de`
retirés, espaces réduits). Ainsi `Mairie Avesnes-en-Val` (Pipeline) et `Mairie d'Avesnes-en-Val`
(Leads) sont la même fiche.

- Même clé dans Leads et Pipeline → une seule fiche, champs fusionnés (Leads prioritaire pour
  `solution`, `salesStatus`, `priority` ; Pipeline prioritaire pour `salesRepId`).
- Même clé sur deux lignes de Leads → seconde ligne rejetée (`DUPLICATE_LEAD`), les deux
  commentaires reportés dans le rapport.
- Fiche déjà présente dans le CRM (import relancé) → mise à jour des champs vides uniquement,
  jamais d'écrasement ; les devis hérités sont rapprochés par `legacyNumber`.
- Noms trop proches sans être identiques (distance de Levenshtein ≤ 2 sur la clé, même
  département) → avertissement `POSSIBLE_DUPLICATE`, les deux fiches sont créées.

---

## 6. Décisions tranchées (31/08/2026)

| # | Question | Décision | Conséquence |
|---|---|---|---|
| Q1 | Commercial par défaut des Leads | **Wiem Bousaid** | `salesRepId` = WB pour les organismes issus de Leads ; le Pipeline corrige ligne par ligne |
| Q2 | Étiquettes Chaud / Tiède / Froid | **Priorité + tag « Chaud »** | Chaud → `HIGH` + tag `HOT` ; Tiède → `NORMAL` ; Froid → `LOW` |
| Q3 | Source du lead | **Champ `Organization.leadSource`** + référentiel `LEAD_SOURCE` | Ajout au modèle (SPEC-02 §2.3-2.4) ; alimente les stats d'origine des clients |
| Q4 | Pondération du classeur | **Remplace la probabilité de l'étape** | Nouveau champ `Opportunity.probabilityOverride` (0–100, nullable) : renseigné par l'import, ajustable à la main ; la pondération d'une opportunité = `probabilityOverride ?? probabilité de l'étape` (SPEC-01 §3.7, SPEC-02 §2.5) |
| Q5 | Devis « Signé - Validé » | **Devis signés seulement, pas de contrat** | Les 5 devis sont importés en `SIGNED` avec `signedAt` ; **aucun contrat, aucun échéancier**, l'organisme reste `NOT_CUSTOMER`. La création du contrat se fera à la main (route `POST /quotes/:id/sign` rejouée) une fois la fiche complétée — les factures passées restent hors CRM |

---

## 7. Livrable de l'import

- `POST /import?dryRun=true` avec le profil `OUICRM_V2_1` → rapport `{ totals, resources[],
  errors[], warnings[] }` par feuille et par ligne Excel ; puis `POST /import` une fois le
  rapport accepté.
- Rapport attendu sur le fichier actuel (ordre de grandeur) : ~60 organismes créés, ~40
  opportunités, 61 devis hérités, ~120 activités, ~40 contacts extraits, ~20 avertissements
  (valeurs composées, éditeurs inconnus, contacts non extraits, totaux incohérents).
- Tout élément importé porte `importBatchId` : un lot peut être **annulé en bloc** tant qu'aucune
  modification manuelle n'a été faite sur ses fiches.
- Export du rapport en PDF (`POST /import/errors-pdf`) pour relecture par l'équipe commerciale.
