import { DocumentType, Prisma } from '@prisma/client';
import {
  contractNumber,
  dayOfYear,
  formatDocumentNumber,
  invoiceNumber,
  nextDocumentNumbers,
  periodKeyOf,
  quoteNumber,
} from './document-number.utils';
import { toDate } from './date.utils';

/** Séquence en mémoire : un `upsert` qui incrémente, comme la table (SPEC-01 §4.3). */
function fakeDb(initial: Record<string, number> = {}) {
  const rows = { ...initial };
  return {
    rows,
    documentNumberSequence: {
      upsert: ({ where, create, update }: any) => {
        const { projectId, type, periodKey } = where.projectId_type_periodKey;
        const key = `${projectId}|${type}|${periodKey}`;
        rows[key] = rows[key] === undefined ? create.lastNumber : rows[key] + update.lastNumber.increment;
        return Promise.resolve({ lastNumber: rows[key] });
      },
    },
  } as any;
}

describe('document-number.utils — quantième', () => {
  it('numbers the days from 1 on January 1st', () => {
    expect(dayOfYear(toDate('2026-01-01'))).toBe(1);
    expect(dayOfYear(toDate('2026-08-31'))).toBe(243);
    expect(dayOfYear(toDate('2026-12-31'))).toBe(365);
  });

  it('counts the leap day', () => {
    expect(dayOfYear(toDate('2028-02-29'))).toBe(60);
    expect(dayOfYear(toDate('2028-12-31'))).toBe(366);
  });
});

describe('document-number.utils — clé de période', () => {
  it('keys quotes by day, on 3 digits — the VarChar(10) of the table', () => {
    expect(periodKeyOf(DocumentType.QUOTE, toDate('2026-01-01'))).toBe('2026-001');
    expect(periodKeyOf(DocumentType.QUOTE, toDate('2026-08-31'))).toBe('2026-243');
    expect(periodKeyOf(DocumentType.QUOTE, toDate('2026-08-31')).length).toBeLessThanOrEqual(10);
  });

  it('keys invoices by year', () => {
    expect(periodKeyOf(DocumentType.INVOICE, toDate('2026-08-31'))).toBe('2026');
  });
});

describe('document-number.utils — format', () => {
  const quote = { projectId: 'p1', type: DocumentType.QUOTE, initials: 'WB', day: toDate('2026-08-31') };

  it('formats a quote as DEV-year-dayOfYear-initials+rank (SPEC-01 §4.3)', () => {
    expect(formatDocumentNumber(quote, 1)).toBe('DEV-2026-243-WB001');
    expect(formatDocumentNumber(quote, 42)).toBe('DEV-2026-243-WB042');
    expect(formatDocumentNumber(quote, 999)).toBe('DEV-2026-243-WB999');
  });

  it('upper-cases the initials', () => {
    expect(formatDocumentNumber({ ...quote, initials: 'fy' }, 7)).toBe('DEV-2026-243-FY007');
  });

  it('keeps the number inside the VarChar(30) of the column', () => {
    expect(formatDocumentNumber({ ...quote, initials: 'ABC' }, 999).length).toBeLessThanOrEqual(30);
  });

  it('rejects a quote without initials instead of numbering it anonymously', () => {
    expect(() => formatDocumentNumber({ ...quote, initials: null }, 1)).toThrow();
  });

  it('formats an invoice as FAC-year-rank on 4 digits, without initials', () => {
    const invoice = { projectId: 'p1', type: DocumentType.INVOICE, day: toDate('2026-08-31') };
    expect(formatDocumentNumber(invoice, 1)).toBe('FAC-2026-0001');
    expect(formatDocumentNumber(invoice, 1234)).toBe('FAC-2026-1234');
  });
});

describe('document-number.utils — numéro de contrat (SPEC-01 §3.9)', () => {
  it('derives the contract number from the signed quote, DEV → CTR', () => {
    expect(contractNumber('DEV-2026-241-WB001')).toBe('CTR-2026-241-WB001');
  });

  it('keeps the rest of the reference untouched, whatever its length', () => {
    expect(contractNumber('DEV-2026-001-ABC999')).toBe('CTR-2026-001-ABC999');
  });
});

describe('document-number.utils — formateurs directs', () => {
  const aug29 = new Date(Date.UTC(2026, 7, 29, 12));

  it('formats a quote from a day, initials and a rank', () => {
    expect(dayOfYear(aug29)).toBe(241);
    expect(quoteNumber(aug29, 'WB', 1)).toBe('DEV-2026-241-WB001');
    expect(quoteNumber(new Date(Date.UTC(2026, 0, 1)), 'FY', 12)).toBe('DEV-2026-001-FY012');
  });

  it('formats an invoice on a yearly sequence', () => {
    expect(invoiceNumber(aug29, 7)).toBe('FAC-2026-0007');
  });
});

