import { Prisma } from '@prisma/client';
import { EMPTY_AMOUNT, MONEY_LOCALE, NBSP, PAGE_BREAK_MARKER } from './documents.constants';

/**
 * Montant imprimé : `fr-FR`, deux décimales, espace insécable fine pour les milliers. Le gabarit
 * ne calcule ni ne formate rien (SPEC-01 §6.2) — tout arrive prêt à poser.
 */
export function money(value: Prisma.Decimal | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  const formatted = amount.toLocaleString(MONEY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // `fr-FR` sépare les milliers par une espace **fine** insécable (U+202F), absente de
  // l'encodage WinAnsi des polices PDF standard : elle s'imprimerait de travers. On la ramène à
  // l'espace insécable ordinaire, qui s'imprime et qui ne coupe pas un montant en fin de ligne.
  return formatted.replace(/ /g, NBSP);
}

/** Un zéro ne s'imprime pas dans le tableau pluriannuel : il se raye. */
export function moneyOrDash(value: Prisma.Decimal | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return amount === 0 ? EMPTY_AMOUNT : money(amount);
}

/** Pourcentage de remise : « 10 % », et un tiret quand il n'y en a pas. */
export function percentOrDash(value: number): string {
  return value > 0 ? `${value} %` : EMPTY_AMOUNT;
}

/** Quantité : entière quand elle l'est, sinon deux décimales (une ligne au prorata). */
export function quantity(value: Prisma.Decimal | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(amount) ? String(amount) : money(amount);
}

/** Date imprimée en toutes lettres françaises : « 4 septembre 2026 ». */
export function frenchDate(day: Date): string {
  return day.toLocaleDateString(MONEY_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Découpe le HTML fusionné en pages. `react-pdf-html` ignore `page-break-before` (vérifié le
 * 04/09) : le gabarit déclare `<pagebreak />` et le rendu produit une page par tronçon. Un
 * gabarit sans marqueur donne une seule page — c'est le cas le plus simple, pas une erreur.
 */
export function splitPages(html: string): string[] {
  // Les commentaires partent d'abord : un gabarit qui **documente** son marqueur en commentaire
  // ne doit pas se couper dessus (constaté sur le gabarit Périscolia, 04/09).
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(PAGE_BREAK_MARKER)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * L'image de cachet en data URI, telle que le gabarit l'attend dans `<img src="{{signature_image}}">`.
 * Pas d'image configurée → chaîne vide : le document sort sans cachet, avec un avertissement en
 * en-tête, jamais un échec (SPEC-02 §5.3).
 */
export function dataUri(buffer: Buffer | null, mimeType: string | null): string {
  if (!buffer || !mimeType) return '';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/** Nom du fichier téléchargé : `<Projet>_Devis_<numero>.pdf` (SPEC-07 US-02-08). */
export function documentFileName(projectName: string, kind: string, reference: string): string {
  const slug = projectName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `${slug}_${kind}_${reference}.pdf`;
}
