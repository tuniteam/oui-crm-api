-- CreateEnum
CREATE TYPE "DocumentTemplateType" AS ENUM ('QUOTE', 'CONTRACT');

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "template_type" "DocumentTemplateType";

-- CreateIndex
CREATE INDEX "files_project_id_template_type_idx" ON "files"("project_id", "template_type");

