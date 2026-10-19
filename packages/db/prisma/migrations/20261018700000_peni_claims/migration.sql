-- Plan piece 7: the one-time peni claim made when an order is paid.
-- CreateTable
CREATE TABLE "PeniClaim" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "businessDay" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "peni" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedByMembershipId" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "PeniClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PeniClaim_orderId_key" ON "PeniClaim"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PeniClaim_token_key" ON "PeniClaim"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PeniClaim_cafeId_businessDay_code_key" ON "PeniClaim"("cafeId", "businessDay", "code");

-- AddForeignKey
ALTER TABLE "PeniClaim" ADD CONSTRAINT "PeniClaim_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeniClaim" ADD CONSTRAINT "PeniClaim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

