-- Plan piece 5: menu categories become their own records; products can be removed from the menu and kept.

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MenuItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Move each café's category names into categories, in the order they first appear on the menu.
INSERT INTO "MenuCategory" ("id", "cafeId", "name", "sortOrder")
SELECT 'cat_' || md5("cafeId" || ':' || "category"), "cafeId", "category",
       (ROW_NUMBER() OVER (PARTITION BY "cafeId" ORDER BY MIN("sortOrder"), "category") - 1)::INTEGER
FROM "MenuItem"
GROUP BY "cafeId", "category";

UPDATE "MenuItem" SET "categoryId" = 'cat_' || md5("cafeId" || ':' || "category");

ALTER TABLE "MenuItem" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "MenuCategory_cafeId_sortOrder_idx" ON "MenuCategory"("cafeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_cafeId_name_key" ON "MenuCategory"("cafeId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_cafeId_categoryId_sortOrder_idx" ON "MenuItem"("cafeId", "categoryId", "sortOrder");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
