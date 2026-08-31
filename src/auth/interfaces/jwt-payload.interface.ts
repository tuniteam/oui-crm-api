/**
 * Payload of access and refresh tokens. `version` is compared with Session.version on every
 * request: a refresh rotates the version and invalidates every token issued before.
 */
export interface JwtPayload {
  userId: string;
  sessionId: string;
  version: number;
}
