-- Plan piece 2b: till devices, barista PINs and PIN sessions.

-- CreateEnum
CREATE TYPE "StaffSignInMethod" AS ENUM ('password', 'pin');

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "pinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StaffSession" ADD COLUMN     "cafeId" TEXT,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "method" "StaffSignInMethod" NOT NULL DEFAULT 'password';

-- CreateTable
CREATE TABLE "TillDevice" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByMemberId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TillDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TillDevice_tokenHash_key" ON "TillDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TillDevice_cafeId_idx" ON "TillDevice"("cafeId");

-- CreateIndex
CREATE INDEX "StaffSession_deviceId_idx" ON "StaffSession"("deviceId");

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TillDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TillDevice" ADD CONSTRAINT "TillDevice_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TillDevice" ADD CONSTRAINT "TillDevice_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

