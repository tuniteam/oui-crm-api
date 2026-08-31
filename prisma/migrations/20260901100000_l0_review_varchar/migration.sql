-- AlterTable
ALTER TABLE "activation_tokens" ALTER COLUMN "token_hash" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "email_change_tokens" ALTER COLUMN "token_hash" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "files" ALTER COLUMN "file_path" SET DATA TYPE VARCHAR(512);

-- AlterTable
ALTER TABLE "password_reset_tokens" ALTER COLUMN "token_hash" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "scopes" ALTER COLUMN "regions" SET DATA TYPE VARCHAR(100)[],
ALTER COLUMN "departments" SET DATA TYPE VARCHAR(3)[],
ALTER COLUMN "campaign_ids" SET DATA TYPE VARCHAR(30)[];

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "refresh_token" SET DATA TYPE VARCHAR(255);

