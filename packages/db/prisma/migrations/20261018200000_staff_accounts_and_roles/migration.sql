-- Plan piece 2: staff accounts with email and password, one role per café,
-- a chef role as in Shelby, and per-café changes to what each role may do.

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'chef';

-- CreateTable
CREATE TABLE "StaffAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "StaffAccount_pkey" PRIMARY KEY ("id")
);

-- Existing staff rows each get an account: one per linked customer, otherwise one
-- per email, otherwise one per row. A missing or already taken email becomes a
-- placeholder the owner replaces; nobody can sign in until a password is set.
WITH grouped AS (
    SELECT "id", "name", "customerId", "createdAt",
           COALESCE('c:' || "customerId", 'e:' || lower("email"), 'r:' || "id") AS "key",
           lower("email") AS "email"
    FROM "StaffMember"
), accounts AS (
    SELECT "key",
           'acct_' || md5("key") AS "id",
           min("name") AS "name",
           min("customerId") AS "customerId",
           min("email") AS "email",
           min("createdAt") AS "createdAt"
    FROM grouped
    GROUP BY "key"
), ranked AS (
    SELECT *, row_number() OVER (PARTITION BY "email" ORDER BY "createdAt", "key") AS "n" FROM accounts
)
INSERT INTO "StaffAccount" ("id", "email", "name", "customerId", "createdAt")
SELECT "id",
       CASE WHEN "email" IS NOT NULL AND "n" = 1 THEN "email" ELSE "id" || '@staff.peni.invalid' END,
       "name", "customerId", "createdAt"
FROM ranked;

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN "accountId" TEXT,
ADD COLUMN     "removedAt" TIMESTAMP(3);

UPDATE "StaffMember"
SET "accountId" = 'acct_' || md5(COALESCE('c:' || "customerId", 'e:' || lower("email"), 'r:' || "id"));

ALTER TABLE "StaffMember" ALTER COLUMN "accountId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "StaffMember" DROP CONSTRAINT "StaffMember_customerId_fkey";

-- DropIndex
DROP INDEX "StaffMember_cafeId_customerId_key";

-- DropIndex
DROP INDEX "StaffMember_cafeId_email_key";

-- AlterTable
ALTER TABLE "StaffMember" DROP COLUMN "customerId",
DROP COLUMN "email",
DROP COLUMN "name";

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSignInFailure" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSignInFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "cafeId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("cafeId","role","permission")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_email_key" ON "StaffAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_customerId_key" ON "StaffAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_accountId_idx" ON "StaffSession"("accountId");

-- CreateIndex
CREATE INDEX "StaffSignInFailure_email_at_idx" ON "StaffSignInFailure"("email", "at");

-- CreateIndex
CREATE INDEX "StaffMember_accountId_idx" ON "StaffMember"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_cafeId_accountId_key" ON "StaffMember"("cafeId", "accountId");

-- AddForeignKey
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StaffAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StaffAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
