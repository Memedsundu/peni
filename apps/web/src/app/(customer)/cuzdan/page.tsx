import type { Metadata } from "next";
import { cookies } from "next/headers";
import { parseSeen, SEEN_COOKIE } from "@/components/wallet/seen-balance";
import { WalletPage, type WalletInitial } from "@/components/wallet/wallet-page";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cüzdan" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Cüzdan `/cuzdan` (design-system.md §9.6), read on the server for the first paint.
 * `?ismarla={slug}` opens the gift sheet on that café (step 1 skipped).
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { ismarla } = await searchParams;
  const slug = typeof ismarla === "string" ? ismarla : Array.isArray(ismarla) ? (ismarla[0] ?? "") : null;
  return <WalletPage initial={await readWallet()} ismarla={slug} />;
}

async function readWallet(): Promise<WalletInitial> {
  // Outside the try: cookies() signals dynamic rendering by throwing during prerender.
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  try {
    const app = await getApp();
    const customer = app.customerForToken(token);
    if (!customer) return { kind: "signed_out" };
    const [wallet, cafes] = await Promise.all([app.wallet(customer), app.listCafes(customer)]);
    // The balances this device showed last time: the coin cards paint A6's first frame from them.
    return { kind: "ok", wallet, cafes, seen: parseSeen(jar.get(SEEN_COOKIE)?.value) };
  } catch {
    return { kind: "client" };
  }
}
