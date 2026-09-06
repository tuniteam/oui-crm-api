#!/usr/bin/env bash
# ============================================
# OUI-CRM — dump SQL de mise en production (06/09/2026)
#
# Produit un fichier **données seules** contenant exactement ce qu'une base de production doit
# porter au démarrage : le projet, sa configuration, le catalogue de droits, les référentiels,
# la grille tarifaire et les 34 969 communes de France.
#
# Volontairement ABSENTS : les comptes de démonstration et leurs sessions (mots de passe du seed,
# connus), le journal d'activité de développement, le projet de test `periscolia-e2e`, les lots
# d'import, les fichiers et les courriels. Le premier administrateur se crée à part.
#
# Le schéma n'est pas dans le fichier : la cible le construit avec `npx prisma migrate deploy`,
# ce qui garantit qu'elle est exactement à l'état des migrations du dépôt.
#
# Usage :  bash scripts/dump-prod.sh [slug] [fichier de sortie]
# ============================================
set -euo pipefail

set -a; [ -f ./.env ] && . ./.env; set +a
SLUG="${1:-periscolia}"
OUT="${2:-docs/backups/ouicrm_prod_$(date -u +%Y-%m-%d).sql}"
PSQL="${PSQL_BIN:-/c/Program Files/PostgreSQL/18/bin/psql.exe}"
URL=$(echo "${DATABASE_URL:?DATABASE_URL absent de .env}" | sed 's/[?&]schema=[^&]*//')

q() { "$PSQL" "$URL" -X -q -t -A -c "$1"; }

PROJECT_ID=$(q "SELECT id FROM projects WHERE slug = '$SLUG'")
[ -n "$PROJECT_ID" ] || { echo "Projet $SLUG introuvable" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
{
  echo "-- OUI-CRM — données de mise en production"
  echo "-- Généré le $(date -u +%Y-%m-%dT%H:%M:%SZ) depuis le projet « $SLUG »"
  echo "-- Prérequis : npx prisma migrate deploy (le schéma n'est pas dans ce fichier)"
  echo "-- Sans comptes, sans sessions, sans journal, sans projet de test."
  echo
  echo "-- Tout ou rien : la moindre erreur arrete psql et la transaction est annulee."
  echo "\\set ON_ERROR_STOP on"
  echo "BEGIN;"
  echo
} > "$OUT"

# L'ordre suit les dépendances : le projet, puis ce qui s'y rattache, puis les droits.
# Chaque entrée : table | filtre SQL | expression de projection (NULL pour les colonnes à vider).
dump_table() {
  local table="$1" where="$2" project="${3:-*}"
  local cols
  cols=$(q "SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '$table'")
  local select="${project/\*/$cols}"
  {
    echo "COPY public.$table ($cols) FROM stdin;"
    "$PSQL" "$URL" -X -q -c "\\copy (SELECT $select FROM public.$table WHERE $where) TO STDOUT"
    echo '\.'
    echo
  } >> "$OUT"
  local n
  n=$(q "SELECT count(*) FROM public.$table WHERE $where")
  printf '  %-28s %s lignes\n' "$table" "$n"
}

echo "Génération de $OUT"
dump_table projects                   "id = '$PROJECT_ID'"
dump_table project_features           "project_id = '$PROJECT_ID'"
dump_table settings                   "project_id = '$PROJECT_ID'"
dump_table scopes                     "project_id = '$PROJECT_ID'"
dump_table reference_items            "project_id = '$PROJECT_ID'"
dump_table document_number_sequences  "project_id = '$PROJECT_ID'"
dump_table permissions                "true"
dump_table roles                      "project_id IS NULL OR project_id = '$PROJECT_ID'"
dump_table role_permissions           "role_id IN (SELECT id FROM roles WHERE project_id IS NULL OR project_id = '$PROJECT_ID')"

# La grille perd son auteur : aucun compte n'est repris, et la colonne est SET NULL.
PRICING_COLS=$(q "SELECT string_agg(CASE WHEN column_name = 'created_by_id' THEN 'NULL' ELSE quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
                  FROM information_schema.columns WHERE table_schema='public' AND table_name='pricing_grids'")
dump_table pricing_grids "project_id = '$PROJECT_ID'" "$PRICING_COLS"

# Les fiches perdent leur lot d'import (non repris) et leurs affectations (aucun compte).
ORG_COLS=$(q "SELECT string_agg(CASE WHEN column_name IN ('import_batch_id','sales_rep_id','consultant_id','trainer_id','created_by') THEN 'NULL' ELSE quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
              FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations'")
dump_table organizations "project_id = '$PROJECT_ID'" "$ORG_COLS"

echo "COMMIT;" >> "$OUT"
echo "Terminé — $(du -h "$OUT" | cut -f1)"
