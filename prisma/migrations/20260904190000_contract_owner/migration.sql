-- Le contrat porte son commercial (celui du devis signé). Sans ce champ, la portée OWN de
-- `contracts:read` — que le catalogue de permissions donne au commercial — s'appliquerait sur
-- une colonne inexistante : `buildScopeWhere` produit `{ projectId, ownerId }` par défaut.
ALTER TABLE "contracts" ADD COLUMN "owner_id" TEXT;
ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "contracts_project_id_owner_id_idx" ON "contracts"("project_id", "owner_id");
