-- Topluluk, first batch: the café answers a member's comment in its own name (a comment with
-- no customer, the staff member who wrote it, and the comment it answers, which takes its
-- replies with it when it goes); an index for how many comments a member wrote lately; and
-- when someone on the staff last looked at Topluluk, so Bugün can say what is new.
ALTER TABLE "PostComment" ALTER COLUMN "customerId" DROP NOT NULL,
ADD COLUMN "staffMemberId" TEXT,
ADD COLUMN "replyToId" TEXT;

CREATE INDEX "PostComment_customerId_createdAt_idx" ON "PostComment"("customerId", "createdAt");

ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommunitySeen" (
    "cafeId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunitySeen_pkey" PRIMARY KEY ("cafeId")
);

ALTER TABLE "CommunitySeen" ADD CONSTRAINT "CommunitySeen_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
