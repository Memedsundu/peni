-- Plan piece 17: stock items, their moves, and how each product uses stock (recipes).
-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('kg', 'l', 'adet');

-- CreateEnum
CREATE TYPE "StockKind" AS ENUM ('ingredient', 'supply');

-- CreateEnum
CREATE TYPE "StockReason" AS ENUM ('start', 'count', 'waste', 'sale', 'refund', 'bill');

-- CreateEnum
CREATE TYPE "WasteWhy" AS ENUM ('spilled', 'expired', 'broken', 'other');

-- CreateEnum
CREATE TYPE "StockMode" AS ENUM ('recipe', 'counted', 'none');

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StockKind" NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "qtyMilli" INTEGER NOT NULL DEFAULT 0,
    "minMilli" INTEGER NOT NULL DEFAULT 0,
    "costKurus" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMove" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "changeMilli" INTEGER NOT NULL,
    "afterMilli" INTEGER NOT NULL,
    "reason" "StockReason" NOT NULL,
    "why" "WasteWhy",
    "note" TEXT,
    "orderId" TEXT,
    "memberId" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "batchKey" TEXT NOT NULL,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRecipe" (
    "cafeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" "StockMode" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockRecipe_pkey" PRIMARY KEY ("cafeId","productId")
);

-- CreateTable
CREATE TABLE "StockRecipeLine" (
    "cafeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyMilli" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockRecipeLine_pkey" PRIMARY KEY ("cafeId","productId","itemId")
);

-- CreateIndex
CREATE INDEX "StockItem_cafeId_name_idx" ON "StockItem"("cafeId", "name");

-- CreateIndex
CREATE INDEX "StockMove_cafeId_at_idx" ON "StockMove"("cafeId", "at");

-- CreateIndex
CREATE INDEX "StockMove_itemId_at_idx" ON "StockMove"("itemId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "StockMove_cafeId_batchKey_itemId_key" ON "StockMove"("cafeId", "batchKey", "itemId");

-- CreateIndex
CREATE INDEX "StockRecipeLine_itemId_idx" ON "StockRecipeLine"("itemId");

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRecipe" ADD CONSTRAINT "StockRecipe_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRecipeLine" ADD CONSTRAINT "StockRecipeLine_cafeId_productId_fkey" FOREIGN KEY ("cafeId", "productId") REFERENCES "StockRecipe"("cafeId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRecipeLine" ADD CONSTRAINT "StockRecipeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
