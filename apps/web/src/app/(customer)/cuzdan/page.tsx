import type { Metadata } from "next";
import { cookies } from "next/headers";
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
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const app = await getApp();
    const customer = app.customerForToken(token);
    if (!customer) return { kind: "signed_out" };
    const [wallet, cafes] = await Promise.all([app.wallet(customer), app.listCafes(customer)]);
    return { kind: "ok", wallet, cafes };
  } catch {
    return { kind: "client" };
  }
}
