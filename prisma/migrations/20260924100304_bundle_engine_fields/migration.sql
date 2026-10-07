-- AlterTable
ALTER TABLE "bundles" ADD COLUMN     "required_quantity" INTEGER,
ADD COLUMN     "template_id" UUID;

-- CreateIndex
CREATE INDEX "bundles_template_id_idx" ON "bundles"("template_id");

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
