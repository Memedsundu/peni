-- Photos a café uploads for its feed (plan piece 14).
CREATE TABLE "CafeImage" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "contentType" VARCHAR(20) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CafeImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CafeImage_cafeId_createdAt_idx" ON "CafeImage"("cafeId", "createdAt");

ALTER TABLE "CafeImage" ADD CONSTRAINT "CafeImage_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
