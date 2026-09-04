import { Prisma } from '@prisma/client';
import { toDate } from '@/common/utils/date.utils';
import { NBSP } from './documents.constants';
import {
  dataUri,
  documentFileName,
  frenchDate,
  money,
  moneyOrDash,
  percentOrDash,
  quantity,
  splitPages,
} from './documents.utils';

describe('formatage des montants (SPEC-01 §6.2 — le gabarit ne calcule rien)', () => {
  it('imprime deux décimales et sépare les milliers par une insécable imprimable', () => {
    // U+00A0, jamais l'espace fine U+202F de `fr-FR` : les polices PDF standard ne la portent pas.
    expect(money(new Prisma.Decimal('1750'))).toBe(`1${NBSP}750,00`);
    expect(money(79.9)).toBe('79,90');
    expect(money(0)).toBe('0,00');
  });

  it('raye un zéro du tableau pluriannuel plutôt que d’imprimer 0,00', () => {
    expect(moneyOrDash(0)).toBe('—');
    expect(moneyOrDash(new Prisma.Decimal('2478.6'))).toBe(`2${NBSP}478,60`);
  });

  it('n’imprime une remise que s’il y en a une', () => {
    expect(percentOrDash(10)).toBe('10 %');
    expect(percentOrDash(0)).toBe('—');
  });

  it('garde les quantités entières entières', () => {
    expect(quantity(3)).toBe('3');
    expect(quantity(new Prisma.Decimal('1.5'))).toBe('1,50');
  });

  it('écrit les dates en toutes lettres, en UTC', () => {
    expect(frenchDate(toDate('2026-09-04'))).toBe('4 septembre 2026');
    expect(frenchDate(toDate('2026-01-01'))).toBe('1 janvier 2026');
  });
});

describe('splitPages (le saut de page du gabarit)', () => {
  it('coupe sur le marqueur', () => {
    expect(splitPages('<p>une</p><pagebreak /><p>deux</p>')).toEqual(['<p>une</p>', '<p>deux</p>']);
  });

  it('rend une seule page quand le gabarit n’en déclare aucune — le cas le plus simple', () => {
    expect(splitPages('<p>tout tient</p>')).toEqual(['<p>tout tient</p>']);
  });

  it('ignore un marqueur cité dans un commentaire : documenter n’est pas couper', () => {
    const html = '<!-- <pagebreak /> marque une coupure --><p>une seule page</p>';
    expect(splitPages(html)).toEqual(['<p>une seule page</p>']);
  });

  it('ne rend pas de page vide', () => {
    expect(splitPages('<pagebreak /><p>une</p><pagebreak />')).toEqual(['<p>une</p>']);
  });
});

describe('dataUri (le cachet du projet)', () => {
  it('produit une data URI que le gabarit sait afficher', () => {
    expect(dataUri(Buffer.from('png'), 'image/png')).toBe('data:image/png;base64,cG5n');
  });

  it('rend une chaîne vide sans image : un document sans cachet vaut mieux qu’une erreur', () => {
    expect(dataUri(null, 'image/png')).toBe('');
    expect(dataUri(Buffer.from('png'), null)).toBe('');
  });
});

describe('documentFileName', () => {
  it('nomme le fichier par le projet, le type et la référence', () => {
    expect(documentFileName('Périscolia', 'Devis', 'DEV-2026-247-WB014')).toBe(
      'Périscolia_Devis_DEV-2026-247-WB014.pdf',
    );
  });

  it('remplace ce qui ne s’écrit pas dans un nom de fichier', () => {
    expect(documentFileName('Projet / Test 2026', 'Devis', 'DEV-1')).toBe('Projet-Test-2026_Devis_DEV-1.pdf');
  });
});
