import { Priority, SalesStatus } from '@prisma/client';
import {
  canonical,
  deduceType,
  extractContact,
  levenshtein,
  mapEtiquette,
  mapLeadStatus,
  mapSource,
  normalizePhone,
  padDepartment,
} from './ouicrm.utils';

describe('canonical', () => {
  it('strips emojis and tidies spaces before comparing', () => {
    expect(canonical('🎯  Leads ')).toBe('LEADS');
    expect(canonical('⚙️ Paramètres')).toBe('PARAMÈTRES');
    expect(canonical('📋 STATUT PROSPECTION')).toBe('STATUT PROSPECTION');
  });
});

describe('mapLeadStatus (§3.1)', () => {
  it('maps the workbook statuses, empty means to contact', () => {
    expect(mapLeadStatus('RDV PRIS 🔄')).toBe(SalesStatus.MEETING_SCHEDULED);
    expect(mapLeadStatus('Opportunité detectée ✅')).toBe(SalesStatus.IN_PROGRESS);
    expect(mapLeadStatus('Opportunité abandonnée 🔄')).toBe(SalesStatus.CLOSED);
    expect(mapLeadStatus('')).toBe(SalesStatus.TO_CONTACT);
    expect(mapLeadStatus('Statut inventé')).toBeUndefined();
  });
});

describe('mapEtiquette (Q2)', () => {
  it('Chaud carries priority and the HOT tag; the workbook writes Tiede unaccented', () => {
    expect(mapEtiquette('Chaud')).toEqual({ priority: Priority.HIGH, tag: 'HOT' });
    expect(mapEtiquette('Tiede')).toEqual({ priority: Priority.NORMAL });
    expect(mapEtiquette('Froid')).toEqual({ priority: Priority.LOW });
    expect(mapEtiquette('')).toEqual({ priority: Priority.NORMAL });
    expect(mapEtiquette('Brûlant')).toBeUndefined();
  });
});

describe('mapSource (§3.3)', () => {
  it('maps the eight sources, Plezi variant included', () => {
    expect(mapSource('Prospection')).toEqual({ key: 'OUTBOUND', composite: false });
    expect(mapSource('Plezi -Formulaire site web').key).toBe('WEB_FORM');
  });

  it('composite cells keep the first value and ask for a warning', () => {
    expect(mapSource('Prospection | Formulaire site web')).toEqual({ key: 'OUTBOUND', composite: true });
  });
});

describe('deduceType (§2.1) and padDepartment', () => {
  it('reads the structure from the name prefix', () => {
    expect(deduceType("Mairie d'Avesnes-en-Val")).toBe('COMMUNE');
    expect(deduceType('SIVOS de la Source 76')).toBe('SIVOS');
    expect(deduceType('SIVOM Falaise Sud 14')).toBe('SIVOM');
    expect(deduceType('Communauté de communes du Serein')).toBe('EPCI');
    expect(deduceType('Pigny')).toBeNull(); // COMMUNE with a warning, decided by the caller
  });

  it('pads single-digit departments', () => {
    expect(padDepartment('1')).toBe('01');
    expect(padDepartment('2A')).toBe('2A');
    expect(padDepartment('76')).toBe('76');
  });
});

describe('extractContact (§4)', () => {
  it('reads civility + UPPERCASE name before the colon, phone normalized in pairs', () => {
    const contact = extractContact('Mme RASSE : 1 Devis Confort. rappeler au 0235342401 fin août');
    expect(contact).toEqual({ civility: 'Mme', lastName: 'Rasse', phone: '02 35 34 24 01' });
  });

  it('handles a missing space after the civility and composed names', () => {
    expect(extractContact('M.BASSET : 2 Devis')).toMatchObject({ civility: 'M.', lastName: 'Basset' });
    expect(extractContact("Mme LE GOFF-MARTIN : devis")?.lastName).toBe('Le Goff-Martin');
  });

  it('gives up on mixed-case names — best effort, a human takes over', () => {
    expect(extractContact('Mme COURCHé : Devis Confort')).toBeNull();
    expect(extractContact('M. Reux lisiak - panne technique')).toBeNull();
    expect(extractContact('Relancé à 2 reprises')).toBeNull();
  });

  it('normalizes +33 numbers', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('06 12 34 56 78');
  });
});

describe('levenshtein (§5)', () => {
  it('flags near-identical keys within the bound', () => {
    expect(levenshtein('76::avesnes-en-val', '76::avesnes-en-va', 2)).toBe(1);
    expect(levenshtein('76::eletot', '76::eletot', 2)).toBe(0);
  });

  it('cuts off quickly beyond the bound', () => {
    expect(levenshtein('76::eletot', '76::saint-hellier', 2)).toBe(3);
  });
});
