-- Revue de clôture L1 : les actions créées par un import sont estampillées comme les
-- contacts — l'annulation d'un lot les retire aussi des fiches préexistantes.
ALTER TABLE "activities" ADD COLUMN "import_batch_id" TEXT;

CREATE INDEX "activities_import_batch_id_idx" ON "activities"("import_batch_id");
