import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/components/auth/return-to";
import { SignIn } from "@/components/auth/sign-in";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";

export const metadata: Metadata = { title: "Giriş yap" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * `/giris` (design-system.md §9.2). `returnTo` is kept only when it is a same-origin path.
 * Someone already signed in goes straight on to it. The persona box shows ONLY when
 * NEXT_PUBLIC_DEMO=1.
 */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).returnTo;
  const returnTo = safeReturnTo(Array.isArray(raw) ? raw[0] : raw);

  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  let signedIn = false;
  try {
    const app = await getApp();
    signedIn = app.customerForToken(token) !== null;
  } catch {
    // Can't tell: show the form; signing in again is harmless.
  }
  if (signedIn) redirect(returnTo ?? "/");

  return <SignIn returnTo={returnTo} demo={process.env.NEXT_PUBLIC_DEMO === "1"} />;
}
