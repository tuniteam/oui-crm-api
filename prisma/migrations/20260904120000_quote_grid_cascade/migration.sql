-- ============================================
-- Un projet portant des devis doit rester supprimable.
--
-- `quotes.pricing_grid_id` etait en ON DELETE RESTRICT (defaut Prisma d'une relation
-- obligatoire). Supprimer un projet cascade vers ses grilles ET vers ses organismes, donc vers
-- leurs devis : selon l'ordre choisi par Postgres, le RESTRICT se declenche et la suppression
-- echoue. Constate par la regression, qui ne pouvait plus reconstruire son jeu e2e.
--
-- CASCADE est ici sans danger : aucune route ne supprime une grille, elle ne disparait qu'avec
-- son projet — auquel cas les devis partent de toute facon avec leurs organismes.
-- ============================================

ALTER TABLE "quotes" DROP CONSTRAINT "quotes_pricing_grid_id_fkey";
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_pricing_grid_id_fkey"
  FOREIGN KEY ("pricing_grid_id") REFERENCES "pricing_grids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
