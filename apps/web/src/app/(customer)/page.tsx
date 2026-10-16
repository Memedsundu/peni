import type { CafeSummaryDTO } from "@peni/api";
import { cookies } from "next/headers";
import { CafeList } from "@/components/home/cafe-list";
import { HomeHero } from "@/components/home/home-hero";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";

export const dynamic = "force-dynamic";

/**
 * Home `/` (design-system.md §9.1): the hero, then "Kafeler". The cafés are read on the
 * server so the first paint is the real grid (and the card covers are there for the morph to
 * the café page). If that read fails, the list loads on the client with skeletons and an
 * inline error — the hero and the chrome stay.
 */
export default async function Home() {
  const cafes = await readCafes();
  return (
    <div className="flex flex-col gap-8 md:gap-12">
      <HomeHero />
      <CafeList initial={cafes} />
    </div>
  );
}

async function readCafes(): Promise<CafeSummaryDTO[] | null> {
  // Outside the try: cookies() signals dynamic rendering by throwing during prerender.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const app = await getApp();
    return await app.listCafes(app.customerForToken(token));
  } catch {
    return null;
  }
}
