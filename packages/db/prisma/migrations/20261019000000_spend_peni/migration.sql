-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'peni';

-- CreateTable
CREATE TABLE "SpendCode" (
    "membershipId" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendCode_pkey" PRIMARY KEY ("membershipId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpendCode_cafeId_code_key" ON "SpendCode"("cafeId", "code");

-- AddForeignKey
ALTER TABLE "SpendCode" ADD CONSTRAINT "SpendCode_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

