-- AlterTable
ALTER TABLE "AiDraft" ADD COLUMN     "duplicateOf" JSONB;

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "kdv" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "AiLineMatch" (
    "cafeId" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "readKey" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "perUnitMilli" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiLineMatch_pkey" PRIMARY KEY ("cafeId","supplierKey","readKey")
);

-- CreateIndex
CREATE INDEX "AiDraft_cafeId_documentId_idx" ON "AiDraft"("cafeId", "documentId");

-- AddForeignKey
ALTER TABLE "AiLineMatch" ADD CONSTRAINT "AiLineMatch_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

