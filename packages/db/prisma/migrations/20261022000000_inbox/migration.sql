-- AlterTable
ALTER TABLE "CafeDocument" ADD COLUMN     "emailId" TEXT,
ADD COLUMN     "sender" TEXT;

-- CreateTable
CREATE TABLE "CafeInbox" (
    "cafeId" TEXT NOT NULL,
    "token" VARCHAR(16) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeInbox_pkey" PRIMARY KEY ("cafeId")
);

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "skipped" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CafeInbox_token_key" ON "CafeInbox"("token");

-- CreateIndex
CREATE INDEX "InboundEmail_cafeId_receivedAt_idx" ON "InboundEmail"("cafeId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_cafeId_providerId_key" ON "InboundEmail"("cafeId", "providerId");

-- AddForeignKey
ALTER TABLE "CafeInbox" ADD CONSTRAINT "CafeInbox_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