describe('document-number.utils — attribution', () => {
  const base = { projectId: 'p1', type: DocumentType.QUOTE, initials: 'WB', day: toDate('2026-08-31') };

  it('starts the daily sequence at 001 and follows on', async () => {
    const db = fakeDb();
    expect(await nextDocumentNumbers(db, base)).toEqual(['DEV-2026-243-WB001']);
    expect(await nextDocumentNumbers(db, base)).toEqual(['DEV-2026-243-WB002']);
  });

  it('reserves several consecutive numbers in one write (import)', async () => {
    const db = fakeDb();
    expect(await nextDocumentNumbers(db, { ...base, count: 3 })).toEqual([
      'DEV-2026-243-WB001',
      'DEV-2026-243-WB002',
      'DEV-2026-243-WB003',
    ]);
    expect(await nextDocumentNumbers(db, base)).toEqual(['DEV-2026-243-WB004']);
  });

  it('shares the daily sequence between owners — the initials do not split the counter', async () => {
    const db = fakeDb();
    expect(await nextDocumentNumbers(db, base)).toEqual(['DEV-2026-243-WB001']);
    expect(await nextDocumentNumbers(db, { ...base, initials: 'FY' })).toEqual(['DEV-2026-243-FY002']);
  });

  it('restarts at 001 the next day', async () => {
    const db = fakeDb();
    await nextDocumentNumbers(db, base);
    expect(await nextDocumentNumbers(db, { ...base, day: toDate('2026-09-01') })).toEqual(['DEV-2026-244-WB001']);
  });

  it('keeps one sequence per project', async () => {
    const db = fakeDb();
    await nextDocumentNumbers(db, base);
    expect(await nextDocumentNumbers(db, { ...base, projectId: 'p2' })).toEqual(['DEV-2026-243-WB001']);
  });

  it('does not consume a rank when the initials are missing', async () => {
    const db = fakeDb();
    await expect(nextDocumentNumbers(db, { ...base, initials: null })).rejects.toThrow();
    expect(await nextDocumentNumbers(db, base)).toEqual(['DEV-2026-243-WB001']);
  });

  it('propagates a duplicate to the caller instead of retrying inside an aborted transaction', async () => {
    const db = fakeDb();
    db.documentNumberSequence.upsert = () =>
      Promise.reject(new Prisma.PrismaClientKnownRequestError('duplicate key', { code: 'P2002', clientVersion: 'test' }));
    await expect(nextDocumentNumbers(db, base)).rejects.toThrow('duplicate key');
  });

  it('reserves several consecutive numbers in one write (import)', async () => {
    const db = fakeDb();
    expect(await nextDocumentNumbers(db, { ...base, count: 3 })).toEqual([
      'DEV-2026-243-WB001',
      'DEV-2026-243-WB002',
      'DEV-2026-243-WB003',
    ]);
    expect(await nextDocumentNumbers(db, base)).toEqual(['DEV-2026-243-WB004']);
  });

  it('shares the daily sequence between owners — the initials do not split the counter', async () => {
    const db = fakeDb();
    expect(await nextDocumentNumbers(db, base)).toEqual(['DEV-2026-243-WB001']);
    expect(await nextDocumentNumbers(db, { ...base, initials: 'FY' })).toEqual(['DEV-2026-243-FY002']);
  });

  it('restarts at 001 the next day', async () => {
    const db = fakeDb();
    await nextDocumentNumbers(db, base);
    expect(await nextDocumentNumbers(db, { ...base, day: toDate('2026-09-01') })).toEqual(['DEV-2026-244-WB001']);
  });

  it('keeps one sequence per project', async () => {
    const db = fakeDb();
    await nextDocumentNumbers(db, base);
    expect(await nextDocumentNumbers(db, { ...base, projectId: 'p2' })).toEqual(['DEV-2026-243-WB001']);
  });

  it('does not consume a rank when the initials are missing', async () => {
    const db = fakeDb();
    await expect(nextDocumentNumbers(db, { ...base, initials: null })).rejects.toThrow();
    expect(await nextDocumentNumbers(db, base)).toEqual(['DEV-2026-243-WB001']);
  });

  it('propagates a duplicate instead of retrying inside a transaction the failure already aborted', async () => {
    // L'upsert porte sur une clé unique : Postgres l'exécute en INSERT … ON CONFLICT, donc le
    // doublon ne devrait pas survenir. S'il survient, le rattraper ici serait vain — dans une
    // transaction avortée toute requête suivante échoue — c'est à l'appelant de rejouer.
    const db = fakeDb();
    db.documentNumberSequence.upsert = () =>
      Promise.reject(
        new Prisma.PrismaClientKnownRequestError('duplicate key', { code: 'P2002', clientVersion: 'test' }),
      );
    await expect(nextDocumentNumbers(db, base)).rejects.toThrow('duplicate key');
  });
});
