// ============================================
// OUI-CRM - Périscolia project configuration (first project, SPEC-01 §1)
// Sources: maquette V8 référentiels (TYPES, EDITEURS, SERVICES, ETIQUETTES…),
// classeur OUICRM_v2_1.xlsx onglet ⚙️ Paramètres (SPEC-05 §3, SPEC-10 §2),
// devis réel (SPEC-01 §6.4) pour l'identité société.
// ============================================

import * as path from 'path';
import { UserRole } from '../../src/auth/enums/user-role.enum';
import { ProjectConfig } from '../../src/projects/project-config.constants';

/** Stamp + signature image injected into quote/contract PDFs (SPEC-01 §6.4). */
export const PERISCOLIA_SIGNATURE_IMAGE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'cachet-signature-periscolia.png',
);

export const PERISCOLIA_PROJECT = {
  slug: 'periscolia',
  name: 'Périscolia',
  productName: 'Périscolia — gestion périscolaire',
  description:
    'Logiciel de gestion périscolaire (garderie, cantine, ALSH, portail famille) vendu aux collectivités.',
};

const territorial = { territorial: true };

/**
 * Overrides applied on top of DEFAULT_PROJECT_CONFIG by bootstrapProject().
 */
export const PERISCOLIA_CONFIG: Partial<ProjectConfig> = {
  settings: {
    vatRate: 20,
    revenueTarget: 130000,
    meetingTarget: 20,
    quoteValidityDays: 30,
    noticeMonths: 2,
    defaultCommitmentMonths: 36,
    discountCap: 30,
    retentionMonths: 36,
    // Pondération du classeur (SPEC-10 §2) sur les étapes où elle diverge de la V8
    stageProbabilities: { QUOTE_SENT: 25, NEGOTIATING: 60, VERBAL_AGREEMENT: 80 },
    company: {
      name: 'PERISCOLIA SAS',
      siren: '102 985 173',
      siret: '10298517300016',
      rcs: 'RCS Nanterre 102 985 173',
      address: '120 rue Jean-Jaurès, 92300 Levallois-Perret',
      phone: '01 89 62 96 56',
      email: 'contact@periscolia.fr',
      signatory: 'B.ABID',
    },
  },
  referenceItems: {
    STRUCTURE_TYPE: [
      { key: 'COMMUNE', label: 'Commune', metadata: { ...territorial, prefix: 'Commune de ' } },
      { key: 'TOWN_HALL', label: 'Mairie', metadata: { ...territorial, prefix: 'Mairie de ' } },
      { key: 'SIVOS', label: 'SIVOS', metadata: territorial },
      { key: 'SIVU', label: 'SIVU', metadata: territorial },
      { key: 'SIVOM', label: 'SIVOM', metadata: territorial },
      { key: 'MIXED_SYNDICATE', label: 'Syndicat mixte', metadata: territorial },
      { key: 'EPCI', label: 'EPCI / Communauté de communes', metadata: { ...territorial, prefix: 'Communauté de communes ' } },
      { key: 'AGGLOMERATION', label: "Communauté d'agglomération", metadata: territorial },
      { key: 'CCAS', label: 'CCAS', metadata: territorial },
      { key: 'PUBLIC_NURSERY', label: 'Crèche publique', metadata: { territorial: false } },
      { key: 'PRIVATE_NURSERY', label: 'Crèche privée', metadata: { territorial: false } },
      { key: 'PRIVATE_SCHOOL', label: 'École privée sous contrat', metadata: { territorial: false } },
      { key: 'ASSOCIATION', label: 'Association gestionnaire', metadata: { territorial: false } },
      { key: 'OTHER', label: 'Autre structure périscolaire', metadata: { territorial: false } },
    ],
    TAG: [
      { key: 'WATCH', label: 'À surveiller' },
      { key: 'PUBLIC_TENDER', label: 'Marché public en cours' },
      { key: 'COMPETITOR_RENEWAL', label: 'Renouvellement concurrent' },
      { key: 'RECOMMENDATION', label: 'Recommandation' },
    ],
    SERVICE: [
      { key: 'MORNING_CARE', label: 'Garderie du matin' },
      { key: 'EVENING_CARE', label: 'Garderie du soir' },
      { key: 'CANTEEN', label: 'Restauration scolaire' },
      { key: 'STUDY', label: 'Étude surveillée' },
      { key: 'ALSH_WEDNESDAY', label: 'ALSH mercredi' },
      { key: 'ALSH_HOLIDAYS', label: 'ALSH vacances' },
      { key: 'SCHOOL_TRANSPORT', label: 'Transport scolaire' },
      { key: 'ACTIVITIES', label: 'TAP / activités' },
      { key: 'FAMILY_PORTAL', label: 'Portail famille' },
      { key: 'FAMILY_BILLING', label: 'Facturation familles' },
      { key: 'TABLET_ATTENDANCE', label: 'Pointage tablette' },
    ],
    VENDOR: [
      { key: 'NONE', label: 'Sans éditeur' },
      { key: 'BERGER_LEVRAULT', label: 'Berger-Levrault' },
      { key: 'JVS_MAIRISTEM', label: 'JVS-Mairistem' },
      { key: 'ARPEGE', label: 'Arpège' },
      { key: '3D_OUEST', label: '3D Ouest' },
      { key: 'ABELIUM', label: 'Abelium' },
      { key: 'AIGA', label: 'Aiga' },
      { key: 'TECHNOCARTE', label: 'Technocarte' },
      { key: 'CIRIL', label: 'Ciril Group' },
      { key: 'ENTROUVERT', label: "Entr'ouvert" },
      { key: 'PARASCOL', label: 'Parascol' },
      { key: 'AGORA_PLUS', label: 'Agora Plus' },
      { key: 'COSOLUCE', label: 'Cosoluce' },
    ],
    SOLUTION: [
      { key: 'NO_SOFTWARE', label: 'Aucun logiciel identifié', metadata: { vendor: 'NONE' } },
      { key: 'SPREADSHEET', label: 'Excel / papier', metadata: { vendor: 'NONE' } },
      { key: 'BL_ENFANCE', label: 'BL Enfance', metadata: { vendor: 'BERGER_LEVRAULT' } },
      { key: 'E_ENFANCE', label: 'e-Enfance / e-GRC', metadata: { vendor: 'BERGER_LEVRAULT' } },
      { key: 'JVS_ENFANCE', label: 'JVS Enfance', metadata: { vendor: 'JVS_MAIRISTEM' } },
      { key: 'CONCERTO', label: 'Concerto', metadata: { vendor: 'ARPEGE' } },
      { key: 'PORTAIL_3D_OUEST', label: 'Portail Familles 3D Ouest', metadata: { vendor: '3D_OUEST' } },
      { key: 'ABEL_JEUNESSE', label: 'AbelJeunesse / Noé', metadata: { vendor: 'ABELIUM' } },
      { key: 'AIGA_ENFANCE', label: 'Aiga Enfance', metadata: { vendor: 'AIGA' } },
      { key: 'INOE', label: 'iNoé', metadata: { vendor: 'AIGA' } },
      { key: 'TECHNOCARTE', label: 'Technocarte', metadata: { vendor: 'TECHNOCARTE' } },
      { key: 'CIVIL_NET_ENFANCE', label: 'Civil Net Enfance', metadata: { vendor: 'CIRIL' } },
      { key: 'PUBLIK', label: 'Publik', metadata: { vendor: 'ENTROUVERT' } },
      { key: 'PARASCOL', label: 'Parascol', metadata: { vendor: 'PARASCOL' } },
      { key: 'AGORA_PLUS', label: 'Agora Plus', metadata: { vendor: 'AGORA_PLUS' } },
      { key: 'COSOLUCE', label: 'Cosoluce', metadata: { vendor: 'COSOLUCE' } },
      { key: 'IN_HOUSE', label: 'Développement interne', metadata: { vendor: 'NONE' } },
      { key: 'OTHER', label: 'Autre solution', metadata: { vendor: 'NONE' } },
    ],
  },
  scopes: [
    { name: 'France entière', description: 'Aucune restriction géographique.', regions: [], departments: [], portfolioOnly: false },
    { name: 'Normandie', description: 'Les cinq départements normands.', regions: ['Normandie'], departments: [], portfolioOnly: false },
    { name: 'Grand Ouest hors Normandie', description: '', regions: ['Bretagne', 'Pays de la Loire', 'Centre-Val de Loire'], departments: [], portfolioOnly: false },
    { name: 'Mes clients uniquement', description: 'Les fiches dont le collaborateur est consultant, formateur ou commercial affecté.', regions: [], departments: [], portfolioOnly: true },
  ],
};

