-- CreateTable
CREATE TABLE "WatchDismissal" (
    "cafeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchDismissal_pkey" PRIMARY KEY ("cafeId","key")
);

-- AddForeignKey
ALTER TABLE "WatchDismissal" ADD CONSTRAINT "WatchDismissal_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

