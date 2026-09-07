-- ============================================
-- SPEC-19 D5 · La nature d'un poste de frais est déclarée, plus déduite de sa clé (07/09/2026)
-- ============================================

-- `splitOneShot` reconnaissait le poste de formation à la clé écrite en dur `training`.
-- Renommer cette clé faisait tomber la ventilation « formation » à zéro et basculait son
-- montant dans « mise en place », en silence, jusque dans le PDF et les exports.
-- Chaque poste porte désormais sa nature. Reprise : `training` devient TRAINING, tout le reste
-- SETUP — c'est exactement ce que la règle précédente calculait.
UPDATE "pricing_grids" g
SET "content" = jsonb_set(
  g."content",
  '{setupFees}',
  (
    SELECT coalesce(
      jsonb_object_agg(
        e.key,
        e.value || jsonb_build_object('nature', CASE WHEN e.key = 'training' THEN 'TRAINING' ELSE 'SETUP' END)
      ),
      '{}'::jsonb
    )
    FROM jsonb_each(g."content" -> 'setupFees') AS e
  )
)
WHERE jsonb_typeof(g."content" -> 'setupFees') = 'object'
  AND g."content" -> 'setupFees' <> '{}'::jsonb;
