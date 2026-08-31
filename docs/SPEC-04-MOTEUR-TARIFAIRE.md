# OUI-CRM — Spécification du moteur tarifaire

> **Source** : `computeQuote()` de `docs/Periscolia_OUICRM_V8.html` (lignes 544-616). Décision du
> 31/08/2026 : la V8 est la seule référence **fonctionnelle** ; le générateur V2.3 n'en est plus une.
> La V8 reste une **démonstration** : ses raccourcis d'implémentation (arrondis, replis silencieux,
> valeurs en dur) ne font pas loi — chaque règle est reprise ou corrigée explicitement en §1.
> **Documents liés** : [SPEC-01 §4](SPEC-01-FONCTIONNELLE.md) (grille et règles),
> [SPEC-02 §5.1](SPEC-02-TECHNIQUE.md) (exigences techniques), [SPEC-03 §2.5](SPEC-03-HERITAGE-SOFT-M.md) (numérotation).
> Lot : **L2**. Module : `src/pricing/`.

---

## 1. Décisions tranchées (31/08/2026)

| # | Point | Comportement V8 | Décision |
|---|---|---|---|
| 1 | `maxDiscount` (déclencheur de validation) | Ignore la remise sur les extras | **Inclut toutes les lignes**, extras compris |
| 2 | MRR / ARR du contrat | Prix catalogue uniquement | **`mrrList` et `mrrNet` stockés tous les deux** ; ARR sur les deux |
| 3 | Arrondis | `mrr` au centime, totaux à l'euro entier | **Centime partout, un seul arrondi final** (`Decimal(12,2)`) |
| 4 | Date de démarrage par défaut | Date du devis + 30 jours | **V8** |
| 5 | Population absente ou nulle | Strate 0–500 silencieuse | **Devis bloqué** (`ORGANIZATION_POPULATION_REQUIRED`) |
| 6 | Prorata du premier mois | Aucun | **V8** — mois plein |
| 7 | Engagement | 36 mois par défaut, résiliable | **V8** — pas de « sans engagement » ni de saisie libre |
| 8 | Estimation d'opportunité sans devis | Frais one-shot CONFORT quelle que soit la formule | **Formule cible partout** |

---

## 2. Contrat du service

Service **pur**, sans dépendance à Prisma ni à la configuration : tout ce dont il a besoin lui
est passé en paramètre. C'est la seule implémentation du calcul — le front appelle
`POST /quotes/simulate`, jamais un portage JavaScript.

```ts
computeQuote(input: QuoteInput): QuoteResult
```

### 2.1 Entrée

```ts
interface QuoteInput {
  grid: PricingGridContent;        // version de grille figée sur le devis
  population: number;              // > 0 obligatoire (décision 5)
  vatRate: number;                 // ex. 20
  startDate: string;               // YYYY-MM-DD
  config: QuoteConfig;
}

interface QuoteConfig {
  plan: string;                    // ESSENTIEL | CONFORT | PREMIUM (clé de grid.plans)
  subscriptionDiscount: number;    // % 0–100, remise sur la ligne abonnement
  options: { id: number; qty: number; discount: number }[];
  setup: Record<string, { included: boolean; discount: number }>;  // deployment | configuration | training
  extras: { id: number; qty: number; discount: number }[];
  globalDiscount:
    | { mode: 'NONE' }
    | { mode: 'PERCENT'; percent: number; months: number }   // défaut 12 mois
    | { mode: 'FREE_MONTHS'; months: number };               // défaut 2 mois
  commitmentMonths: number;        // défaut 36
  cancellable: boolean;            // défaut true
  trialClause: boolean;            // défaut false
  billing: 'MONTHLY' | 'YEARLY';
}
```

`PricingGridContent` reprend la structure `PRICING` de la V8 : `brackets[{label,min,max}]`,
`plans[]`, `subscription{plan: number[]}`, `options[{id,name,unitPrice: number[],included?}]`,
`setupFees{key: {label, plan: number[]}}`, `extras[{id,name,unitPrice}]`.

