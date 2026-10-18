-- Plan piece 18: suppliers and bills (Tedarikçiler, Faturalar).
-- CreateEnum
CREATE TYPE "BillCategory" AS ENUM ('ingredients', 'supplies', 'rent', 'utilities', 'services', 'wages', 'other');

-- CreateEnum
CREATE TYPE "BillPayMethod" AS ENUM ('cash', 'card', 'bank');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "taxNo" TEXT,
    "iban" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "supplierId" TEXT,
    "number" TEXT,
    "date" TEXT NOT NULL,
    "dueDate" TEXT,
    "note" TEXT,
    "totalKurus" INTEGER NOT NULL,
    "paidKurus" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createKey" TEXT NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLine" (
    "billId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "category" "BillCategory" NOT NULL,
    "qtyMilli" INTEGER,
    "totalKurus" INTEGER NOT NULL,

    CONSTRAINT "BillLine_pkey" PRIMARY KEY ("billId","sortOrder")
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "method" "BillPayMethod" NOT NULL,
    "paidOn" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_cafeId_name_idx" ON "Supplier"("cafeId", "name");

-- CreateIndex
CREATE INDEX "Bill_cafeId_date_idx" ON "Bill"("cafeId", "date");

-- CreateIndex
CREATE INDEX "Bill_cafeId_supplierId_date_idx" ON "Bill"("cafeId", "supplierId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_cafeId_createKey_key" ON "Bill"("cafeId", "createKey");

-- CreateIndex
CREATE INDEX "BillLine_itemId_idx" ON "BillLine"("itemId");

-- CreateIndex
CREATE INDEX "BillPayment_cafeId_paidOn_idx" ON "BillPayment"("cafeId", "paidOn");

-- CreateIndex
CREATE INDEX "BillPayment_billId_idx" ON "BillPayment"("billId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
