-- Plan piece 19: checks, loans, the credit card, and bills paid with them.
-- CreateEnum
CREATE TYPE "MoneyMethod" AS ENUM ('cash', 'card', 'bank');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BillPayMethod" ADD VALUE 'credit';
ALTER TYPE "BillPayMethod" ADD VALUE 'check';
ALTER TYPE "BillPayMethod" ADD VALUE 'loan';

-- CreateTable
CREATE TABLE "DebtCheck" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "bankName" TEXT,
    "payee" TEXT,
    "supplierId" TEXT,
    "amountKurus" INTEGER NOT NULL,
    "writtenOn" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "note" TEXT,
    "billPaymentId" TEXT,
    "cashedOn" TEXT,
    "cashedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "lenderKey" TEXT NOT NULL,
    "lenderMemberId" TEXT,
    "lenderName" TEXT NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "borrowedOn" TEXT NOT NULL,
    "dueDate" TEXT,
    "note" TEXT,
    "billPaymentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "lenderKey" TEXT NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "method" "MoneyMethod" NOT NULL,
    "paidOn" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "cafeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limitKurus" INTEGER NOT NULL,
    "statementDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("cafeId")
);

-- CreateTable
CREATE TABLE "CardPayment" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "method" "MoneyMethod" NOT NULL,
    "paidOn" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DebtCheck_billPaymentId_key" ON "DebtCheck"("billPaymentId");

-- CreateIndex
CREATE INDEX "DebtCheck_cafeId_dueDate_idx" ON "DebtCheck"("cafeId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_billPaymentId_key" ON "Loan"("billPaymentId");

-- CreateIndex
CREATE INDEX "Loan_cafeId_lenderKey_borrowedOn_idx" ON "Loan"("cafeId", "lenderKey", "borrowedOn");

-- CreateIndex
CREATE INDEX "LoanRepayment_cafeId_lenderKey_paidOn_idx" ON "LoanRepayment"("cafeId", "lenderKey", "paidOn");

-- CreateIndex
CREATE INDEX "CardPayment_cafeId_paidOn_idx" ON "CardPayment"("cafeId", "paidOn");

-- AddForeignKey
ALTER TABLE "DebtCheck" ADD CONSTRAINT "DebtCheck_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCheck" ADD CONSTRAINT "DebtCheck_billPaymentId_fkey" FOREIGN KEY ("billPaymentId") REFERENCES "BillPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_billPaymentId_fkey" FOREIGN KEY ("billPaymentId") REFERENCES "BillPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPayment" ADD CONSTRAINT "CardPayment_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
