-- KISS (04/09) : ContractStatus ne garde que les états que le L2 écrit — ACTIVE, AMENDING,
-- CLOSED. NOTICE_RECEIVED et TERMINATED n'étaient écrits par aucune route ni aucun job ; le
-- cycle de vie du L3 ajoutera ce dont il aura besoin, en sachant alors s'il veut deux statuts
-- de plus ou un statut de clôture assorti d'un motif.
-- PostgreSQL ne sait pas retirer une valeur d'un enum : on recrée le type.
ALTER TYPE "ContractStatus" RENAME TO "ContractStatus_old";
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'AMENDING', 'CLOSED');
ALTER TABLE "contracts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contracts"
  ALTER COLUMN "status" TYPE "ContractStatus" USING ("status"::text::"ContractStatus");
ALTER TABLE "contracts" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "ContractStatus_old";
