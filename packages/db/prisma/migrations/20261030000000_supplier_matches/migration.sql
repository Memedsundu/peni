-- Which supplier a person confirmed a bill's seller to be, so their next bill goes to it first.
-- 20261029000000_line_match_packs creates it too, but that migration was changed after staging
-- had applied it, so staging never got the table. This one creates it where it's missing and
-- does nothing where it's there ("if not exists"), so every database ends up the same.
CREATE TABLE IF NOT EXISTS "AiSupplierMatch" (
    "cafeId" TEXT NOT NULL,
    "readKey" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSupplierMatch_pkey" PRIMARY KEY ("cafeId","readKey")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiSupplierMatch_cafeId_fkey') THEN
    ALTER TABLE "AiSupplierMatch" ADD CONSTRAINT "AiSupplierMatch_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
