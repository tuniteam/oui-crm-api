/** "First Last", tolerant to missing parts (e-mails, documents). */
export function fullName(user: { firstName?: string | null; lastName?: string | null }): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}
