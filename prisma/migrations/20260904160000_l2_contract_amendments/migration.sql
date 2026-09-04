-- L2 phase G — avenants de contrat (SPEC-14 D16).
-- Diff Prisma filtré à la main : les DROP INDEX proposés sur les index GIN / trigram
-- (contracts_number_trgm_idx, quotes_number_trgm_idx, organizations_*) sont écartés — ils sont
-- écrits en SQL brut, Prisma ne les connaît pas et voudrait les supprimer à chaque migration.

-- AlterEnum : un contrat dont l'avenant est en cours.
ALTER TYPE "ContractStatus" ADD VALUE 'AMENDING';

-- AlterTable : le devis d'avenant sait quel contrat il remplace ;
-- le contrat né de sa signature garde la trace de son prédécesseur.
ALTER TABLE "quotes" ADD COLUMN "source_contract_id" TEXT;
ALTER TABLE "contracts" ADD COLUMN "source_contract_id" TEXT;

-- CreateIndex
CREATE INDEX "quotes_source_contract_id_idx" ON "quotes"("source_contract_id");
CREATE INDEX "contracts_source_contract_id_idx" ON "contracts"("source_contract_id");
-- Le job `contracts.expire` lit les AMENDING dont le successeur démarre aujourd'hui.
CREATE INDEX "contracts_project_id_status_start_date_idx" ON "contracts"("project_id", "status", "start_date");
