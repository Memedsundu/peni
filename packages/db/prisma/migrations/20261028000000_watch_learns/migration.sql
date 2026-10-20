-- Gözcü learns (decision N3): what kind of finding was let go and whom it was about.
ALTER TABLE "WatchDismissal" ADD COLUMN "kind" TEXT, ADD COLUMN "subject" TEXT;

-- Earlier ones, from their keys: "voids:<member>:<week>" and "price:<item>:<bill>" name whom
-- they were about; drawer gaps, spikes and same-amount bills only name sessions and bills.
UPDATE "WatchDismissal" SET
  "kind" = CASE split_part("key", ':', 1)
    WHEN 'cash' THEN 'cashGap'
    WHEN 'spike' THEN 'billSpike'
    WHEN 'twice' THEN 'billTwice'
    ELSE split_part("key", ':', 1)
  END,
  "subject" = CASE split_part("key", ':', 1)
    WHEN 'voids' THEN split_part("key", ':', 2)
    WHEN 'price' THEN split_part("key", ':', 2)
    ELSE NULL
  END;

ALTER TABLE "WatchDismissal" ALTER COLUMN "kind" SET NOT NULL;

-- CreateIndex
CREATE INDEX "WatchDismissal_cafeId_kind_subject_idx" ON "WatchDismissal"("cafeId", "kind", "subject");

-- CreateTable
CREATE TABLE "WatchSuggestion" (
    "cafeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "orderMilli" INTEGER NOT NULL,

    CONSTRAINT "WatchSuggestion_pkey" PRIMARY KEY ("cafeId","itemId","day")
);

-- AddForeignKey
ALTER TABLE "WatchSuggestion" ADD CONSTRAINT "WatchSuggestion_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
