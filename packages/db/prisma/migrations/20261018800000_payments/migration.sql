-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('sale', 'refund');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'declined', 'cancelled');

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "payKey";

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "tenderedKurus" INTEGER,
    "changeKurus" INTEGER,
    "terminal" TEXT NOT NULL,
    "deviceId" TEXT,
    "key" TEXT NOT NULL,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "startedByMemberId" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3),
    "settledByMemberId" TEXT,
    "reference" TEXT,
    "receiptNo" TEXT,
    "failure" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_cafeId_orderId_idx" ON "Payment"("cafeId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_cafeId_key_key" ON "Payment"("cafeId", "key");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

