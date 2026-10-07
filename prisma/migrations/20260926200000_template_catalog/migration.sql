-- ACTION-014: stable identity, availability and an update timestamp for templates.
-- Additive only: existing rows and every bundles.template_id reference are kept as they are.

-- AlterTable
ALTER TABLE "templates" ADD COLUMN "slug" TEXT,
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing templates get the slug of their name ("Complete Look" -> "complete-look").
UPDATE "templates"
SET "slug" = trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')));

-- Two templates that would share a slug (same name in two categories) are told apart by category.
UPDATE "templates" AS t
SET "slug" = t."slug" || '-' || t."category"::text
WHERE EXISTS (
  SELECT 1 FROM "templates" AS o WHERE o."slug" = t."slug" AND o."id" <> t."id"
);

ALTER TABLE "templates" ALTER COLUMN "slug" SET NOT NULL;
-- Prisma maintains updated_at itself.
ALTER TABLE "templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "templates_slug_key" ON "templates"("slug");
