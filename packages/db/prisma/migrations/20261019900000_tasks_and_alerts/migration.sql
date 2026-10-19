-- CreateTable
CREATE TABLE "TaskList" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assign" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskItem" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "days" INTEGER[],
    "sortOrder" INTEGER NOT NULL,
    "fromDay" TEXT NOT NULL,
    "untilDay" TEXT,

    CONSTRAINT "TaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCheck" (
    "cafeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "title" TEXT NOT NULL,
    "listName" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCheck_pkey" PRIMARY KEY ("cafeId","itemId","day")
);

-- CreateTable
CREATE TABLE "AlertDigest" (
    "cafeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "recipients" INTEGER NOT NULL,

    CONSTRAINT "AlertDigest_pkey" PRIMARY KEY ("cafeId","day")
);

-- CreateTable
CREATE TABLE "AlertMute" (
    "cafeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "AlertMute_pkey" PRIMARY KEY ("cafeId","memberId")
);

-- CreateIndex
CREATE INDEX "TaskList_cafeId_archivedAt_idx" ON "TaskList"("cafeId", "archivedAt");

-- CreateIndex
CREATE INDEX "TaskItem_cafeId_listId_idx" ON "TaskItem"("cafeId", "listId");

-- CreateIndex
CREATE INDEX "TaskCheck_cafeId_day_idx" ON "TaskCheck"("cafeId", "day");

-- AddForeignKey
ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCheck" ADD CONSTRAINT "TaskCheck_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDigest" ADD CONSTRAINT "AlertDigest_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertMute" ADD CONSTRAINT "AlertMute_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