### 2.2 Sortie

```ts
interface QuoteResult {
  bracketIndex: number;
  bracketLabel: string;
  subscriptionUnitPrice: Decimal;
  subscriptionLines: QuoteLine[];   // nature ABONNEMENT puis OPTION
  setupLines: QuoteLine[];          // nature SETUP puis EXTRA
  mrrList: Decimal;                 // Σ subscriptionLines (remises de ligne appliquées, hors remise globale)
  mrrNet: Decimal;                  // mrrList × (1 − percent) si PERCENT, sinon mrrList
  arrList: Decimal;                 // mrrList × 12
  arrNet: Decimal;                  // mrrNet × 12
  oneShot: { setup: Decimal; training: Decimal; hardware: Decimal; total: Decimal };
  monthly: (monthIndex: number) => Decimal;   // montant du mois m (0-based) depuis startDate
  firstYear: { subscription: Decimal; totalHt: Decimal; vat: Decimal; totalTtc: Decimal };
  multiYear: { years: number[]; setup: Decimal[]; training: Decimal[]; hardware: Decimal[];
               subscription: Decimal[]; months: number[]; totalHt: Decimal[]; totalTtc: Decimal[] };
  maxDiscount: number;              // % max toutes lignes + remise globale (décision 1)
}

interface QuoteLine {
  nature: 'ABONNEMENT' | 'OPTION' | 'SETUP' | 'EXTRA';
  label: string; sublabel: string;
  qty: Decimal; unitPrice: Decimal; discount: number; total: Decimal;
}
```

---

## 3. Algorithme (référence V8, amendée par §1)

1. **Strate** : premier `bracket` tel que `min ≤ population ≤ max`. Population `≤ 0` ou absente
   → erreur `ORGANIZATION_POPULATION_REQUIRED` (pas de repli).
2. **Abonnement** : `unitPrice = grid.subscription[plan][bracketIndex]`,
   `total = unitPrice × (1 − subscriptionDiscount/100)`.
3. **Options** : pour chaque option, `billedQty = max(0, qty − included)` ; si `billedQty = 0`,
   pas de ligne ; sinon `total = unitPrice[bracketIndex] × billedQty × (1 − discount/100)`.
   Libellé suffixé « (supplémentaire) » quand un quota est inclus.
4. **`mrrList`** = Σ des lignes d'abonnement et d'options.
5. **Frais one-shot** : pour chaque poste `included`, `total = unitPrice[plan][bracketIndex] ×
   (1 − discount/100)` ; ventilé `training` pour le poste `training`, `setup` pour les autres.
   Extras : `total = unitPrice × qty × (1 − discount/100)`, ventilé `hardware`.
6. **Remise globale** → `monthly(m)` :
   - `NONE` : `mrrList` ;
   - `PERCENT` : `m < months ? mrrList × (1 − percent/100) : mrrList` ;
   - `FREE_MONTHS` : `m < months ? 0 : mrrList`.
   `mrrNet` = `monthly(0)` sauf `FREE_MONTHS` où `mrrNet = mrrList` (le net « en régime »).
7. **Simulation 48 mois** : pour `m` de 0 à 47, `d = startDate + m mois` (1er du mois),
   `yearIndex = year(d) − year(startDate)` ; si `0 ≤ yearIndex ≤ 3`,
   `subscription[yearIndex] += monthly(m)`, `months[yearIndex]++`. Les one-shot vont
   intégralement en `yearIndex = 0`.
8. **Année 1** : `subscription = multiYear.subscription[0]`, `totalHt = subscription + oneShot.total`,
   `vat = totalHt × vatRate/100`, `totalTtc = totalHt + vat`.
9. **`maxDiscount`** = max(`subscriptionDiscount`, `percent` si `PERCENT`, tous les `discount`
   d'options, de postes one-shot **et d'extras**).
