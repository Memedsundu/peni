-- What each café pays for (decision N11): Topluluk (free), Topluluk + Penny, or İşletme,
-- and the end of its two-week trial, when it has one.
CREATE TYPE "CafePlan" AS ENUM ('topluluk', 'penny', 'isletme');

ALTER TABLE "Cafe" ADD COLUMN "plan" "CafePlan" NOT NULL DEFAULT 'topluluk',
ADD COLUMN "trialEndsAt" TIMESTAMP(3);

-- Cafés already here keep everything they have today.
UPDATE "Cafe" SET "plan" = 'isletme';
