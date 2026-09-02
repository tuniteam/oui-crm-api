-- Relations Organization -> User pour salesRep, consultant et trainer.
-- Sans ces clés étrangères, un identifiant pouvait désigner un compte inexistant :
-- même exigence d'intégrité que la décision D7 sur les campagnes d'un périmètre.
-- ON DELETE SET NULL : la fiche survit au départ de son commercial, non affectée.

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
