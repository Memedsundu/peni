-- CreateTable
CREATE TABLE "ClaimCodeMiss" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimCodeMiss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimCodeMiss_customerId_at_idx" ON "ClaimCodeMiss"("customerId", "at");

-- AddForeignKey
ALTER TABLE "ClaimCodeMiss" ADD CONSTRAINT "ClaimCodeMiss_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

