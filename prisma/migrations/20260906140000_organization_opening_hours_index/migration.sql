-- SPEC-16 · Filtre « ouverte tel jour » — `opening_hours -> 'days' @> '[{"day":"WEDNESDAY"}]'`.
-- jsonb_path_ops plutôt que l'opérateur par défaut : il ne sert que l'opérateur @>, qui est
-- exactement ce que fait le filtre, et l'index est deux fois plus petit.
CREATE INDEX "organizations_opening_hours_idx"
  ON "organizations" USING GIN ("opening_hours" jsonb_path_ops);
