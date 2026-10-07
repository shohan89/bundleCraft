-- ACTION-015: storefront customization options. Additive only: no column or row is removed,
-- and every existing customization is backfilled so the storefront looks exactly as before.

-- CreateEnum
CREATE TYPE "FontFamily" AS ENUM ('theme', 'sans', 'serif', 'mono');

-- CreateEnum
CREATE TYPE "TextSize" AS ENUM ('small', 'medium', 'large');

-- CreateEnum
CREATE TYPE "CardRadius" AS ENUM ('none', 'small', 'medium', 'large');

-- CreateEnum
CREATE TYPE "CardShadow" AS ENUM ('none', 'subtle', 'strong');

-- CreateEnum
CREATE TYPE "ButtonStyle" AS ENUM ('filled', 'outline');

-- CreateEnum
CREATE TYPE "ButtonSize" AS ENUM ('small', 'medium', 'large');

-- CreateEnum
CREATE TYPE "SpacingDensity" AS ENUM ('compact', 'comfortable');

-- AlterTable
ALTER TABLE "customizations" ADD COLUMN     "accent_color" TEXT NOT NULL DEFAULT '#111827',
ADD COLUMN     "text_color" TEXT NOT NULL DEFAULT '#111827',
ADD COLUMN     "font_family" "FontFamily" NOT NULL DEFAULT 'theme',
ADD COLUMN     "title_size" "TextSize" NOT NULL DEFAULT 'medium',
ADD COLUMN     "description_size" "TextSize" NOT NULL DEFAULT 'medium',
ADD COLUMN     "card_radius" "CardRadius" NOT NULL DEFAULT 'medium',
ADD COLUMN     "card_shadow" "CardShadow" NOT NULL DEFAULT 'none',
ADD COLUMN     "button_style" "ButtonStyle" NOT NULL DEFAULT 'filled',
ADD COLUMN     "button_size" "ButtonSize" NOT NULL DEFAULT 'medium',
ADD COLUMN     "spacing_density" "SpacingDensity" NOT NULL DEFAULT 'comfortable';

-- Before this migration the primary colour drove the text, the selection accent and the focus
-- outline. Keep that for bundles that were already customized.
UPDATE "customizations" SET "accent_color" = "primary_color", "text_color" = "primary_color";
