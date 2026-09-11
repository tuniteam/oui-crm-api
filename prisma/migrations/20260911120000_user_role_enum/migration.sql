-- UserRole devient un enum Prisma comme les autres : le seed de production le lit depuis
-- @prisma/client, l'image n'ayant pas src/. Aucune colonne ne l'utilise (Role.code reste libre).
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'PROJECT_ADMIN', 'SALES_DIRECTOR', 'SALES_REP', 'DEPLOYMENT_CONSULTANT', 'TRAINER', 'BILLING_ADMIN', 'OBSERVER');
