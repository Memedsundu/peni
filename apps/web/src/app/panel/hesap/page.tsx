import type { Metadata } from "next";
import { Account } from "./account";

export const metadata: Metadata = { title: "Hesabım · Kafe paneli", robots: { index: false } };

/** Hesabım: each person's own till PIN and password. `?kafe=moda` picks the café the PIN is for. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  return <Account cafeSlug={q.kafe ?? null} />;
}
