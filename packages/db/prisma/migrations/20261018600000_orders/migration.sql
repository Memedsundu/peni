-- Plan piece 6: orders taken at the till, with per-café daily numbers.

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('open', 'paid', 'voided', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "businessDay" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "subtotalKurus" INTEGER NOT NULL,
    "discountKurus" INTEGER NOT NULL,
    "totalKurus" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "createdByMemberId" TEXT NOT NULL,
    "createKey" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidByMemberId" TEXT,
    "paymentMethod" "PaymentMethod",
    "tenderedKurus" INTEGER,
    "changeKurus" INTEGER,
    "payKey" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByMemberId" TEXT,
    "voidReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundedByMemberId" TEXT,
    "refundReason" TEXT,
    "refundKurus" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "deletedByMemberId" TEXT,
    "deleteReason" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPriceKurus" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCounter" (
    "cafeId" TEXT NOT NULL,
    "businessDay" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("cafeId","businessDay")
);

-- CreateIndex
CREATE INDEX "Order_cafeId_createdAt_idx" ON "Order"("cafeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_cafeId_businessDay_number_key" ON "Order"("cafeId", "businessDay", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_cafeId_createKey_key" ON "Order"("cafeId", "createKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_position_key" ON "OrderLine"("orderId", "position");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCounter" ADD CONSTRAINT "OrderCounter_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