/**
 * All demo accounts are Gmail aliases of one real mailbox, so activation / reset e-mails are
 * actually delivered (decision 31/08/2026): email.ouicrm+<alias>@gmail.com.
 */
export const DEMO_MAILBOX = 'email.ouicrm@gmail.com';
export const demoEmail = (alias: string): string =>
  DEMO_MAILBOX.replace('@', `+${alias}@`);

/**
 * Demo users (maquette V8, SPEC-06 §5). Password = SEED_PASSWORD. External accounts expire in one year.
 * Identified by initials within the project: re-seeding after an e-mail change renames the account.
 */
export const PERISCOLIA_USERS = [
  { email: demoEmail('admin'), firstName: 'Abdoulaye', lastName: 'S.', initials: 'AS', role: UserRole.PROJECT_ADMIN, scope: 'France entière', external: false },
  { email: demoEmail('wiem'), firstName: 'Wiem', lastName: 'Bousaid', initials: 'WB', role: UserRole.SALES_REP, scope: 'Normandie', external: false },
  { email: demoEmail('fred'), firstName: 'Fred', lastName: 'Yolland', initials: 'FY', role: UserRole.SALES_REP, scope: 'Grand Ouest hors Normandie', external: false },
  { email: demoEmail('bassem'), firstName: 'Bassem', lastName: 'A.', initials: 'BA', role: UserRole.PROJECT_ADMIN, scope: 'France entière', external: false },
  { email: demoEmail('camille'), firstName: 'Camille', lastName: 'Fontaine', initials: 'CF', role: UserRole.TRAINER, scope: 'Mes clients uniquement', external: true },
  { email: demoEmail('sofia'), firstName: 'Sofia', lastName: 'Marchetti', initials: 'SM', role: UserRole.DEPLOYMENT_CONSULTANT, scope: 'Mes clients uniquement', external: true },
];

export const PLATFORM_SUPER_ADMIN = {
  email: demoEmail('superadmin'),
  firstName: 'Super',
  lastName: 'Admin',
  initials: 'SA',
};
