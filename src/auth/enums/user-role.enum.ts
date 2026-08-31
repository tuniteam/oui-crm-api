/**
 * System role codes (SPEC-06 §4.1). Seeded by prisma/seedAuth.ts.
 * A project may duplicate a system role under its own code; those codes are not listed here.
 */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  PROJECT_ADMIN = 'PROJECT_ADMIN',
  SALES_DIRECTOR = 'SALES_DIRECTOR',
  SALES_REP = 'SALES_REP',
  DEPLOYMENT_CONSULTANT = 'DEPLOYMENT_CONSULTANT',
  TRAINER = 'TRAINER',
  BILLING_ADMIN = 'BILLING_ADMIN',
  OBSERVER = 'OBSERVER',
}
