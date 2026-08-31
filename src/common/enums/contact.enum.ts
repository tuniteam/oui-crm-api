/**
 * Nature of an account as exposed by GET /profile/me (SPEC-06 §6):
 * BACKOFFICE = platform operator (relations without project), PROJECT = project user.
 */
export enum ContactType {
  BACKOFFICE = 'BACKOFFICE',
  PROJECT = 'PROJECT',
}
