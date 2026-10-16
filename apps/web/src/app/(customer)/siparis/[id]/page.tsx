import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cache } from "react";
import { orderCopy } from "@peni/brand/copy";
import { orderCode } from "@/components/order/order-model";
import { OrderPage, type OrderInitial } from "@/components/order/order-page";
import { AppError } from "@/server/app";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * Order fiş `/siparis/[id]` (design-system.md §9.4). Read on the server so the first paint is
 * the real fiş (straight after "Siparişi gönder" there is no toast, D15: the fiş itself says
 * "Kafeye iletildi"). The client polls from there.
 */
export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const initial = await readOrder(id);
  return <OrderPage key={id} id={id} initial={initial} />;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const initial = await readOrder(id);
  if (initial.kind !== "ok") return { title: orderCopy.headerTitle };
  const code = orderCode(initial.order);
  // "Hazır · P-003" stands alone (no "· Peni"), as the spec writes it.
  if (initial.order.status === "ready" && code) return { title: { absolute: orderCopy.readyTitle(code) } };
  return { title: code ? `${orderCopy.headerTitle} ${code}` : orderCopy.headerTitle };
}

/** Shared by the page and its metadata within one request. */
const readOrder = cache(async (id: string): Promise<OrderInitial> => {
  // Outside the try: cookies() signals dynamic rendering by throwing during prerender.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const app = await getApp();
    const customer = app.customerForToken(token);
    if (!customer) return { kind: "signed_out" };
    return { kind: "ok", order: app.orderFor(customer, id) };
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return { kind: "not_found" };
    return { kind: "client" };
  }
});
