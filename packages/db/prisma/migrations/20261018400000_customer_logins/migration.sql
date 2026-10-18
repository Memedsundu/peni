-- Plan piece 3: customers sign in with Google, Apple or an email code; phone becomes optional.

-- CreateEnum
CREATE TYPE "LoginProvider" AS ENUM ('google', 'apple', 'email');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CustomerLogin" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" "LoginProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLogin_customerId_idx" ON "CustomerLogin"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLogin_provider_subject_key" ON "CustomerLogin"("provider", "subject");

-- CreateIndex
CREATE INDEX "EmailCode_email_createdAt_idx" ON "EmailCode"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- AddForeignKey
ALTER TABLE "CustomerLogin" ADD CONSTRAINT "CustomerLogin_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

