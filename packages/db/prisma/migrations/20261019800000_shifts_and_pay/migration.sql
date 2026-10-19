-- AlterEnum
ALTER TYPE "MovementKind" ADD VALUE 'wages';

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "memberIds" TEXT[],
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftWeek" (
    "cafeId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,

    CONSTRAINT "ShiftWeek_pkey" PRIMARY KEY ("cafeId","weekStart")
);

-- CreateTable
CREATE TABLE "WorkDay" (
    "cafeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "byId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkDay_pkey" PRIMARY KEY ("cafeId","memberId","day")
);

-- CreateTable
CREATE TABLE "PayRate" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "fromDay" TEXT NOT NULL,
    "kurusPerHour" INTEGER NOT NULL,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPayout" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "account" "MoneyAccount",
    "paidOn" TEXT NOT NULL,
    "note" TEXT,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayClose" (
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

    CONSTRAINT "PayClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_cafeId_day_idx" ON "Shift"("cafeId", "day");

-- CreateIndex
CREATE INDEX "WorkDay_cafeId_day_idx" ON "WorkDay"("cafeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PayRate_cafeId_memberId_fromDay_key" ON "PayRate"("cafeId", "memberId", "fromDay");

-- CreateIndex
CREATE INDEX "PayPayout_cafeId_month_idx" ON "PayPayout"("cafeId", "month");

-- CreateIndex
CREATE INDEX "PayPayout_cafeId_paidOn_idx" ON "PayPayout"("cafeId", "paidOn");

-- CreateIndex
CREATE INDEX "PayClose_cafeId_closedAt_idx" ON "PayClose"("cafeId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayClose_cafeId_standingMonth_key" ON "PayClose"("cafeId", "standingMonth");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftWeek" ADD CONSTRAINT "ShiftWeek_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRate" ADD CONSTRAINT "PayRate_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPayout" ADD CONSTRAINT "PayPayout_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayClose" ADD CONSTRAINT "PayClose_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

