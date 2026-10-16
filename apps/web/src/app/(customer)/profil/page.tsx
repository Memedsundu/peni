import type { MeDTO } from "@peni/api";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ProfileView } from "@/components/profile/profile-view";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";

export const metadata: Metadata = { title: "Profil" };
export const dynamic = "force-dynamic";

/** Profil `/profil` (design-system.md §9.8): `GET /me` on the server, the rows on the client. */
export default async function ProfilePage() {
  return <ProfileView me={await readMe()} />;
}

/**
 * null only when nobody is signed in (the "Giriş yap" invitation). Any other failure is thrown,
 * so (customer)/error.tsx says "Bu sayfa açılamadı." with "Tekrar dene" instead of pretending
 * the visitor is signed out.
 */
async function readMe(): Promise<MeDTO | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const app = await getApp();
  const customer = app.customerForToken(token);
  return customer ? app.me(customer) : null;
}
