// ============================================
// OUI-CRM - Jeu de démonstration L1 : organismes et contacts (SPEC-13 phase B)
//
// Choisi pour rendre le périmètre géographique testable avec les périmètres déjà seedés :
//   - Normandie (14, 27, 76)        → dans le périmètre de Wiem (SALES_REP, RESTRICTED)
//   - Grand Ouest (35, 44, 45)      → dans celui de Fred, hors de celui de Wiem
//   - Île-de-France et autres (75…) → hors des deux
// Les niveaux de complétude sont volontairement variés : une fiche complète, une sans
// population (devis bloqué), une quasi vide (score 0).
// ============================================

import { CustomerStatus, Priority, SalesStatus } from '@prisma/client';

export interface DemoContact {
  civility?: string;
  firstName: string;
  lastName: string;
  role?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  optOut?: boolean;
}

export interface DemoOrganization {
  name: string;
  type: string;
  department: string;
  inseeCode?: string;
  siret?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  population?: number;
  epci?: string;
  email?: string;
  phone?: string;
  solution?: string;
  schoolCount?: number;
  childCount?: number;
  services?: string[];
  salesStatus?: SalesStatus;
  customerStatus?: CustomerStatus;
  priority?: Priority;
  tags?: string[];
  leadSource?: string;
  /** Initiales de l'utilisateur affecté, résolues au seed. */
  salesRepInitials?: string;
  notes?: string;
  contacts?: DemoContact[];
}

