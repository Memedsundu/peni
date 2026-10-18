-- Plan piece 1b: every record the app keeps now lives in Postgres (café reference items and colour,
-- Peni kodu, gift thanks, recipient lookups, staff roles for customer accounts, event titles).

-- DropForeignKey
ALTER TABLE "CafePost" DROP CONSTRAINT "CafePost_authorId_fkey";

-- AlterTable
ALTER TABLE "Cafe" ADD COLUMN     "hue" TEXT,
ADD COLUMN     "referenceProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CafePost" ADD COLUMN     "title" VARCHAR(200),
ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Gift" ADD COLUMN     "thankedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "memberCode" TEXT;

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "customerId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GiftLookup" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftLookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GiftLookup_customerId_at_idx" ON "GiftLookup"("customerId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_memberCode_key" ON "Membership"("memberCode");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_cafeId_customerId_key" ON "StaffMember"("cafeId", "customerId");

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftLookup" ADD CONSTRAINT "GiftLookup_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafePost" ADD CONSTRAINT "CafePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

