// `round2` / `round4` ont été retirés le 07/09/2026 : personne ne les appelait, et ils
// arrondissaient en **float** alors que SPEC-04 a tranché pour `Prisma.Decimal` en HALF_UP.
// Le moteur applique cette décision dans `pricing.utils.money`. Les réintroduire pour un
// montant réintroduirait l'erreur d'arrondi que le Decimal évite.

const BYTES_PER_MB = 1024 * 1024;

/** "5MB" style label for size limits in error messages. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MB)}MB`;
}
