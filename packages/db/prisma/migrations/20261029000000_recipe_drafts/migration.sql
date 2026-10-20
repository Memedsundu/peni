-- CreateTable
CREATE TABLE "RecipeDraft" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "proposal" JSONB NOT NULL,
    "notes" TEXT[],
    "model" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "changed" TEXT[],
    "dismissReason" TEXT,

    CONSTRAINT "RecipeDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeDraft_cafeId_status_createdAt_idx" ON "RecipeDraft"("cafeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RecipeDraft_cafeId_createdAt_idx" ON "RecipeDraft"("cafeId", "createdAt");

-- AddForeignKey
ALTER TABLE "RecipeDraft" ADD CONSTRAINT "RecipeDraft_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
