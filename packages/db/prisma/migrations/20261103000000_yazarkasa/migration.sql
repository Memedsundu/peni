-- The yazarkasa (N12): KDV on products and order lines, what the device printed on a
-- payment, and the bridge on each till computer with the jobs it's given.
ALTER TABLE "MenuItem" ADD COLUMN "kdvPercent" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "OrderLine" ADD COLUMN "kdvPercent" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "Payment" ADD COLUMN "terminalData" JSONB;

CREATE TABLE "TillBridge" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "pairCodeHash" TEXT,
    "pairExpiresAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "name" TEXT,
    "pairedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "status" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "createdByMemberId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TillBridge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TerminalJob" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "bridgeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "task" JSONB NOT NULL,
    "paymentId" TEXT,
    "orderId" TEXT,
    "state" TEXT NOT NULL,
    "stage" TEXT,
    "message" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "result" JSONB,
    "conflict" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "createdByMemberId" TEXT,
    "sentAt" TIMESTAMP(3),
    "touchedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TerminalJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TillBridge_deviceId_key" ON "TillBridge"("deviceId");
CREATE UNIQUE INDEX "TillBridge_pairCodeHash_key" ON "TillBridge"("pairCodeHash");
CREATE UNIQUE INDEX "TillBridge_tokenHash_key" ON "TillBridge"("tokenHash");
CREATE INDEX "TillBridge_cafeId_idx" ON "TillBridge"("cafeId");
CREATE UNIQUE INDEX "TerminalJob_paymentId_key" ON "TerminalJob"("paymentId");
CREATE INDEX "TerminalJob_bridgeId_state_createdAt_idx" ON "TerminalJob"("bridgeId", "state", "createdAt");

ALTER TABLE "TillBridge" ADD CONSTRAINT "TillBridge_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TillBridge" ADD CONSTRAINT "TillBridge_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TillDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerminalJob" ADD CONSTRAINT "TerminalJob_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "TillBridge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
