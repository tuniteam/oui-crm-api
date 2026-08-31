# OUI-CRM — Spécification fonctionnelle

> **Source** : maquette `docs/Periscolia_OUICRM_V8.html` (V8, 4 212 lignes, persistance `localStorage`).
> **Cible** : application serveur NestJS (`oui-crm-api`) + SPA React (`oui-crm-web`).
> **Documents liés** : [SPEC-02-TECHNIQUE.md](SPEC-02-TECHNIQUE.md) (technique),
> [SPEC-03-HERITAGE-SOFT-M.md](SPEC-03-HERITAGE-SOFT-M.md) (pattern d'équipe), [SPEC-04-MOTEUR-TARIFAIRE.md](SPEC-04-MOTEUR-TARIFAIRE.md) (moteur).
> Les codes et identifiants techniques sont en **anglais** (SPEC-02 décision 12) ; ce document nomme
> les concepts en français.

---

## 1. Contexte

**OUI-CRM est un CRM pour les équipes commerciales qui promeuvent des produits ou des
services** — des logiciels en premier lieu. L'unité de travail est le **projet** : un produit ou
un service à prospecter et à vendre, avec tout ce qui lui est propre :

- ses **réglages** (identité et signataire, TVA, plafond de remise, objectifs, conservation) ;
- sa **configuration** : référentiels (types de cibles, sources de leads, concurrents, services,
  étiquettes…), périmètres géographiques, modules activés ;
- ses **offres** : formules, grille tarifaire versionnée, options, frais de mise en place,
  gabarits de devis et de contrat avec le cachet du signataire ;
- sa **base commerciale** : prospects, contacts, opportunités, devis, contrats, tickets.

Les **utilisateurs** sont communs à la plateforme et affectés à un ou plusieurs projets avec un
rôle par projet ; un commercial peut travailler sur deux produits, un formateur externe sur un
seul. Un projet ne voit jamais les données d'un autre. Techniquement, le projet joue exactement
le rôle du « client » dans `soft-m-api` (SPEC-03 §1).

**Périscolia est le premier projet** et la source de la maquette V8. Périscolia est un logiciel
de gestion périscolaire vendu aux collectivités (communes, syndicats scolaires, EPCI, CCAS,
crèches, associations) ; ses prospects sont donc des organismes publics, ses interlocuteurs des
élus, des DGS et des responsables de service, et sa facturation passe par Chorus Pro. Ces
spécificités sont **paramétrées**, pas codées en dur : types de structure, strates de population,
solutions concurrentes, mentions légales sont des référentiels et des réglages du projet.

Le CRM couvre le cycle de vie complet d'un compte client :

```
Prospection → Opportunité → Devis → Contrat → Facturation → Déploiement → Formation → Support → Renouvellement
```

**RGPD** : les données traitées sont celles de contacts professionnels (interlocuteurs des
prospects et clients). Chaque projet en est responsable de traitement ; le CRM lui fournit la
conservation paramétrable, la purge, l'opt-out et l'export individuel (§4.6). Les données des
utilisateurs finaux du logiciel vendu (par exemple les familles, pour Périscolia) ne transitent
jamais par le CRM.

## 2. Acteurs

| Rôle | Code (maquette) | Code technique | Portée | Résumé |
|---|---|---|---|---|
| Administrateur | `ADMIN` | `PROJECT_ADMIN` | Complète | Tout, y compris comptes, tarifs et restauration. 1 à 2 personnes au maximum. |
| Direction commerciale | `DIRCO` | `SALES_DIRECTOR` | Complète | Tous montants et statistiques. Valide les remises hors plafond. Ne gère pas les comptes. |
| Commercial | `COM` | `SALES_REP` | Périmètre géographique | Crée organismes, contacts, actions, opportunités, devis. Ne modifie pas les tarifs, ne supprime pas, n'exporte pas la base. |
| Consultant déploiement | `CONSULT` | `DEPLOYMENT_CONSULTANT` | Ses clients affectés | Déploiement, formations et support en écriture. Lecture seule sur devis et contrat. Aucun accès à la prospection. |
| Formateur | `FORM` | `TRAINER` | Ses sessions | Profil typiquement externe. Sessions assignées + fiche client en lecture. |
| Administration et facturation | `ADMFAC` | `BILLING_ADMIN` | Périmètre | Contrats, factures, Chorus Pro, relances. Rien sur la prospection. |
| Observateur | `OBS` | `OBSERVER` | Périmètre | Lecture seule. Stagiaire, partenaire ou intervenant ponctuel. |

Les rôles sont **paramétrables** : un rôle système peut être dupliqué puis modifié ; des rôles
personnalisés peuvent être créés librement. S'y ajoute un rôle **backoffice OUI-CRM**
(`SUPER_ADMIN`, hors projet, réservé à l'opérateur de la plateforme) qui crée et administre les
projets (SPEC-03 §2.2).

Comme dans soft-m, il y a donc deux natures d'utilisateurs : **backoffice** (affecté sans
projet, accès à tous) et **non backoffice** (un rôle par projet). À la connexion, `GET /profile/me`
renvoie la liste des projets accessibles avec, pour chacun, le rôle, les permissions effectives,
le périmètre et les modules ; l'utilisateur choisit son projet, et chaque appel suivant porte
`x-project-id` (SPEC-06 §6).

## 3. Modules fonctionnels

### 3.1 Tableau de bord

Récapitulatif de l'activité commerciale : volumes, taux de conversion, ratios, avancement vers
l'objectif de chiffre d'affaires. Filtrable par période et par portée (moi / mon équipe / un
collaborateur — la portée « équipe » n'est offerte qu'aux rôles dont les permissions de lecture ont le
scope `PROJECT` ; un commercial en scope `OWN` ne voit que ses propres montants).

Indicateurs : actions réalisées, démonstrations par mois, opportunités par étape, devis émis,
CA signé vs objectif (`settings.revenueTarget`, défaut 130 000 €), RDV vs objectif (`settings.meetingTarget`, 20).

Une démonstration est comptée **au franchissement de l'étape** par l'opportunité, pas à la
création de l'action — les deux comptages divergent et c'est le premier qui fait foi.

### 3.2 Agenda

Vue unique — calendrier mensuel ou liste — agrégeant quatre natures d'événements : actions
planifiées, sessions de formation, échéances de contrat et fins de validité de devis.
Export **ICS** (Outlook) limité aux RDV physiques et aux démonstrations.

### 3.3 Organismes

Base de référence. Une fiche réunit identité administrative, environnement périscolaire et suivi.

**Identité** : nom, type (14 valeurs), préfixe d'affichage, SIRET, code INSEE, adresse, code
postal, ville, département, population, EPCI, téléphone, email, site.
La **strate** (6 tranches de population) est calculée, jamais saisie.

**Environnement périscolaire** : solution en place (15 solutions rattachées à 14 éditeurs
concurrents), nombre d'écoles, nombre d'enfants, services périscolaires assurés (11 valeurs).

**Suivi** : statut commercial, statut client, priorité, étiquettes, **source du lead**
(prospection sortante, formulaire web, bouche à oreille, apporteur d'affaires… — référentiel
`LEAD_SOURCE`, SPEC-05 décision Q3), commercial affecté, consultant déploiement, formateur, notes.

**Création** en trois modes :

1. **Recherche officielle** — appel à l'API Recherche d'entreprises
   (`recherche-entreprises.api.gouv.fr`), pré-remplissage du SIRET, de la raison sociale, de
   l'adresse et du code INSEE. Dégradation gracieuse vers la saisie manuelle si le service ne
   répond pas : tous les champs restent modifiables.
2. **Saisie manuelle** avec détection de doublon (nom + code postal).
3. **Import XLSX / CSV** avec gabarit téléchargeable, mapping de colonnes, mode simulation et
   rapport d'import ligne par ligne. Sert aussi à la **reprise du fichier commercial existant**
   (SPEC-02 décision 8).

**Score de complétude** calculé sur SIRET, adresse, code postal, population, représentant légal
et email. Un organisme incomplet **bloque la signature** (création de contrat) ; une **population
absente ou nulle bloque déjà le devis** (SPEC-04 décision 5). L'alerte est affichée en tête de
fiche avec la liste des champs manquants.

**Fiche détaillée** (panneau latéral, 6 onglets) : Synthèse · Contacts · Actions · Commercial ·
Client · Support. Chaque onglet disparaît si le rôle n'a pas la permission `read` sur l'objet
correspondant.

**Actions de masse** : affectation de commercial, changement de statut, ajout à une campagne,
export CSV, suppression — chacune sous contrôle de droit.

### 3.4 Contacts

Rattachés à un organisme : civilité, prénom, nom, fonction, email, téléphone, mobile, indicateur
`principal` (représentant légal signataire) et **`optout`** (« ne pas démarcher », exclusion
automatique des campagnes).

### 3.5 Actions et suivi de prospection

8 types (Appel, Email, RDV physique, Visioconférence, Démonstration, Relance, Courrier, Note),
statut Planifiée / Réalisée, compte rendu et 7 résultats qualifiés (À rappeler, Intéressé, Non
intéressé, Sans réponse, Mauvais interlocuteur, RDV obtenu, Documentation envoyée).

**Suivi prospection** : vue kanban à 5 colonnes correspondant aux statuts commerciaux.

| Statut commercial | Définition |
|---|---|
| Non contacté | Aucun contact engagé à ce jour |
| À contacter | Intégré à une campagne, ou revenu en file après 6 mois |
| En cours de prospection | Au moins une action réalisée, échange engagé |
| RDV programmé | Rendez-vous ou démonstration planifié à une date future |
| Clôturé | Sans suite, hors cible, ou mis en sommeil pour 6 mois |

Le glisser-déposer d'une carte change le statut.

### 3.6 Campagnes

Ciblage nommé, daté et mesuré. Une campagne fige une liste d'organismes, porte un critère lisible
(« Normandie · 2 501–10 000 hab. · hors clients »), un propriétaire, un statut (Planifiée /
Active / Terminée) et mesure ce qu'elle produit : actions générées, opportunités ouvertes, devis,
signatures.

### 3.7 Opportunités

Pipeline à 7 étapes, chacune portant une probabilité :

| Étape | Probabilité | Définition |
|---|---:|---|
| Qualification | 10 % | Besoin identifié, interlocuteur à confirmer |
| Démonstration | 30 % | Démo planifiée ou réalisée |
| Devis envoyé | 50 % | Proposition chiffrée transmise |
| Négociation | 70 % | Discussion sur le prix, le périmètre ou le calendrier |
| Accord oral | 90 % | Validé par la collectivité, en attente de signature |
| Gagnée | 100 % | Devis signé, contrat généré |
| Perdue | 0 % | Refus, sans suite ou concurrent retenu |

Chaque changement d'étape est **historisé** (`{stage, date}`) — c'est la source des statistiques
de conversion et du délai de cycle. Une opportunité perdue porte un motif de perte.

**Probabilité** : celle de l'étape, **configurable par projet** (`Settings.stageProbabilities`,
valeurs V8 ci-dessus par défaut — SPEC-10 §2) ; un commercial peut la **surcharger** sur une
opportunité donnée (`probabilityOverride`, 0–100), par exemple pour refléter une pondération
issue du suivi Excel repris (SPEC-05 décision Q4). Le pipeline pondéré et les statistiques
utilisent `probabilityOverride ?? stageProbabilities[étape]`.

