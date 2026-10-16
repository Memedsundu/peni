import type { OrderDTO } from "@peni/api";
import { activeStatuses } from "@peni/brand/copy";
import { cookies } from "next/headers";
import { BottomNav } from "@/components/chrome/bottom-nav";
import { HomeFooter } from "@/components/chrome/home-footer";
import type { ChromeSession } from "@/components/chrome/session";
import { TopBar } from "@/components/chrome/top-bar";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";
import { CustomerProviders } from "../providers";

/**
 * Customer chrome (design-system.md §8.2): TopBar, the page in a 1120px container, the footer
 * on "/" only, and the BottomNav below 768px. The session and the active orders are read here
 * on the server, so the first paint already shows the right header (no signed-out flash).
 */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { session, orders } = await readChrome();

  return (
    <CustomerProviders session={session} initialOrders={orders}>
      <a
        href="#icerik"
        className="sr-only z-50 rounded-[10px] bg-primary px-4 py-3 text-button text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        İçeriğe geç
      </a>
      <TopBar />
      {/* Below 768px the content stops above the bottom nav (or the café cart bar, same height). */}
      <div className="flex min-h-[calc(100dvh-var(--header-h))] flex-col pb-[var(--nav-h)] md:pb-0">
        <main id="icerik" tabIndex={-1} className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-12 outline-none sm:px-6 md:pt-8 md:pb-16 lg:px-8">
          {children}
        </main>
        <HomeFooter />
      </div>
      <BottomNav />
    </CustomerProviders>
  );
}

async function readChrome(): Promise<{ session: ChromeSession | null; orders: OrderDTO[] }> {
  // Outside the try: cookies() signals dynamic rendering by throwing during prerender.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const app = await getApp();
    const customer = app.customerForToken(token);
    if (!customer) return { session: null, orders: [] };
    const wallet = await app.wallet(customer).catch(() => null);
    return {
      session: { name: customer.displayName, hasMemberships: (wallet?.cafes.length ?? 0) > 0 },
      orders: app.ordersFor(customer).filter((o) => (activeStatuses as readonly string[]).includes(o.status)),
    };
  } catch {
    // The chrome must never take a page down; the client re-checks orders on its own.
    return { session: null, orders: [] };
  }
}
