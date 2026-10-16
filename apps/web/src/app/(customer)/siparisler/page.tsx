import type { Metadata } from "next";
import { cookies } from "next/headers";
import { OrdersPage, type OrdersInitial } from "@/components/order/orders-page";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Siparişlerim" };

/** Siparişlerim `/siparisler` (design-system.md §9.5), read on the server for the first paint. */
export default async function Page() {
  return <OrdersPage initial={await readOrders()} />;
}

async function readOrders(): Promise<OrdersInitial> {
  // Outside the try: cookies() signals dynamic rendering by throwing during prerender.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const app = await getApp();
    const customer = app.customerForToken(token);
    if (!customer) return { kind: "signed_out" };
    return { kind: "ok", orders: app.ordersFor(customer) };
  } catch {
    return { kind: "client" };
  }
}
