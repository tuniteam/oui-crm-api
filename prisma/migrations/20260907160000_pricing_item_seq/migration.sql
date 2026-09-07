-- ============================================
-- SPEC-19 D4 · Les identifiants d'options et d'extras sont posés par le serveur (07/09/2026)
-- ============================================

-- Le compteur ne pouvait pas se déduire des grilles : corriger une version **en place** efface
-- l'identifiant qu'elle portait, et le numéro suivant redescendait — la recette l'a montré.
-- Il se tient donc comme le numéro de version (SPEC-18 D6), sur le projet.
ALTER TABLE "projects" ADD COLUMN "pricing_item_seq" INTEGER NOT NULL DEFAULT 0;

-- Reprise : le plus grand identifiant déjà attribué, plus un. Options et extras partagent le
-- compteur — l'unicité se joue par famille, la non-réattribution sur l'ensemble.
UPDATE "projects" p
SET "pricing_item_seq" = COALESCE((
  SELECT max((item ->> 'id')::int) + 1
  FROM "pricing_grids" g,
       LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(g."content" -> 'options') = 'array' THEN g."content" -> 'options' ELSE '[]'::jsonb END
         || CASE WHEN jsonb_typeof(g."content" -> 'extras') = 'array' THEN g."content" -> 'extras' ELSE '[]'::jsonb END
       ) AS item
  WHERE g."project_id" = p."id" AND jsonb_typeof(item -> 'id') = 'number'
), 0);
