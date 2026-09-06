-- ============================================
-- SPEC-15 · Suppression physique de l'organisme et du contact (06/09/2026)
--
-- La suppression logique disparaît : devis, opportunités et activités étaient déjà supprimés
-- physiquement, organisme et contact étaient les deux dernières exceptions. Les dépendances
-- descriptives (contacts, activités, appartenances aux campagnes) partent par les cascades
-- déjà déclarées ; les dépendances engageantes (devis, contrats, opportunités, documents)
-- bloquent la suppression côté service (409 ORGANIZATION_HAS_ENGAGEMENTS).
--
-- Les trois index concernés sont écrits en SQL brut (Prisma ne les exprime pas) : ils sont
-- reconstruits ici sans leur clause `deleted_at IS NULL`, devenue sans objet.
-- ============================================

-- 0. Les lignes encore en suppression logique deviendraient vivantes une fois la colonne
-- retirée : on honore le geste de suppression d'origine en les effaçant. Les dépendances
-- (contacts, activités, appartenances aux campagnes) partent par les cascades du schéma.
DELETE FROM "organizations" WHERE "deleted_at" IS NOT NULL;
DELETE FROM "contacts" WHERE "deleted_at" IS NOT NULL;

-- 1. Index partiels dépendant de la colonne
DROP INDEX IF EXISTS "organizations_project_siret_key";
DROP INDEX IF EXISTS "organizations_project_insee_code_key";
DROP INDEX IF EXISTS "contacts_organization_primary_key";

-- 2. Les colonnes
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "deleted_at";

-- 3. Les mêmes unicités, désormais totales
-- Postgres ignore les NULL en unicité : les fiches sans SIRET ni code INSEE ne se gênent pas.
CREATE UNIQUE INDEX "organizations_project_siret_key"
  ON "organizations"("project_id", "siret");

CREATE UNIQUE INDEX "organizations_project_insee_code_key"
  ON "organizations"("project_id", "insee_code");

-- Au plus un contact principal par organisme (SPEC-13 §2.2, US-01-04).
CREATE UNIQUE INDEX "contacts_organization_primary_key"
  ON "contacts"("organization_id")
  WHERE "is_primary";
