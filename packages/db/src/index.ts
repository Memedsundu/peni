import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";
import { PrismaClaimStore } from "./prisma-claim-store";
import { PrismaSpendCodeStore } from "./prisma-spend-code-store";
import { PrismaCommunityStore } from "./prisma-community-store";
import { PrismaDirectory } from "./prisma-directory";
import { PrismaIdentityStore } from "./prisma-identity-store";
import { PrismaLedgerStore } from "./prisma-ledger-store";
import { PrismaMenuStore } from "./prisma-menu-store";
import { PrismaOrderStore } from "./prisma-order-store";
import { PrismaPaymentStore } from "./prisma-payment-store";
import { PrismaCashStore } from "./prisma-cash-store";
import { PrismaStaffStore } from "./prisma-staff-store";
import { PrismaImageStore } from "./prisma-image-store";
import { PrismaReportStore } from "./prisma-report-store";
import { PrismaStockStore } from "./prisma-stock-store";
import { PrismaBillStore } from "./prisma-bill-store";
import { PrismaDebtStore } from "./prisma-debt-store";
import { PrismaBooksStore } from "./prisma-books-store";
import { PrismaShiftStore } from "./prisma-shift-store";
import { PrismaTaskStore } from "./prisma-task-store";
import { PrismaAssistantStore } from "./prisma-assistant-store";
import { PrismaChatStore } from "./prisma-chat-store";
import { PrismaLetterStore } from "./prisma-letter-store";

export * from "./generated/client";
export type { Db } from "./db";
export { PrismaLedgerStore } from "./prisma-ledger-store";
export { PrismaDirectory } from "./prisma-directory";
export { PrismaIdentityStore } from "./prisma-identity-store";
export { PrismaCommunityStore } from "./prisma-community-store";
export { PrismaMenuStore } from "./prisma-menu-store";
export { PrismaOrderStore } from "./prisma-order-store";
export { PrismaClaimStore } from "./prisma-claim-store";
export { PrismaSpendCodeStore } from "./prisma-spend-code-store";
export { PrismaPaymentStore } from "./prisma-payment-store";
export { PrismaCashStore } from "./prisma-cash-store";
export { PrismaStaffStore } from "./prisma-staff-store";
export { PrismaImageStore } from "./prisma-image-store";
export { PrismaReportStore } from "./prisma-report-store";
export { PrismaStockStore } from "./prisma-stock-store";
export { PrismaBillStore } from "./prisma-bill-store";
export { PrismaDebtStore } from "./prisma-debt-store";
export { PrismaBooksStore } from "./prisma-books-store";
export { PrismaShiftStore } from "./prisma-shift-store";
export { PrismaTaskStore } from "./prisma-task-store";
export { PrismaAssistantStore } from "./prisma-assistant-store";
export { PrismaChatStore } from "./prisma-chat-store";
export { PrismaLetterStore } from "./prisma-letter-store";

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Every store on one client. They all read and write through the ledger's open
 * transaction when there is one, so a peni operation and the records it touches
 * (a gift, a membership) commit or roll back together.
 */
export function createPrismaStores(prisma: PrismaClient) {
  const ledger = new PrismaLedgerStore(prisma);
  const db = () => ledger.db;
  return {
    ledger,
    directory: new PrismaDirectory(db),
    identity: new PrismaIdentityStore(db),
    community: new PrismaCommunityStore(db),
    menu: new PrismaMenuStore(db),
    orders: new PrismaOrderStore(db),
    claims: new PrismaClaimStore(db),
    spendCodes: new PrismaSpendCodeStore(db),
    payments: new PrismaPaymentStore(db),
    cash: new PrismaCashStore(db),
    staff: new PrismaStaffStore(db),
    images: new PrismaImageStore(db),
    reports: new PrismaReportStore(db),
    stock: new PrismaStockStore(db),
    bills: new PrismaBillStore(db),
    debts: new PrismaDebtStore(db),
    books: new PrismaBooksStore(db),
    shifts: new PrismaShiftStore(db),
    tasks: new PrismaTaskStore(db),
    assistant: new PrismaAssistantStore(db),
    chat: new PrismaChatStore(db),
    letters: new PrismaLetterStore(db),
  };
}
