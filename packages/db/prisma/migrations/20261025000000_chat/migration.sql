-- CreateTable
CREATE TABLE "AiChat" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiChat_cafeId_memberId_createdAt_idx" ON "AiChat"("cafeId", "memberId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedReport_cafeId_createdAt_idx" ON "SavedReport"("cafeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedReport_cafeId_key_key" ON "SavedReport"("cafeId", "key");

-- AddForeignKey
ALTER TABLE "AiChat" ADD CONSTRAINT "AiChat_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