10. **Arrondi** : tous les calculs en `Decimal` non arrondi ; arrondi `ROUND_HALF_UP` au centime
    sur chaque `total` de ligne et sur chaque agrégat au moment de le renvoyer. Les agrégats sont
    la somme des lignes **arrondies**, pour que le document recoupe la somme de ses lignes.

### 3.1 Règles hors moteur mais dépendantes

- **Validation** : `maxDiscount > settings.discountCap` (défaut 30) → statut `PENDING_VALIDATION`,
  permission `quotes:validate` requise pour passer en `SENT`.
- **Contrat** (`contracts`) : `mrrList`, `mrrNet`, `arrList`, `arrNet`, `oneShot` copiés depuis
  le résultat au moment de la signature (décision 2).
- **Échéancier** (`invoices`) : `SETUP` = `oneShot.total` ; puis `M{n}` = `monthly(n−1)` ou
  `A{n}` = Σ `monthly` sur les 12 mois de l'année `n`, sur 12 mois glissants bornés par la fin
  de contrat. Lignes à `0` (mois offerts) **non créées**.
- **Estimation d'opportunité** (`opportunities`) : sans devis,
  `subscription[targetPlan][bracket] × 12 + Σ setupFees[*][targetPlan][bracket]` (décision 8).
- **Figeage** : à la soumission, les `QuoteLine` sont copiées en `QuoteLine` de base et
  `grid.version` est référencée ; le devis n'est plus recalculé.

---

## 4. Matrice de tests (`pricing.service.spec.ts`)

Les valeurs attendues sont calculées à la main depuis la grille de SPEC-01 §4.1.

### 4.1 Strates et formules (18 cas)

Pour chaque formule × chaque strate, configuration par défaut (options au quota inclus, trois
postes one-shot inclus, aucun extra, remise `NONE`), population = borne basse de la strate :

| Cas | Population | Attendu `mrrList` | Attendu `oneShot.total` |
|---|---:|---|---|
| ESSENTIEL / 0–500 | 1 | 19,90 | 375 + 375 + 375 = 1 125,00 |
| ESSENTIEL / > 10 000 | 10 001 | 129,00 | 500 + 750 + 1 250 = 2 500,00 |
| CONFORT / 2 501–4 999 | 2 501 | 79,90 | 500 + 1 000 + 1 250 = 2 750,00 |
| PREMIUM / 5 000–10 000 | 5 000 | 204,90 | 500 + 1 250 + 1 875 = 3 625,00 |
| … | | (les 14 autres, mêmes règles) | |

Bornes : population 500 → strate 0 ; 501 → strate 1 ; 10 000 → strate 4 ; 10 001 → strate 5.

### 4.2 Options et quotas

| Cas | Config | Attendu |
|---|---|---|
| Quota inclus non dépassé | Gestionnaire qty 1, Pointeur qty 1 | aucune ligne OPTION |
| Quota dépassé | CONFORT strate 2, Gestionnaire qty 3 | ligne « Profil Gestionnaire (supplémentaire) », qty 2, PU 10,00, total 20,00 ; `mrrList` = 79,90 |
| Option sans quota | PayFiP qty 1, toute strate | ligne PU 5,00, total 5,00 |
| Remise de ligne | Interface comptable strate 5, qty 1, discount 50 | total 50,00 ; `maxDiscount` ≥ 50 |
| Qty négative ou non numérique | qty −1 | traitée comme 0 |

### 4.3 Remise globale et `monthly(m)`

`mrrList` = 100,00 pour lisibilité (CONFORT strate 4 = 129,90 à utiliser dans le test réel).

