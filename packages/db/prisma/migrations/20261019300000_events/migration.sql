-- Plan piece 15: members open events, report each other's comments and events; moderators pause members.
-- AlterTable
ALTER TABLE "CafePost" ADD COLUMN     "hostCustomerId" TEXT;

-- AlterTable
ALTER TABLE "ContentReport" ADD COLUMN     "note" VARCHAR(300),
ADD COLUMN     "postId" TEXT,
ADD COLUMN     "resolvedBy" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "pausedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "CafePost" ADD CONSTRAINT "CafePost_hostCustomerId_fkey" FOREIGN KEY ("hostCustomerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