**Valorisation** : montant du devis le plus élevé rattaché ; à défaut, estimation calculée
(abonnement annuel + frais de mise en place de la formule cible sur la strate de l'organisme).

### 3.8 Devis

Le détail du calcul est en [§4.1 et §4.2](#41-grille-tarifaire).

Statuts : `Brouillon` → `À valider` → `Envoyé` → `Relancé` → `En négociation` → `Signé` /
`Refusé` / `Expiré`. Validité par défaut 30 jours.

Le statut du devis **pilote automatiquement l'étape de l'opportunité** liée :

| Statut devis | Étape opportunité |
|---|---|
| Envoyé, Relancé | Devis envoyé |
| En négociation | Négociation |
| Signé | Gagnée (+ création du contrat) |
| Refusé, Expiré | Perdue |

Effet de bord complémentaire : un devis passé en Envoyé / Relancé / En négociation fait basculer
un organisme encore `Non contacté` ou `À contacter` en `En cours de prospection`.

**Circuit de validation** : un devis dont la remise maximale dépasse le plafond
(`settings.discountCap`, défaut 30 %) passe obligatoirement en `À valider` lors de la soumission.
Seul un porteur de la permission `quotes:validate` peut l'approuver (→ `Envoyé`) ou le refuser
(→ retour `Brouillon`). La décision est tracée au journal avec le taux de remise concerné.

**Figeage** : tant qu'il est en brouillon, le devis est recalculé depuis sa configuration et la
grille active. À la soumission, ses lignes et la version de grille sont figées ; il n'est plus
jamais recalculé (SPEC-04 §3.1).

**Types de devis** : devis initial, devis additionnel, devis de renouvellement.

**Génération documentaire** : devis et contrat produits en **PDF** à partir de gabarits **HTML**
du projet (SPEC-02 décision 21) — identité de la société, organisme, signataire, lignes
d'abonnement, lignes de frais, récapitulatif pluriannuel sur 4 ans et conditions. Le **cachet +
signature** du projet est une image injectée dans le gabarit (§6.4) : le document part déjà
signé/cacheté. D'autres formats (`.docx`) pourront être exportés plus tard depuis le même gabarit.

**Signature** : pas de signature électronique (SPEC-02 décision 10). Le passage en `Signé`
(permission `quotes:sign`) exige la date de signature ; le retour signé de la collectivité peut
être joint au devis.

### 3.9 Contrats

**Créés automatiquement à la signature du devis** — jamais saisis à la main. Numéro dérivé du
devis (`DEV-` → `CTR-`).

Attributs : date de signature, date de début, durée d'engagement (défaut 36 mois), date de fin
calculée, tacite reconduction, préavis (défaut 2 mois), mode de facturation (mensuelle /
annuelle), formule, **MRR et ARR catalogue et nets** (SPEC-04 décision 2), frais one-shot, clause
d'essai, statut (`En cours` / `Préavis reçu` / `Résilié` / `Échu`).

La création du contrat bascule l'organisme en `Client en déploiement`, ouvre le dossier de
déploiement à la première étape, affecte consultant et formateur, et clôt le suivi commercial.

### 3.10 Factures

Échéancier généré depuis les contrats. **L'idempotence est une exigence dure** : relancer la
génération ne crée jamais de doublon — clé d'unicité `contrat` + `période`.

Périodes : `SETUP` (frais de mise en service) puis `M1..Mn` (mensuel) ou `A1..A4` (annuel), sur
un horizon de 12 mois glissants borné par la date de fin de contrat.

Statuts : `À émettre` → `Émise` → `Déposée Chorus` → `Payée`, plus `En retard`.
Échéance à 30 jours de l'émission.

**Bloc Chorus Pro** obligatoire pour les acheteurs publics : SIRET acheteur, code service,
numéro d'engagement. Sans ces éléments, le dépôt est rejeté par Chorus Pro — l'écran le signale
explicitement et l'état de complétude est visible dans la liste. Le **dépôt lui-même est manuel**
sur le portail Chorus Pro (SPEC-02 décision 9) : le CRM enregistre la référence et la date de dépôt.
Les mois offerts ne génèrent pas de facture.

### 3.11 Portefeuille clients

Vue des organismes sous contrat : statut, formule, MRR, dates de début et d'échéance, consultant,
avancement des formations (réalisées / planifiées), tickets ouverts, dernier échange.
KPI : nombre de clients, MRR et ARR total, MRR moyen, renouvellements sous 6 mois.

### 3.12 Déploiements

Kanban à 6 étapes : `Dossier ouvert` → `Cadrage` → `Reprise de données` → `Paramétrage` →
`Formation` → `Mise en production`. Glisser-déposer pour faire avancer une carte. Avancement
exprimé en pourcentage.

### 3.13 Formations

5 types : formation gestionnaire, formation agents, formation portail famille, formation
facturation, reprise / accompagnement.
Planification (date, heure, durée, lieu sur site ou visioconférence, formateur), statut, nombre
de participants et compte rendu à la réalisation.

### 3.14 Support

Tickets clients : 6 catégories (anomalie bloquante, anomalie mineure, paramétrage, question
fonctionnelle, facturation, demande d'évolution), 4 statuts (`Nouveau`, `En cours`,
`En attente client`, `Résolu`), priorité et assignation.

### 3.15 Renouvellements

Anticipation des échéances contractuelles. Pour chaque contrat : jours restants, **date limite de
dénonciation** = date de fin − préavis contractuel, et niveau d'alerte (30 / 60 / 90 / 180 jours),
avec l'ARR concerné par palier. Action directe depuis la ligne : créer un devis de renouvellement.

### 3.16 Statistiques

Répartition de la base (par type, strate, département, région), performance commerciale
(entonnoir de conversion, séries mensuelles) et **positionnement face aux éditeurs concurrents** :
nombre de fiches par éditeur en place, ce qui donne la carte des comptes à conquérir.

### 3.17 Paramètres

| Section | Écrans |
|---|---|
| Organisation | Société (identité, signataire) · Utilisateurs |
| Sécurité et accès | Rôles et droits · Périmètres · Journal d'activité |
| Règles métier | Règles commerciales · Grille tarifaire · Documents et numérotation · Référentiels |
| Données | Sauvegarde et conservation |

**Grille tarifaire éditable** : strates, formules, prix d'abonnement, options, frais one-shot et
extras sont modifiables par les porteurs de la permission `pricing:update`. Chaque modification
crée une **nouvelle version** de grille ; les devis déjà soumis restent sur leur version.

**Recherche globale** transverse : organismes, contacts, devis et contrats.

---

## 4. Règles métier

### 4.1 Grille tarifaire

**Strates** (par population) : 0–500 · 501–1 000 · 1 001–2 500 · 2 501–4 999 · 5 000–10 000 ·
plus de 10 000 habitants.

**Abonnement mensuel HT** par formule et par strate :

| Formule | 0–500 | 501–1k | 1k–2,5k | 2,5k–5k | 5k–10k | > 10k |
|---|---:|---:|---:|---:|---:|---:|
| ESSENTIEL | 19,90 | 24,90 | 39,90 | 49,90 | 79,90 | 129,00 |
| CONFORT | 24,90 | 39,90 | 59,90 | 79,90 | 129,90 | 199,00 |
| PREMIUM | 29,90 | 54,90 | 99,00 | 138,90 | 204,90 | 289,50 |

**Options mensuelles** (prix unitaire par strate, mêmes 6 colonnes) :

| Option | Quota inclus | Prix par strate |
|---|---:|---|
| Interface logiciel comptable | 0 | 4 · 4 · 8 · 20 · 30 · 100 |
| Profil Gestionnaire | 1 | 4 · 4 · 10 · 15 · 79,90 · 100 |
| Profil Agent Pointeur | 1 | 4 · 4 · 10 · 15 · 39,90 · 100 |
| Profil Élus & DGS | 0 | 2 · 4 · 10 · 10 · 10 · 50 |
| Profil Cuisinier | 0 | 2 · 4 · 10 · 10 · 10 · 50 |
| Interface PayFiP | 0 | 5 toutes strates |

Seule la quantité **au-delà du quota inclus** est facturée. L'abonnement comprend d'office un
profil Gestionnaire et un profil Agent Pointeur.

**Frais de mise en place** (one-shot, par formule et par strate) :

| Poste | ESSENTIEL | CONFORT / PREMIUM |
|---|---|---|
| Déploiement | 375 → 500 | 375 → 500 |
| Paramétrage | 375 → 750 | 750 → 1 250 |
| Formation | 375 → 1 250 | 750 → 1 875 |

Chaque poste peut être inclus ou retiré du devis, et remisé indépendamment.

**Extras** : tablette de pointage 500 €, pointage papier 500 €, prestation spécifique 125 €/heure.

### 4.2 Calcul d'un devis

1. Déterminer l'index de strate à partir de la population de l'organisme.
2. **MRR** = abonnement de la formule sur la strate (remise de ligne appliquée) + somme des
   options facturables (quantité au-delà du quota, remise de ligne appliquée).
3. **Frais one-shot** = somme des postes inclus (remisés) + somme des extras, ventilés en
   `frais hors formation`, `formation` et `matériel` — cette ventilation alimente le
   récapitulatif pluriannuel du document.
4. **Remise commerciale globale**, trois modes :
   - `aucune` ;
   - `pct` : X % pendant N mois (défaut 12) ;
   - `mois` : N mois offerts (défaut 2).
5. **Simulation pluriannuelle sur 4 ans** : les frais one-shot tombent intégralement en année 1 ;
   l'abonnement est réparti mois par mois depuis la date de démarrage, en projet compte de la
   période de remise. Le découpage suit les années civiles à partir de l'année de démarrage.
6. **Total 1re année HT** = abonnement de l'année 1 + frais one-shot. TVA au taux paramétré (20 %).
7. `maxDiscount` = plus forte remise du devis, **toutes lignes confondues** (abonnement, options,
   postes de mise en place, extras, remise globale) — c'est elle qui déclenche le circuit de
   validation (SPEC-04 décision 1).

Arrondis au centime, un seul arrondi final (SPEC-04 décision 3). Le détail complet de l'algorithme,
les décisions et la matrice de tests sont dans **SPEC-04**.

### 4.3 Numérotation

| Document | Format | Réinitialisation |
|---|---|---|
| Devis | `DEV-{année}-{quantième}-{initiales}{séquence}` — ex. `DEV-2026-241-WB001` | Séquence quotidienne |
| Contrat | Numéro du devis, `DEV` → `CTR` | — |
| Facture | `FAC-{année}-{séquence sur 4}` — ex. `FAC-2026-0001` | Séquence annuelle au 1er janvier |

### 4.4 Périmètres d'accès

Un périmètre combine : régions (14 régions, chacune résolue en départements), départements
explicites, restriction « portefeuille seul » (l'utilisateur est commercial, consultant ou
formateur affecté), nature (tous / prospects / clients) et campagnes.

L'évaluation de l'accès à un organisme donne trois résultats : `complet`, `restreint` ou `aucun`.
Le rôle définit le comportement **hors périmètre** :

- `aucun` — la fiche n'existe pas pour l'utilisateur ;
- `restreint` — **lecture restreinte** : l'utilisateur voit que la fiche est suivie, par qui et à
  quel stade, sans accéder aux contacts, aux montants ni aux comptes rendus. Cette visibilité
  existe pour éviter que deux commerciaux appellent la même mairie à trois jours d'intervalle ;
- `complet` — aucune restriction géographique.

### 4.5 Droits

Modèle retenu (SPEC-02 décision 4, SPEC-03 §2.2) : des **permissions** nommées `module:action`
(`organizations:read`, `quotes:validate`, `pricing:update`, `data:export`…), attribuées aux
rôles avec un **scope** :

| Scope | Portée |
|---|---|
| `ALL` | Tous les projets — rôle backoffice OUI-CRM (opérateur de la plateforme) |
| `PROJECT` | Tout le projet — direction commerciale, administration |
| `OWN` | Ses propres objets — un commercial ne voit que ses devis, opportunités, contrats et actions, y compris dans les agrégats du tableau de bord |

Les opérations appelées « droits sensibles » dans la maquette sont des permissions ordinaires,
attribuées avec parcimonie :

| Maquette | Permission | Effet |
|---|---|---|
| `exporterBase` | `organizations:export`, `data:export` | Exporter la base de prospection — le fichier commercial entier hors de l'entreprise |
| `supprimerDefinitif` | `data:purge` | Suppression définitive et purge RGPD |
| `modifierTarifs` | `pricing:update` | Nouvelle version de la grille tarifaire |
| `remiseHorsPlafond` | `quotes:discountAboveCap` | Soumettre un devis au-delà du plafond sans passer par la validation |
| `signerDevis` | `quotes:sign` | Passer un devis au statut « Signé » |
| `voirMontantsAutres` | scope `PROJECT` sur les lectures | Voir les montants et le CA des autres collaborateurs |
| `validerDevis` | `quotes:validate` | Valider ou refuser un devis en attente |
| `gererUtilisateurs` | `users:*`, `roles:update`, `scopes:update` | Gérer les comptes, rôles et périmètres |
| `restaurerSauvegarde` | `data:restore` | Restaurer les données |

**Surcharges individuelles** : un utilisateur peut recevoir une permission en plus ou en moins
par rapport à son rôle. L'écart est affiché sur sa fiche (« +2 permissions, −1 »).
Ordre d'évaluation : **retrait > ajout > rôle**.

Les comptes externes (formateurs, consultants partenaires) portent une **date d'expiration** ;
un compte expiré est refusé à chaque requête.

### 4.6 Conservation et RGPD

- Durée de conservation des prospects non convertis paramétrable, défaut **36 mois** après le
  dernier contact (recommandation CNIL : trois ans).
- Purge assistée : liste des fiches hors délai, confirmation explicite, suppression en cascade
  (organisme + contacts + actions), opération tracée au journal.
- Contacts `optout` exclus automatiquement des campagnes.
- Compteurs de pilotage : prospects sans contact depuis trois ans, fiches jamais travaillées.
- À construire côté production : registre des traitements, export des données d'une personne sur
  demande, mentions d'information dans les emails de prospection.

### 4.7 Journal d'activité

Toute opération sensible est journalisée : horodatage, utilisateur, action, objet, référence,
détail. Exportable. Couvre au minimum la validation et le refus de devis, la modification des
tarifs, la purge RGPD, la gestion des comptes, l'export de base et la restauration.

---

## 5. Écarts démo → production

La maquette est explicite sur ses propres limites. Les points suivants sont à porter côté serveur :

| Point | Dans la démo | En production |
|---|---|---|
| Droits | Appliqués à l'affichage seulement | Appliqués au serveur, sur chaque route et chaque requête |
| Persistance | `localStorage`, mono-poste | PostgreSQL, multi-utilisateur, transactionnel |
| Authentification | Sélecteur d'utilisateur libre | Sessions JWT, activation de compte par email avec consentement CGU/RGPD, verrouillage, expiration des comptes externes |
| Droits | Matrice JSON, 9 « droits sensibles » | Permissions `module:action` en base avec scope, surcharges par utilisateur (§4.5) |
| Référentiels | Figés dans le code | Tables de référence administrables sans développeur |
| Grille tarifaire | Globale et rétroactive | Versionnée : un devis émis reste figé sur la version en vigueur à sa date |
| Génération de documents | Navigateur, gabarits Word embarqués en base64 | Gabarits HTML versionnés par projet, export PDF côté serveur, remplaçables sans livraison |
| Moteur tarifaire | Recalcul permanent, arrondis à l'euro, replis silencieux | Lignes figées à la soumission, centime, erreurs explicites (SPEC-04) |
| Chorus Pro | Champs saisis, aucun dépôt | Références contrôlées, dépôt manuel tracé ; API dans un lot ultérieur |
| Signature | Statut saisi | Idem, plus retour signé joignable ; cachet du projet injecté dans le gabarit |
| Emails de prospection | Absents | Envoi tracé, mentions RGPD, lien de désinscription |
| Registre RGPD | Absent | Registre des traitements, droit d'accès et d'effacement |
| Recherche | Parcours en mémoire | Index PostgreSQL (`pg_trgm`) sur la recherche globale |

---

## 6. Annexe — Générateur de devis V2.3 (historique)

> **Décision du 31/08/2026 : seule la maquette V8 fait référence** — référence *fonctionnelle* :
> c'est une démonstration, ses raccourcis d'implémentation sont examinés un par un (SPEC-04 §1)
> et non reproduits tels quels. Le générateur
> `docs/Generateur_Devis_Periscolia_V2_3.html` n'est conservé qu'à titre historique ; en cas
> d'écart, c'est le comportement de `computeQuote()` (V8, lignes 553-607) qui s'applique.
> Conséquences : date de démarrage par défaut = date du devis + 30 jours (pas le 1er du mois M+2) ;
> engagement 36 mois par défaut, résiliable, sans option « sans engagement » ni saisie libre.

Le CRM V8 embarque une copie enrichie du générateur : même grille, même `monthlyAmount`, même
simulation pluriannuelle par années civiles, plus la validation des remises, la propagation vers
l'opportunité, la création du contrat et l'échéancier.

### 6.1 Règles du générateur V2.3 non reprises (pour mémoire)

- **Engagement** : 12 / 24 / 36 mois, `0` = sans engagement, ou saisie libre.
- **Texte de résiliation** dérivé : sans engagement → « Résiliation libre » ; engagement +
  résiliable → « Résiliable à chaque date anniversaire (préavis 2 mois) » ; sinon → « Engagement
  ferme sur la durée du contrat ».
- **Clause d'essai** : période d'essai de 4 semaines, mentionnée dans la liste de l'offre.
- **Date de démarrage** par défaut : 1er jour du mois M+2.
- **Séquence de devis** saisie manuellement dans le générateur — le CRM la calcule (§4.3).

### 6.2 Contrat de données du gabarit « Devis »

Champs fusionnés dans le gabarit (Word dans la V8, **HTML + Handlebars** dans le CRM — SPEC-02
décision 21 ; les noms de balises sont conservés). Le service `documents` doit produire exactement
cette structure :

| Groupe | Champs |
|---|---|
| Organisme | `mairie_prefixe`, `mairie_prefixe_min`, `mairie_nom`, `mairie_habitants`, `strate`, `mairie_adresse`, `mairie_cp_ville`, `mairie_siret` |
| Commercial | `contact_nom`, `contact_fonction`, `contact_email`, `signataire_periscolia` |
| Références | `ref_devis`, `date_emission`, `date_validite`, `date_signature`, `date_demarrage` |
| Conditions | `engagement_txt`, `resiliation_txt`, `conditions_txt`, `clause_essai` (bool) |
| Offre | `formule`, `abo_ht_affiche`, `offre_items[{texte}]` |
| Lignes | `lignes_abo[{nom, sous, qte, pu, remise, total}]`, `lignes_frais[{nom, qte, pu, remise, total}]` |
| Remise | `has_remise`, `remise_titre`, `remise_sous`, `remise_badge`, `remise_valeur`, `mention_abo` |
| Totaux | `total_ht_abo`, `total_tva_abo`, `total_ttc_abo`, `total_ht_frais`, `total_tva_frais`, `total_ttc_frais` |
| Pluriannuel | `py_annee1..4`, `py_frais_1..4`, `py_formation_1..4`, `py_materiel_1..4`, `py_abo_1..4`, `py_abo_1_detail`, `py_abo_note`, `py_total_ht_1..4`, `py_total_ttc_1..4` |

Les montants sont fournis **déjà formatés** (`fr-FR`, deux décimales, `—` pour zéro dans le
pluriannuel) : le gabarit ne calcule rien. S'y ajoute `signature_image` (data URI de l'image
cachet + signature du projet, vide si non configurée).

### 6.3 Gabarit « Contrat » — balises supplémentaires

Extraites de `TPL_CONTRAT` (V8) : mêmes balises que le devis (sans `offre_items`, `contact_*`,
`abo_ht_affiche`, `date_validite`, `mention_abo`), plus `ref_contrat`, `facturation`,
`representant_nom`, `representant_fonction` (contact principal de l'organisme),
`conditions_contrat_txt`, `resiliation_contrat_txt`.

### 6.4 Constats sur un devis réel (`Periscolia_Devis_DEV-2026-243-FY001.docx`)

- Conforme aux règles V8 : démarrage = émission + 30 jours, validité 30 jours, année 1 = 4 mois
  d'abonnement (CC Cœur de Nacre, PREMIUM, strate > 10 000 : 289,50 × 4 = 1 158,00).
- Le cachet + signature Périscolia est une **image statique du gabarit Word** de la V8 ; dans le
  CRM elle devient l'image `SIGNATURE_IMAGE` du projet, injectée dans le gabarit HTML (SPEC-02 §5.3).
- Identité société réelle à reprendre dans `Settings.company` : PERISCOLIA SAS, 120 rue
  Jean-Jaurès, 92300 Levallois-Perret, SIRET 10298517300016, RCS Nanterre 102 985 173,
  01 89 62 96 56, contact@periscolia.fr, signataire B.ABID.
- Mention pied de tableau « **Tarif sans revalorisation Syntec** » : l'indexation Syntec est
  hors périmètre du moteur (SPEC-04 §5) mais la mention doit rester dans le gabarit.
