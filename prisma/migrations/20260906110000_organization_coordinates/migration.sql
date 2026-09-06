-- Coordonnées de la mairie (repli : centroïde de la commune), source geo.api.gouv.fr.
-- Destinées à l'affichage cartographique. Float et non Decimal : une coordonnée n'est pas
-- un montant, et une carte attend un nombre JSON.
ALTER TABLE "organizations" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "organizations" ADD COLUMN "longitude" DOUBLE PRECISION;
