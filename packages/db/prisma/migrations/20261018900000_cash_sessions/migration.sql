-- CreateEnum
CREATE TYPE "CashMoveKind" AS ENUM ('in', 'out');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cashSessionId" TEXT;

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "openCafeId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openedByMemberId" TEXT NOT NULL,
    "openingExpectedKurus" INTEGER,
    "openingCountKurus" INTEGER NOT NULL,
    "openingDifferenceKurus" INTEGER NOT NULL,
    "openingCounts" JSONB,
    "openingNote" TEXT,
    "openKey" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByMemberId" TEXT,
    "closingExpectedKurus" INTEGER,
    "closingCountKurus" INTEGER,
    "closingDifferenceKurus" INTEGER,
    "closingCounts" JSONB,
    "closingNote" TEXT,
    "closeKey" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMove" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "CashMoveKind" NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "byMemberId" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "CashMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_openCafeId_key" ON "CashSession"("openCafeId");

-- CreateIndex
CREATE INDEX "CashSession_cafeId_openedAt_idx" ON "CashSession"("cafeId", "openedAt");

-- CreateIndex
CREATE INDEX "CashSession_cafeId_closedAt_idx" ON "CashSession"("cafeId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_cafeId_openKey_key" ON "CashSession"("cafeId", "openKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_cafeId_closeKey_key" ON "CashSession"("cafeId", "closeKey");

-- CreateIndex
CREATE INDEX "CashMove_sessionId_at_idx" ON "CashMove"("sessionId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "CashMove_cafeId_key_key" ON "CashMove"("cafeId", "key");

-- CreateIndex
CREATE INDEX "Payment_cashSessionId_idx" ON "Payment"("cashSessionId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMove" ADD CONSTRAINT "CashMove_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMove" ADD CONSTRAINT "CashMove_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

