/** Identité minimale d'un utilisateur telle que les listes la renvoient. */
export interface UserRefShape {
  id: string;
  fullName: string;
  initials: string | null;
}

/**
 * Référence utilisateur d'une réponse d'API. `user` absent (compte supprimé, ou identifiant
 * qui ne résout plus) → la référence porte l'identifiant et un nom vide plutôt que `null` :
 * l'écran garde de quoi tracer la ligne.
 */
export function userRef(
  user: { id: string; firstName?: string | null; lastName?: string | null; initials?: string | null } | undefined,
  id: string,
): UserRefShape {
  return user
    ? { id: user.id, fullName: fullName(user), initials: user.initials ?? null }
    : { id, fullName: '', initials: null };
}

/** "First Last", tolerant to missing parts (e-mails, documents). */
export function fullName(user: { firstName?: string | null; lastName?: string | null }): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}
