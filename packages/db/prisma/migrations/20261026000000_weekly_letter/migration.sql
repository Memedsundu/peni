-- CreateTable
CREATE TABLE "WeeklyLetter" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "WeeklyLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyLetter_cafeId_weekStart_key" ON "WeeklyLetter"("cafeId", "weekStart");

-- AddForeignKey
ALTER TABLE "WeeklyLetter" ADD CONSTRAINT "WeeklyLetter_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
