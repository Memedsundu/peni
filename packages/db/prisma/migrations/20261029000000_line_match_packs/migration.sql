-- A line a person kept as an expense is remembered with no item, so it isn't offered as stock again.
ALTER TABLE "AiLineMatch" ALTER COLUMN "itemId" DROP NOT NULL;

-- The printed unit a learned pack size is for ("koli"), so "24 adet" of the same line isn't converted as koli.
ALTER TABLE "AiLineMatch" ADD COLUMN "readUnit" TEXT;

-- Which supplier a person confirmed a bill's seller to be, so their next bill goes to it first.
CREATE TABLE "AiSupplierMatch" (
    "cafeId" TEXT NOT NULL,
    "readKey" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSupplierMatch_pkey" PRIMARY KEY ("cafeId","readKey")
);

ALTER TABLE "AiSupplierMatch" ADD CONSTRAINT "AiSupplierMatch_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
