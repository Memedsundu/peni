-- Plan piece 1: ordering from the app, SMS sign-in and the Shelby link are gone (decisions D5, D12, D14).
-- DropForeignKey
ALTER TABLE "AppOrder" DROP CONSTRAINT "AppOrder_cafeId_fkey";

-- DropForeignKey
ALTER TABLE "AppOrder" DROP CONSTRAINT "AppOrder_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "AppOrderLine" DROP CONSTRAINT "AppOrderLine_orderId_fkey";

-- DropIndex
DROP INDEX "Cafe_shelbyCafeId_key";

-- AlterTable
ALTER TABLE "Cafe" DROP COLUMN "appOrderingPaused",
DROP COLUMN "posKind",
DROP COLUMN "shelbyCafeId";

-- AlterTable
ALTER TABLE "CafeSettings" DROP COLUMN "noShowStrikeLimit";

-- AlterTable
ALTER TABLE "StaffMember" DROP COLUMN "shelbyUserId";

-- AlterTable
ALTER TABLE "Membership" DROP COLUMN "consecutiveNoShows",
DROP COLUMN "preorderEnabled";

-- DropTable
DROP TABLE "PhoneVerification";

-- DropTable
DROP TABLE "AppOrder";

-- DropTable
DROP TABLE "AppOrderLine";

-- DropEnum
DROP TYPE "PosKind";

-- DropEnum
DROP TYPE "FulfillmentStatus";

