-- Horaires d'ouverture de la mairie (source : Annuaire de l'administration), affichage seul.
ALTER TABLE "organizations" ADD COLUMN "opening_hours" JSONB;
