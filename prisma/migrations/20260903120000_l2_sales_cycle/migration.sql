-- ============================================
-- L2 - cycle de vente (SPEC-14 phase A)
-- Opportunity + OpportunityStage + Quote + QuoteLine + Contract.
-- Genere par `migrate diff`, puis FILTRE A LA MAIN : le diff proposait de supprimer les quatre
-- index GIN/trigram d'organizations ecrits en SQL brut (il ne les voit pas). Ces DROP ont ete
-- retires - ils sont verifies apres deploiement.
-- ============================================

-- CreateEnum
CREATE TYPE "OpportunityStageCode" AS ENUM ('QUALIFICATION', 'DEMONSTRATION', 'QUOTE_SENT', 'NEGOTIATING', 'VERBAL_AGREEMENT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PENDING_VALIDATION', 'SENT', 'FOLLOWED_UP', 'NEGOTIATING', 'SIGNED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuoteType" AS ENUM ('INITIAL', 'ADDITIONAL', 'RENEWAL');

-- CreateEnum
CREATE TYPE "QuoteOrigin" AS ENUM ('CRM', 'IMPORTED');

-- CreateEnum
CREATE TYPE "QuoteLineNature" AS ENUM ('ABONNEMENT', 'OPTION', 'SETUP', 'EXTRA');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'NOTICE_RECEIVED', 'TERMINATED', 'EXPIRED');

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "label" VARCHAR(200),
    "stage" "OpportunityStageCode" NOT NULL DEFAULT 'QUALIFICATION',
    "owner_id" TEXT,
    "source" VARCHAR(60),
    "expected_close_date" DATE,
    "probability_override" INTEGER,
    "loss_reason" VARCHAR(60),
    "loss_comment" VARCHAR(1000),
    "closed_at" TIMESTAMP(3),
    "import_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_stages" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "stage" "OpportunityStageCode" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,

    CONSTRAINT "opportunity_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "pricing_grid_id" TEXT NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "legacy_number" VARCHAR(30),
    "origin" "QuoteOrigin" NOT NULL DEFAULT 'CRM',
    "type" "QuoteType" NOT NULL DEFAULT 'INITIAL',
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "owner_id" TEXT,
    "issue_date" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "start_date" DATE NOT NULL,
    "signed_at" DATE,
    "validated_by_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "rejection_reason" VARCHAR(1000),
    "decline_reason" VARCHAR(1000),
    "config" JSONB,
    "mrr_list" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mrr_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "arr_list" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "arr_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "one_shot_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "first_year_ht" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "first_year_vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "first_year_ttc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "max_discount" INTEGER NOT NULL DEFAULT 0,
    "source_quote_id" TEXT,
    "import_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "nature" "QuoteLineNature" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "label" VARCHAR(200) NOT NULL,
    "sublabel" VARCHAR(200),
    "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "signed_at" DATE NOT NULL,
    "start_date" DATE NOT NULL,
    "commitment_months" INTEGER NOT NULL,
    "end_date" DATE NOT NULL,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "notice_months" INTEGER NOT NULL,
    "billing" "BillingMode" NOT NULL DEFAULT 'MONTHLY',
    "plan" VARCHAR(60) NOT NULL,
    "mrr_list" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mrr_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "arr_list" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "arr_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "one_shot_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "trial_clause" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunities_project_id_stage_idx" ON "opportunities"("project_id", "stage");

-- CreateIndex
CREATE INDEX "opportunities_project_id_owner_id_idx" ON "opportunities"("project_id", "owner_id");

-- CreateIndex
CREATE INDEX "opportunities_organization_id_idx" ON "opportunities"("organization_id");

-- CreateIndex
CREATE INDEX "opportunities_import_batch_id_idx" ON "opportunities"("import_batch_id");

-- CreateIndex
CREATE INDEX "opportunity_stages_opportunity_id_date_idx" ON "opportunity_stages"("opportunity_id", "date");

-- CreateIndex
CREATE INDEX "quotes_project_id_status_idx" ON "quotes"("project_id", "status");

-- CreateIndex
CREATE INDEX "quotes_organization_id_status_idx" ON "quotes"("organization_id", "status");

-- CreateIndex
CREATE INDEX "quotes_opportunity_id_idx" ON "quotes"("opportunity_id");

-- CreateIndex
CREATE INDEX "quotes_project_id_valid_until_idx" ON "quotes"("project_id", "valid_until");

-- CreateIndex
CREATE INDEX "quotes_import_batch_id_idx" ON "quotes"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_project_id_number_key" ON "quotes"("project_id", "number");

-- CreateIndex
CREATE INDEX "quote_lines_quote_id_order_idx" ON "quote_lines"("quote_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_quote_id_key" ON "contracts"("quote_id");

-- CreateIndex
CREATE INDEX "contracts_project_id_status_idx" ON "contracts"("project_id", "status");

-- CreateIndex
CREATE INDEX "contracts_organization_id_idx" ON "contracts"("organization_id");

-- CreateIndex
CREATE INDEX "contracts_project_id_end_date_idx" ON "contracts"("project_id", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_project_id_number_key" ON "contracts"("project_id", "number");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stages" ADD CONSTRAINT "opportunity_stages_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_pricing_grid_id_fkey" FOREIGN KEY ("pricing_grid_id") REFERENCES "pricing_grids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------
-- Index en SQL brut - invisibles de `migrate diff`, a preserver dans les migrations suivantes.
-- --------------------------------------------

-- Une seule opportunite ouverte par organisme (SPEC-07 US-02-09), garantie par la base.
CREATE UNIQUE INDEX "opportunities_open_per_organization_key" ON "opportunities"("organization_id")
  WHERE "stage" NOT IN ('WON', 'LOST');

-- Recherche globale sur les numeros de documents (SPEC-02 §6), pg_trgm active par l0_core.
CREATE INDEX "quotes_number_trgm_idx" ON "quotes" USING GIN ("number" gin_trgm_ops);
CREATE INDEX "quotes_legacy_number_trgm_idx" ON "quotes" USING GIN ("legacy_number" gin_trgm_ops);
CREATE INDEX "contracts_number_trgm_idx" ON "contracts" USING GIN ("number" gin_trgm_ops);