export const PERISCOLIA_DEMO_ORGANIZATIONS: DemoOrganization[] = [
  // ---------- Normandie : périmètre de Wiem (WB) ----------
  {
    name: 'Commune de Caen',
    type: 'COMMUNE',
    department: '14',
    inseeCode: '14118',
    siret: '21140118500017',
    address: 'Esplanade Jean-Marie Louvel',
    postalCode: '14000',
    city: 'Caen',
    population: 105512,
    epci: 'CU Caen la Mer',
    email: 'contact@caen.fr',
    phone: '02 31 30 41 00',
    solution: 'BL_ENFANCE',
    schoolCount: 48,
    childCount: 6200,
    services: ['CANTEEN', 'MORNING_CARE', 'EVENING_CARE', 'ALSH_WEDNESDAY'],
    salesStatus: SalesStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    tags: ['HOT', 'PUBLIC_TENDER'],
    leadSource: 'OUTBOUND',
    salesRepInitials: 'WB',
    contacts: [
      { civility: 'Mme', firstName: 'Hélène', lastName: 'Lemarchand', role: 'DGS', email: 'h.lemarchand@caen.fr', phone: '02 31 30 41 12', isPrimary: true },
      { civility: 'M.', firstName: 'Yann', lastName: 'Dubosc', role: 'Responsable périscolaire', email: 'y.dubosc@caen.fr' },
    ],
  },
  {
    name: 'Commune de Bayeux',
    type: 'COMMUNE',
    department: '14',
    inseeCode: '14047',
    siret: '21140047600011',
    address: '19 rue Laitière',
    postalCode: '14400',
    city: 'Bayeux',
    population: 12868,
    email: 'mairie@bayeux.fr',
    solution: 'SPREADSHEET',
    salesStatus: SalesStatus.MEETING_SCHEDULED,
    priority: Priority.NORMAL,
    tags: ['HOT'],
    leadSource: 'INBOUND_CALL',
    salesRepInitials: 'WB',
    contacts: [
      { civility: 'M.', firstName: 'Pierre', lastName: 'Anquetil', role: 'Adjoint aux affaires scolaires', email: 'p.anquetil@bayeux.fr', isPrimary: true },
    ],
  },
  {
    // Sans population : la fiche est incomplète et le devis est bloqué (SPEC-04 déc. 5).
    name: 'SIVOS de la Vallée de la Risle',
    type: 'SIVOS',
    department: '27',
    siret: '25270145800019',
    address: '3 place de la Mairie',
    postalCode: '27500',
    city: 'Pont-Audemer',
    salesStatus: SalesStatus.TO_CONTACT,
    priority: Priority.LOW,
    salesRepInitials: 'WB',
    contacts: [{ firstName: 'Sylvie', lastName: 'Roussel', role: 'Présidente', email: 's.roussel@sivos-risle.fr', isPrimary: true }],
  },
  {
    // Client actif : sort d'un périmètre de nature PROSPECTS.
    name: 'Commune de Rouen',
    type: 'COMMUNE',
    department: '76',
    inseeCode: '76540',
    siret: '21760540200019',
    address: '2 place du Général de Gaulle',
    postalCode: '76000',
    city: 'Rouen',
    population: 114083,
    email: 'contact@rouen.fr',
    solution: 'CONCERTO',
    salesStatus: SalesStatus.CLOSED,
    customerStatus: CustomerStatus.ACTIVE,
    priority: Priority.HIGH,
    salesRepInitials: 'WB',
    contacts: [{ civility: 'Mme', firstName: 'Nadia', lastName: 'Berger', role: 'Directrice enfance', email: 'n.berger@rouen.fr', isPrimary: true }],
  },

  // ---------- Grand Ouest : périmètre de Fred (FY), hors de celui de Wiem ----------
  {
    name: 'Commune de Rennes',
    type: 'COMMUNE',
    department: '35',
    inseeCode: '35238',
    siret: '21350238900019',
    address: 'Place de la Mairie',
    postalCode: '35000',
    city: 'Rennes',
    population: 222485,
    email: 'contact@rennes.fr',
    solution: 'JVS_ENFANCE',
    salesStatus: SalesStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    tags: ['COMPETITOR_RENEWAL'],
    salesRepInitials: 'FY',
    contacts: [{ firstName: 'Gaël', lastName: 'Le Bihan', role: 'DGA', email: 'g.lebihan@rennes.fr', isPrimary: true }],
  },
  {
    name: 'CC du Pays de Château-Gontier',
    type: 'EPCI',
    department: '53',
    siret: '20005672900014',
    postalCode: '53200',
    city: 'Château-Gontier',
    population: 29500,
    salesStatus: SalesStatus.NOT_CONTACTED,
    salesRepInitials: 'FY',
  },
  {
    name: 'Commune de Nantes',
    type: 'COMMUNE',
    department: '44',
    inseeCode: '44109',
    siret: '21440109700010',
    address: '2 rue de l\'Hôtel de Ville',
    postalCode: '44000',
    city: 'Nantes',
    population: 320732,
    email: 'contact@nantesmetropole.fr',
    solution: 'ABEL_JEUNESSE',
    salesStatus: SalesStatus.TO_CONTACT,
    priority: Priority.NORMAL,
    salesRepInitials: 'FY',
  },

  // ---------- Hors des deux périmètres ----------
  {
    name: 'Commune de Joigny',
    type: 'COMMUNE',
    department: '89',
    inseeCode: '89206',
    siret: '21890206200013',
    address: '3 quai du 1er Dragons',
    postalCode: '89300',
    city: 'Joigny',
    population: 9820,
    epci: 'CC du Jovinien',
    email: 'contact@ville-joigny.fr',
    solution: 'NO_SOFTWARE',
    schoolCount: 6,
    childCount: 780,
    services: ['CANTEEN', 'ALSH_WEDNESDAY'],
    salesStatus: SalesStatus.TO_CONTACT,
    priority: Priority.NORMAL,
    tags: ['WATCH'],
    leadSource: 'WORD_OF_MOUTH',
    contacts: [{ civility: 'M.', firstName: 'Bernard', lastName: 'Moreau', role: 'Maire', email: 'b.moreau@ville-joigny.fr', isPrimary: true }],
  },
  {
    // Fiche quasi vide : score 0, sert à vérifier le filtre completenessMax.
    name: 'Commune de Vézelay',
    type: 'COMMUNE',
    department: '89',
    salesStatus: SalesStatus.NOT_CONTACTED,
  },
  {
    name: 'Ville de Paris — DASCO',
    type: 'COMMUNE',
    department: '75',
    inseeCode: '75056',
    siret: '21750001600019',
    postalCode: '75004',
    city: 'Paris',
    population: 2145906,
    email: 'dasco@paris.fr',
    salesStatus: SalesStatus.CLOSED,
    customerStatus: CustomerStatus.LOST_BEFORE_GOLIVE,
    priority: Priority.LOW,
  },
];