| Mode | Config | `monthly(0)` | `monthly(11)` | `monthly(12)` | `mrrNet` |
|---|---|---:|---:|---:|---:|
| NONE | — | 100 | 100 | 100 | 100 |
| PERCENT | 20 %, 12 mois | 80 | 80 | 100 | 80 |
| PERCENT | 100 %, 6 mois | 0 | 100 | 100 | 0 |
| PERCENT | 10 %, 60 mois | 90 | 90 | 90 | 90 |
| FREE_MONTHS | 2 mois | 0 | 100 | 100 | 100 |
| FREE_MONTHS | 60 mois | 0 | 0 | 0 | 100 |

### 4.4 Simulation pluriannuelle

| Cas | `startDate` | Attendu |
|---|---|---|
| Démarrage en janvier | 2027-01-01, NONE, mrr 100 | `months` = [12, 12, 12, 12], `subscription` = [1 200, 1 200, 1 200, 1 200] |
| Démarrage en septembre | 2026-09-15, NONE, mrr 100 | `months` = [4, 12, 12, 12], `subscription` = [400, 1 200, 1 200, 1 200] ; année 1 = 4 mois + one-shot |
| Démarrage au 31 décembre | 2026-12-31, NONE, mrr 100 | `months` = [1, 12, 12, 12] — le mois de décembre compte plein (décision 6) |
| Promo à cheval | 2026-09-01, PERCENT 20 % / 12 mois, mrr 100 | `subscription` = [320, 80×8 + 100×4 = 1 040, 1 200, 1 200] |
| One-shot en année 1 seulement | tout cas | `setup[1..3]`, `training[1..3]`, `hardware[1..3]` = 0 |

### 4.5 `maxDiscount` (décision 1)

| Config | Attendu |
|---|---|
| Aucune remise | 0 |
| `subscriptionDiscount` 15 | 15 |
| PERCENT 25 % + option à 10 % | 25 |
| Extra tablette à 40 %, rien d'autre | **40** (la V8 aurait renvoyé 0) |
| Poste formation à 100 % | 100 |

### 4.6 Arrondis (décision 3)

| Cas | Attendu |
|---|---|
| ESSENTIEL strate 0, NONE, 12 mois | `arrList` = 238,80 (pas 239) |
| PREMIUM strate 3 (138,90) avec remise 33 % | ligne = 93,06 (93,063 → HALF_UP) ; `mrrList` = 93,06 ; `arrList` = 1 116,72 = 12 × 93,06 (somme des lignes arrondies) |
| TVA 20 % sur 1 116,72 + 2 750 | `vat` = 773,34 ; `totalTtc` = 4 640,06 |

### 4.7 Erreurs

| Cas | Attendu |
|---|---|
| `population` 0, absent ou négatif | `ORGANIZATION_POPULATION_REQUIRED` (décision 5) |
| `plan` inconnu de la grille | `PRICING_PLAN_UNKNOWN` |
| Discount hors 0–100 | borné (clamp) à 0–100, comme la V8 |
| Grille avec strate ajoutée (7 tranches) | tableaux de prix étendus par répétition de la dernière valeur (`syncGrille` V8) — testé côté `PricingGridService`, pas dans le moteur |

### 4.8 Non-régression V8

Reprendre les six devis « Signé » du jeu de démonstration V8 (organismes 1 à 6 : Joigny PREMIUM,
Fécamp PREMIUM promo 20 %/12 + 4 tablettes, Montlouis CONFORT, Colleville formation −25 %, SIVOS
Val d'Orne promo 30 %/6 + 2 tablettes, Ploërmel options Élus ×2) et vérifier que `mrrList`,
`oneShot.total` et `multiYear.subscription` égalent les valeurs de la maquette **au centime**,
en projet compte des décisions 1 et 3 (les écarts attendus sont documentés dans le test).

---

## 5. Hors périmètre du moteur

- Indexation annuelle des prix, révision de grille en cours de contrat.
- Prorata journalier, facturation à l'usage.
- Remises cumulées ou dégressives par volume d'écoles.
- Devis multi-organismes (mutualisation EPCI) — un devis = un organisme.
