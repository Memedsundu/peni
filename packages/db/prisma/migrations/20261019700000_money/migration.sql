-- Plan piece 20: money accounts (drawer, reserve, bank) and month close.
-- CreateEnum
CREATE TYPE "MoneyAccount" AS ENUM ('drawer', 'reserve', 'bank');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('opening', 'transfer', 'deposit', 'withdraw', 'correction', 'bill', 'check', 'repayment', 'card');

-- AlterTable
ALTER TABLE "BillPayment" ADD COLUMN     "account" "MoneyAccount";

-- AlterTable
ALTER TABLE "CardPayment" ADD COLUMN     "account" "MoneyAccount";

-- AlterTable
ALTER TABLE "LoanRepayment" ADD COLUMN     "account" "MoneyAccount";

-- CreateTable
CREATE TABLE "MoneyStart" (
    "cafeId" TEXT NOT NULL,
    "startedOn" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoneyStart_pkey" PRIMARY KEY ("cafeId")
);

-- CreateTable
CREATE TABLE "MoneyMovement" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "account" "MoneyAccount" NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "counterpart" "MoneyAccount",
    "source" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "note" TEXT,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoneyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthClose" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "standingMonth" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "closedById" TEXT NOT NULL,
    "note" TEXT,
    "summary" JSONB NOT NULL,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,

    CONSTRAINT "MonthClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoneyMovement_cafeId_account_day_idx" ON "MoneyMovement"("cafeId", "account", "day");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyMovement_cafeId_source_account_key" ON "MoneyMovement"("cafeId", "source", "account");

-- CreateIndex
CREATE INDEX "MonthClose_cafeId_closedAt_idx" ON "MonthClose"("cafeId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthClose_cafeId_standingMonth_key" ON "MonthClose"("cafeId", "standingMonth");

-- CreateIndex
CREATE INDEX "Payment_cafeId_settledAt_idx" ON "Payment"("cafeId", "settledAt");

-- AddForeignKey
ALTER TABLE "MoneyStart" ADD CONSTRAINT "MoneyStart_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthClose" ADD CONSTRAINT "MonthClose_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
