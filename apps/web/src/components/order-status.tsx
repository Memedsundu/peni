"use client";

import type { OrderDTO } from "@peni/api";
import Link from "next/link";
import { useEffect, useState } from "react";
import { peni } from "@/lib/client";
import { formatKurus, fulfillmentLabelsTr } from "@/lib/format";

const STEPS: OrderDTO["status"][] = ["submitted", "accepted", "ready", "collected"];

export function OrderStatus({ id }: { id: string }) {
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      peni.orders.get(id).then(
        (o) => alive && setOrder(o),
        (e) => alive && setError((e as Error).message),
      );
    void tick();
    // Push notifications do this on the phone; the web page polls.
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  if (error) return <p className="text-berry">{error}</p>;
  if (!order) return <p className="text-ink-2">Yükleniyor…</p>;

  const stepIndex = STEPS.indexOf(order.status);
  const failed = stepIndex < 0;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="card p-6 text-center">
        <p className="text-sm text-ink-2">{order.cafeName}</p>
        <p className="mt-1 font-serif text-5xl font-semibold">{order.orderNumber}</p>
        <p className={`mt-3 text-xl font-semibold ${order.status === "ready" ? "text-leaf" : failed ? "text-berry" : ""}`}>
          {fulfillmentLabelsTr[order.status]}
        </p>
        {order.rejectionReason && <p className="mt-1 text-ink-2">{order.rejectionReason}</p>}
        {failed && (order.askidaKurus > 0 || order.peniDiscountKurus > 0) && (
          <p className="mt-2 text-sm text-ink-2">Kullandığın peni cüzdanına, askıdan aldığın ürün askıya geri döndü.</p>
        )}
        {!failed && (
          <ol className="mt-6 grid grid-cols-4 gap-1">
            {STEPS.map((s, i) => (
              <li key={s} className="space-y-1">
                <div className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-copper" : "bg-surface-2"}`} />
                <p className="text-[11px] text-ink-2">{fulfillmentLabelsTr[s]}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="card space-y-2 p-5 text-sm">
        {order.lines.map((l, i) => (
          <p key={i} className="flex justify-between">
            <span>
              {l.quantity} × {l.name} {l.fromAskida && <span className="text-leaf">(askıdan)</span>}
            </span>
            <span>{formatKurus(l.unitPriceKurus * l.quantity)}</span>
          </p>
        ))}
        {order.askidaKurus > 0 && (
          <p className="flex justify-between text-leaf">
            <span>Askıdan</span>
            <span>−{formatKurus(order.askidaKurus)}</span>
          </p>
        )}
        {order.peniDiscountKurus > 0 && (
          <p className="flex justify-between text-copper">
            <span>Peni</span>
            <span>−{formatKurus(order.peniDiscountKurus)}</span>
          </p>
        )}
        <p className="flex justify-between border-t border-line pt-2 font-semibold">
          <span>Kasada ödenecek</span>
          <span>{formatKurus(order.dueKurus)}</span>
        </p>
      </div>

      <div className="flex gap-3">
        {order.status === "submitted" && (
          <button className="btn btn-berry" onClick={() => peni.orders.cancel(order.id).then(setOrder)}>
            İptal et
          </button>
        )}
        <Link href={`/k/${order.cafeSlug}`} className="btn btn-ghost">
          Kafeye dön
        </Link>
      </div>
    </div>
  );
}
