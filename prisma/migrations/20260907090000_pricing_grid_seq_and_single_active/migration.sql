-- ============================================
-- SPEC-18 · Une seule grille active, des numéros de version jamais réutilisés (07/09/2026)
-- ============================================

-- 1. Le compteur de versions, par projet. Il ne redescend jamais : supprimer une version ne
-- libère pas son numéro (D6). Reprise : le maximum déjà attribué, pour ne pas rejouer un numéro.
ALTER TABLE "projects" ADD COLUMN "pricing_grid_seq" INTEGER NOT NULL DEFAULT 0;

UPDATE "projects" p
SET "pricing_grid_seq" = COALESCE(
  (SELECT max(g."version") FROM "pricing_grids" g WHERE g."project_id" = p."id"), 0);

-- 2. Une seule version active par projet, garantie par la base et non par la discipline.
-- Le service désactivait déjà la précédente dans la même transaction, mais rien n'empêchait
-- deux activations concurrentes, un seed ou une reprise de données d'en laisser deux.
-- `loadActiveGridContent` lit par findFirst : avec deux lignes actives, il rendrait l'une ou
-- l'autre au hasard, et deux devis simulés à une minute d'intervalle pourraient être chiffrés
-- sur deux grilles différentes.
-- Même motif que `contacts_organization_primary_key`.
CREATE UNIQUE INDEX "pricing_grids_project_active_key"
  ON "pricing_grids"("project_id")
  WHERE "active";
