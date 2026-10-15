-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "PosKind" AS ENUM ('shelby', 'standalone');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('owner', 'manager', 'barista');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('earn', 'redeem', 'gift_send', 'gift_accept', 'gift_return', 'askida_donate', 'askida_match', 'askida_till', 'askida_claim', 'adjust', 'reversal');

-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('submitted', 'accepted', 'ready', 'collected', 'rejected', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('post', 'question', 'event');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('post', 'comment', 'profile');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'upheld', 'dismissed');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" VARCHAR(160),
    "profileVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletionRequestedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDevice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "pushToken" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cafe" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "coverImageUrl" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "posKind" "PosKind" NOT NULL DEFAULT 'standalone',
    "shelbyCafeId" TEXT,
    "appOrderingPaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cafe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeSettings" (
    "cafeId" TEXT NOT NULL,
    "peniEnabled" BOOLEAN NOT NULL DEFAULT true,
    "earnRateBps" INTEGER NOT NULL DEFAULT 500,
    "maxRedeemShareBps" INTEGER NOT NULL DEFAULT 10000,
    "redeemAllProducts" BOOLEAN NOT NULL DEFAULT true,
    "redeemableProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dailyGiftLimitPeni" INTEGER NOT NULL DEFAULT 200,
    "giftExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "askidaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "askidaProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "askidaClaimsPerDay" INTEGER NOT NULL DEFAULT 1,
    "askidaMinMembershipDays" INTEGER NOT NULL DEFAULT 0,
    "askidaMatchBps" INTEGER NOT NULL DEFAULT 0,
    "askidaMatchMonthlyCapPeni" INTEGER NOT NULL DEFAULT 0,
    "noShowStrikeLimit" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeSettings_pkey" PRIMARY KEY ("cafeId")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "shelbyUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceKurus" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "preorderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveNoShows" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversesId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountBalance" (
    "account" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountBalance_pkey" PRIMARY KEY ("account")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "fromMembershipId" TEXT NOT NULL,
    "toMembershipId" TEXT NOT NULL,
    "peni" INTEGER NOT NULL,
    "message" VARCHAR(140),
    "status" "GiftStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "sendTransactionId" TEXT NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppOrder" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "posOrderId" TEXT,
    "orderNumber" TEXT,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'submitted',
    "subtotalKurus" INTEGER NOT NULL,
    "peniDiscountKurus" INTEGER NOT NULL DEFAULT 0,
    "askidaKurus" INTEGER NOT NULL DEFAULT 0,
    "dueKurus" INTEGER NOT NULL,
    "customerNote" VARCHAR(200),
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AppOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPriceKurus" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" VARCHAR(100),
    "fromAskida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AppOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafePost" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "PostKind" NOT NULL DEFAULT 'post',
    "body" VARCHAR(2000) NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "eventStartsAt" TIMESTAMP(3),
    "eventCapacity" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "CafePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostReaction" (
    "postId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("postId","customerId")
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "postId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("postId","customerId")
);

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "PhoneVerification_phone_createdAt_idx" ON "PhoneVerification"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDevice_pushToken_key" ON "CustomerDevice"("pushToken");

-- CreateIndex
CREATE INDEX "CustomerDevice_customerId_idx" ON "CustomerDevice"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Cafe_slug_key" ON "Cafe"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Cafe_shelbyCafeId_key" ON "Cafe"("shelbyCafeId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_cafeId_email_key" ON "StaffMember"("cafeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_cafeId_productId_key" ON "MenuItem"("cafeId", "productId");

-- CreateIndex
CREATE INDEX "Membership_cafeId_idx" ON "Membership"("cafeId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_customerId_cafeId_key" ON "Membership"("customerId", "cafeId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_idempotencyKey_key" ON "LedgerTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_reversesId_key" ON "LedgerTransaction"("reversesId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_cafeId_kind_createdAt_idx" ON "LedgerTransaction"("cafeId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_idx" ON "LedgerEntry"("account");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Gift_sendTransactionId_key" ON "Gift"("sendTransactionId");

-- CreateIndex
CREATE INDEX "Gift_toMembershipId_status_idx" ON "Gift"("toMembershipId", "status");

-- CreateIndex
CREATE INDEX "Gift_fromMembershipId_createdAt_idx" ON "Gift"("fromMembershipId", "createdAt");

-- CreateIndex
CREATE INDEX "Gift_status_expiresAt_idx" ON "Gift"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppOrder_posOrderId_key" ON "AppOrder"("posOrderId");

-- CreateIndex
CREATE INDEX "AppOrder_cafeId_status_submittedAt_idx" ON "AppOrder"("cafeId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "AppOrder_membershipId_submittedAt_idx" ON "AppOrder"("membershipId", "submittedAt");

-- CreateIndex
CREATE INDEX "CafePost_cafeId_publishedAt_idx" ON "CafePost"("cafeId", "publishedAt");

-- CreateIndex
CREATE INDEX "PostComment_postId_createdAt_idx" ON "PostComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReport_cafeId_status_idx" ON "ContentReport"("cafeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentReport_targetType_targetId_reporterId_key" ON "ContentReport"("targetType", "targetId", "reporterId");

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDevice" ADD CONSTRAINT "CustomerDevice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeSettings" ADD CONSTRAINT "CafeSettings_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppOrder" ADD CONSTRAINT "AppOrder_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppOrder" ADD CONSTRAINT "AppOrder_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppOrderLine" ADD CONSTRAINT "AppOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AppOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafePost" ADD CONSTRAINT "CafePost_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafePost" ADD CONSTRAINT "CafePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CafePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CafePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CafePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────
-- Ledger guards (hand-written). The application enforces these rules too;
-- the database enforces them even if the application has a bug.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. History is never edited. Corrections are new, reversing transactions.
CREATE FUNCTION peni_ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'peni ledger is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LedgerTransaction_append_only"
  BEFORE UPDATE OR DELETE ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION peni_ledger_append_only();

CREATE TRIGGER "LedgerEntry_append_only"
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION peni_ledger_append_only();

-- 2. Every transaction balances. Checked at COMMIT, after all its entries are in.
CREATE FUNCTION peni_ledger_balanced() RETURNS trigger AS $$
DECLARE
  total bigint;
BEGIN
  SELECT COALESCE(SUM(delta), 0) INTO total FROM "LedgerEntry" WHERE "transactionId" = NEW."transactionId";
  IF total <> 0 THEN
    RAISE EXCEPTION 'peni ledger transaction % does not balance (sum %)', NEW."transactionId", total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "LedgerEntry_balanced"
  AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION peni_ledger_balanced();

-- 3. Wallets, the askı pool and gift escrow never go below zero.
ALTER TABLE "AccountBalance" ADD CONSTRAINT "AccountBalance_non_negative" CHECK (
  balance >= 0
  OR NOT (account LIKE 'member:%' OR account LIKE 'askida:%' OR account LIKE 'gift_escrow:%')
);

-- 4. Entries are whole, non-zero peni.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_non_zero" CHECK (delta <> 0);
