-- A line a person kept as an expense is remembered with no item, so it isn't offered as stock again.
ALTER TABLE "AiLineMatch" ALTER COLUMN "itemId" DROP NOT NULL;

-- The printed unit a learned pack size is for ("koli"), so "24 adet" of the same line isn't converted as koli.
ALTER TABLE "AiLineMatch" ADD COLUMN "readUnit" TEXT;
