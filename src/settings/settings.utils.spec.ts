import { DocumentTemplateType } from '@prisma/client';
import { REQUIRED_TEMPLATE_TAGS } from './settings.constants';
import {
  activeTemplates,
  collectTemplateTags,
  mergeCompany,
  mergeStageProbabilities,
  numberingExamples,
  validateTemplate,
} from './settings.utils';

const quoteTemplate = (tags: readonly string[]): string =>
  `<html><body>${tags.map((t) => (t.startsWith('lignes') ? `{{#each ${t}}}<tr><td>{{nom}}</td></tr>{{/each}}` : `{{${t}}}`)).join('')}<img src="{{signature_image}}"></body></html>`;

describe('settings.utils — templates', () => {
  it('collects mustache tags, block params and nested paths', () => {
    const tags = collectTemplateTags('{{a}} {{#each rows}}{{nom}}{{/each}} {{#if has_remise}}{{remise_valeur}}{{else}}{{none}}{{/if}}');
    expect([...tags]).toEqual(expect.arrayContaining(['a', 'rows', 'nom', 'has_remise', 'remise_valeur', 'none']));
  });

  it('accepts a template referencing every required tag', () => {
    expect(validateTemplate(quoteTemplate(REQUIRED_TEMPLATE_TAGS.QUOTE), DocumentTemplateType.QUOTE)).toEqual([]);
  });

  it('lists each missing required tag', () => {
    const issues = validateTemplate('<html><body>{{mairie_nom}}</body></html>', DocumentTemplateType.CONTRACT);
    expect(issues).toContain('missing: ref_contrat');
    expect(issues).toContain('missing: signature_image');
    expect(issues).not.toContain('missing: mairie_nom');
  });

  it('reports a Handlebars syntax error as a single parse issue', () => {
    const issues = validateTemplate('<html>{{#each lignes_abo}}{{nom}}</html>', DocumentTemplateType.QUOTE);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^parse: /);
  });

  it('keeps the latest file of each type as active, with its rank as version', () => {
    const d = (n: number): Date => new Date(Date.UTC(2026, 8, n));
    const items = activeTemplates([
      { id: 'q3', fileName: 'q3.html', uploadedAt: d(3), templateType: DocumentTemplateType.QUOTE },
      { id: 'c1', fileName: 'c1.html', uploadedAt: d(2), templateType: DocumentTemplateType.CONTRACT },
      { id: 'q2', fileName: 'q2.html', uploadedAt: d(2), templateType: DocumentTemplateType.QUOTE },
      { id: 'q1', fileName: 'q1.html', uploadedAt: d(1), templateType: DocumentTemplateType.QUOTE },
      { id: 'x', fileName: 'x.html', uploadedAt: d(1), templateType: null },
    ]);
    expect(items).toEqual([
      { type: 'QUOTE', version: 3, fileId: 'q3', fileName: 'q3.html', uploadedAt: d(3) },
      { type: 'CONTRACT', version: 1, fileId: 'c1', fileName: 'c1.html', uploadedAt: d(2) },
    ]);
  });
});

describe('settings.utils — stage probabilities and company', () => {
  const stored = { QUOTE_SENT: 25, NEGOTIATING: 60, VERBAL_AGREEMENT: 80 };

  it('always returns the 7 stages: patch > stored > V8 default, WON/LOST fixed', () => {
    expect(mergeStageProbabilities(stored, { NEGOTIATING: 65 })).toEqual({
      QUALIFICATION: 10,
      DEMONSTRATION: 30,
      QUOTE_SENT: 25,
      NEGOTIATING: 65,
      VERBAL_AGREEMENT: 80,
      WON: 100,
      LOST: 0,
    });
  });

  it('rejects an unknown stage, a non-integer, an out-of-range value', () => {
    expect(() => mergeStageProbabilities(stored, { CLOSED: 5 })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => mergeStageProbabilities(stored, { QUOTE_SENT: 12.5 })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => mergeStageProbabilities(stored, { QUOTE_SENT: 101 })).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('refuses to change WON or LOST but tolerates their fixed values', () => {
    expect(() => mergeStageProbabilities(stored, { WON: 90 })).toThrow(/STAGE_PROBABILITY_FIXED|cannot be changed/);
    expect(mergeStageProbabilities(stored, { WON: 100, LOST: 0 }).WON).toBe(100);
  });

  it('merges company fields and always returns the 8 keys', () => {
    const merged = mergeCompany({ name: 'PERISCOLIA SAS', siren: '102 985 173' }, { siren: '', phone: '01 89 62 96 56' });
    expect(merged).toEqual({
      name: 'PERISCOLIA SAS',
      siren: '',
      siret: '',
      rcs: '',
      address: '',
      phone: '01 89 62 96 56',
      email: '',
      signatory: '',
    });
  });
});

describe('settings.utils — numbering examples (SPEC-01 §4.3)', () => {
  // Le format lui-même est testé une seule fois, avec son formateur
  // (common/utils/document-number.utils.spec.ts) : ici on vérifie seulement que les exemples
  // servis au front sortent bien de ce formateur.
  it('shows the three documents of a project, built by the single formatter', () => {
    expect(numberingExamples(new Date(Date.UTC(2026, 7, 29, 12)), 'WB')).toEqual({
      quote: 'DEV-2026-241-WB001',
      contract: 'CTR-2026-241-WB001',
      invoice: 'FAC-2026-0001',
    });
  });
});
