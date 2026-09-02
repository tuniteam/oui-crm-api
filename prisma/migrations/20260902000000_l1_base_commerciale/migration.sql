-- CreateEnum
CREATE TYPE "SalesStatus" AS ENUM ('NOT_CONTACTED', 'TO_CONTACT', 'IN_PROGRESS', 'MEETING_SCHEDULED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NOT_CUSTOMER', 'DEPLOYING', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'LOST_BEFORE_GOLIVE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ImportProfile" AS ENUM ('GENERIC', 'OUICRM_V2_1', 'PROJECT_CONFIG', 'TERRITORY');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('SIMULATED', 'APPLIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "display_prefix" VARCHAR(60),
    "siret" VARCHAR(14),
    "siren" VARCHAR(9),
    "insee_code" VARCHAR(5),
    "address" VARCHAR(255),
    "postal_code" VARCHAR(10),
    "city" VARCHAR(120),
    "department" VARCHAR(3) NOT NULL,
    "population" INTEGER,
    "epci" VARCHAR(150),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "solution" VARCHAR(60),
    "school_count" INTEGER,
    "child_count" INTEGER,
    "services" VARCHAR(60)[] DEFAULT ARRAY[]::VARCHAR(60)[],
    "sales_status" "SalesStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
    "customer_status" "CustomerStatus" NOT NULL DEFAULT 'NOT_CUSTOMER',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "tags" VARCHAR(60)[] DEFAULT ARRAY[]::VARCHAR(60)[],
    "lead_source" VARCHAR(60),
    "target_plan" VARCHAR(60),
    "sales_rep_id" TEXT,
    "consultant_id" TEXT,
    "trainer_id" TEXT,
    "notes" TEXT,
    "go_live_target" DATE,
    "completeness_score" INTEGER NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMP(3),
    "next_activity_at" TIMESTAMP(3),
    "import_batch_id" TEXT,
    "product_customer_id" VARCHAR(60),
    "deleted_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "civility" VARCHAR(10),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(120),
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "mobile" VARCHAR(20),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "opt_out" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "extracted_from_note" BOOLEAN NOT NULL DEFAULT false,
    "import_batch_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "user_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "type" VARCHAR(60) NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5),
    "duration_min" INTEGER,
    "location" VARCHAR(255),
    "status" "ActivityStatus" NOT NULL DEFAULT 'PLANNED',
    "report" TEXT,
    "result" VARCHAR(60),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(1000),
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "owner_id" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_organizations" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "added_by" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "profile" "ImportProfile" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'SIMULATED',
    "totals" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceled_at" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizations_project_id_sales_status_idx" ON "organizations"("project_id", "sales_status");

-- CreateIndex
CREATE INDEX "organizations_project_id_customer_status_idx" ON "organizations"("project_id", "customer_status");

-- CreateIndex
CREATE INDEX "organizations_project_id_department_idx" ON "organizations"("project_id", "department");

-- CreateIndex
CREATE INDEX "organizations_project_id_sales_rep_id_idx" ON "organizations"("project_id", "sales_rep_id");

-- CreateIndex
CREATE INDEX "organizations_project_id_completeness_score_idx" ON "organizations"("project_id", "completeness_score");

-- CreateIndex
CREATE INDEX "organizations_import_batch_id_idx" ON "organizations"("import_batch_id");

-- CreateIndex
CREATE INDEX "contacts_project_id_organization_id_idx" ON "contacts"("project_id", "organization_id");

-- CreateIndex
CREATE INDEX "contacts_organization_id_is_primary_idx" ON "contacts"("organization_id", "is_primary");

-- CreateIndex
CREATE INDEX "activities_project_id_user_id_date_idx" ON "activities"("project_id", "user_id", "date");

-- CreateIndex
CREATE INDEX "activities_organization_id_date_idx" ON "activities"("organization_id", "date");

-- CreateIndex
CREATE INDEX "activities_project_id_status_date_idx" ON "activities"("project_id", "status", "date");

-- CreateIndex
CREATE INDEX "activities_campaign_id_idx" ON "activities"("campaign_id");

-- CreateIndex
CREATE INDEX "campaigns_project_id_status_idx" ON "campaigns"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_project_id_name_key" ON "campaigns"("project_id", "name");

-- CreateIndex
CREATE INDEX "campaign_organizations_organization_id_idx" ON "campaign_organizations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_organizations_campaign_id_organization_id_key" ON "campaign_organizations"("campaign_id", "organization_id");

-- CreateIndex
CREATE INDEX "import_batches_project_id_created_at_idx" ON "import_batches"("project_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_organizations" ADD CONSTRAINT "campaign_organizations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_organizations" ADD CONSTRAINT "campaign_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================
-- Index que Prisma n'exprime pas (SPEC-13 §2.2)
-- ============================================

-- Unicités métier, PARTIELLES : une fiche supprimée logiquement ne doit pas interdire
-- de recréer la même commune (SPEC-13 §2.2). Postgres ignore déjà les NULL en unicité,
-- donc les fiches sans SIRET ni code INSEE ne se gênent pas entre elles.
CREATE UNIQUE INDEX "organizations_project_siret_key"
  ON "organizations"("project_id", "siret")
  WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "organizations_project_insee_code_key"
  ON "organizations"("project_id", "insee_code")
  WHERE "deleted_at" IS NULL;

-- Au plus un contact principal par organisme, garanti par la base et non par le service
-- (SPEC-13 §2.2, US-01-04).
CREATE UNIQUE INDEX "contacts_organization_primary_key"
  ON "contacts"("organization_id")
  WHERE "is_primary" AND "deleted_at" IS NULL;

-- Recherche trigram de US-01-01 (pg_trgm activé par la migration l0_core).
CREATE INDEX "organizations_name_trgm_idx" ON "organizations" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "organizations_city_trgm_idx" ON "organizations" USING GIN ("city" gin_trgm_ops);

-- Filtre par étiquette et par service : appartenance à un tableau.
CREATE INDEX "organizations_tags_idx" ON "organizations" USING GIN ("tags");
CREATE INDEX "organizations_services_idx" ON "organizations" USING GIN ("services");

-- Les listes ne montrent jamais les fiches supprimées : l'index les écarte à la source.
CREATE INDEX "organizations_project_active_idx"
  ON "organizations"("project_id")
  WHERE "deleted_at" IS NULL;
