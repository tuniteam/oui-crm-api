// ============================================
// OUI-CRM - Périscolia pricing grid, version 1
// Source: maquette V8 `PRICING` (docs/Periscolia_OUICRM_V8.html l.370-394), SPEC-01 §4.1.
// Structure: SPEC-04 §2.1 (PricingGridContent). Prices in € HT.
// ============================================

export const PERISCOLIA_PRICING_GRID_V1 = {
  brackets: [
    { label: '0 – 500 hab.', min: 0, max: 500 },
    { label: '501 – 1 000 hab.', min: 501, max: 1000 },
    { label: '1 001 – 2 500 hab.', min: 1001, max: 2500 },
    { label: '2 501 – 4 999 hab.', min: 2501, max: 4999 },
    { label: '5 000 – 10 000 hab.', min: 5000, max: 10000 },
    { label: 'Plus de 10 000 hab.', min: 10001, max: null },
  ],
  plans: ['ESSENTIEL', 'CONFORT', 'PREMIUM'],
  subscription: {
    ESSENTIEL: [19.9, 24.9, 39.9, 49.9, 79.9, 129],
    CONFORT: [24.9, 39.9, 59.9, 79.9, 129.9, 199],
    PREMIUM: [29.9, 54.9, 99, 138.9, 204.9, 289.5],
  },
  options: [
    { id: 0, name: 'Interface logiciel comptable', unitPrice: [4, 4, 8, 20, 30, 100] },
    { id: 1, name: 'Profil Gestionnaire', unitPrice: [4, 4, 10, 15, 79.9, 100], included: 1 },
    { id: 2, name: 'Profil Agent Pointeur', unitPrice: [4, 4, 10, 15, 39.9, 100], included: 1 },
    { id: 3, name: 'Profil Élus & DGS', unitPrice: [2, 4, 10, 10, 10, 50] },
    { id: 4, name: 'Profil Cuisinier', unitPrice: [2, 4, 10, 10, 10, 50] },
    { id: 5, name: 'Interface PayFiP', unitPrice: [5, 5, 5, 5, 5, 5] },
  ],
  setupFees: {
    deployment: {
      label: 'Déploiement',
      ESSENTIEL: [375, 375, 375, 500, 500, 500],
      CONFORT: [375, 375, 375, 500, 500, 500],
      PREMIUM: [375, 375, 375, 500, 500, 500],
    },
    configuration: {
      label: 'Paramétrage',
      ESSENTIEL: [375, 375, 750, 750, 750, 750],
      CONFORT: [750, 750, 1000, 1000, 1250, 1250],
      PREMIUM: [750, 750, 1000, 1000, 1250, 1250],
    },
    training: {
      label: 'Formation',
      ESSENTIEL: [375, 375, 500, 750, 1250, 1250],
      CONFORT: [750, 750, 750, 1250, 1875, 1875],
      PREMIUM: [750, 750, 750, 1250, 1875, 1875],
    },
  },
  extras: [
    { id: 0, name: 'Tablette de pointage', unitPrice: 500 },
    { id: 1, name: 'Pointage papier', unitPrice: 500 },
    { id: 2, name: 'Prestation spécifique (heure)', unitPrice: 125 },
  ],
};
