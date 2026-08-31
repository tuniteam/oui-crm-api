-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "description" SET DATA TYPE VARCHAR(1000);

-- AlterTable
ALTER TABLE "scopes" ALTER COLUMN "description" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "avatar_file_id";


-- Single-per-owner file categories (AVATAR, SIGNATURE_IMAGE): the replacement logic in
-- FileService relies on this partial unique index to reject concurrent duplicate uploads.
-- Partial indexes are not expressible in schema.prisma — raw SQL, kept in sync with
-- SINGLE_PER_OWNER in src/files/file.service.ts.
CREATE UNIQUE INDEX IF NOT EXISTS "files_single_per_owner_key"
  ON "files"("owner_type", "owner_id", "category")
  WHERE "category" IN ('AVATAR', 'SIGNATURE_IMAGE');
