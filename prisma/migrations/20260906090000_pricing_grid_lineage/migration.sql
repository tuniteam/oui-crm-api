-- SPEC-14 D21 — la filiation d'une version tarifaire (demande front du 06/09/2026).
-- Colonne additive : aucune version n'existe hors celle du seed, il n'y a donc rien à reprendre.
-- Pas d'index : la filiation se lit sur une ligne qu'on a déjà en main, jamais en filtre.
ALTER TABLE "pricing_grids" ADD COLUMN "based_on_version" INTEGER;
