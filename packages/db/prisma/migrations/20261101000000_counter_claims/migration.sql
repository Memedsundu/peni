-- The penny screen (N11): a café on its own till gives penny codes with no Penny order,
-- so a code's order becomes optional, and it keeps what was paid and who gave it.
ALTER TABLE "PeniClaim" ALTER COLUMN "orderId" DROP NOT NULL,
ADD COLUMN "paidKurus" INTEGER,
ADD COLUMN "staffMemberId" TEXT;
