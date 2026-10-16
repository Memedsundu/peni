"use client";

import { newIdempotencyKey, PeniApiError, type OrderDTO, type StaffDashboardDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { Approx } from "@/components/brand/glyphs";
import { peni, readStaffKey, writeStaffKey } from "@/lib/client";
import { formatKurus, formatPeni, timeAgo } from "@/lib/format";

type Action = "accept" | "reject" | "ready" | "collect" | "no_show";

const COLUMNS: { status: OrderDTO["status"]; title: string }[] = [
  { status: "submitted", title: "Yeni" },
  { status: "accepted", title: "Hazırlanıyor" },
  { status: "ready", title: "Hazır" },
];

export function StaffPanel({ slug }: { slug: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("demo-staff");
  const [data, setData] = useState<StaffDashboardDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tillPeni, setTillPeni] = useState(30);

  useEffect(() => setKey(readStaffKey()), []);

  const load = useCallback(async () => {
    try {
      setData(await peni.staff.dashboard(slug));
      setError(null);
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 403) setKey(null);
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    if (!key) return;
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [key, load]);

  async function act(order: OrderDTO, action: Action) {
    let reason: string | undefined;
    if (action === "reject") {
      reason = window.prompt("Müşteriye görünecek sebep", "Bu ürün şu an bitti") ?? undefined;
      if (!reason) return;
    }
    try {
      await peni.staff.transition(slug, order.id, { action, reason });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!key)
    return (
      <form
        className="card mx-auto max-w-sm space-y-3 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          writeStaffKey(draftKey);
          setKey(draftKey);
        }}
      >
        <h1 className="font-serif text-2xl font-semibold">Kafe paneli</h1>
        <p className="text-sm text-ink-2">Personel anahtarı ile gir. Demo anahtarı: demo-staff</p>
        <input className="input" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
        <button className="btn btn-primary w-full">Gir</button>
        {error && <p className="text-sm text-berry">{error}</p>}
      </form>
    );

  if (!data) return <p className="text-ink-2">Yükleniyor…</p>;

  const r = data.report;
  const open = data.orders.filter((o) => COLUMNS.some((c) => c.status === o.status));
  const closed = data.orders.filter((o) => !COLUMNS.some((c) => c.status === o.status)).reverse();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl font-semibold">{data.cafe.name}</h1>
          <p className="text-sm text-ink-2">
            {data.memberCount} üye · {open.length} açık sipariş
          </p>
        </div>
        <button
          className={`btn ${data.cafe.appOrderingPaused ? "btn-leaf" : "btn-berry"}`}
          onClick={async () => {
            await peni.staff.setPaused(slug, !data.cafe.appOrderingPaused);
            await load();
          }}
        >
          {data.cafe.appOrderingPaused ? "Uygulama siparişini aç" : "Uygulama siparişini durdur"}
        </button>
      </header>
      {error && <p className="text-sm text-berry">{error}</p>}

      <section className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const orders = open.filter((o) => o.status === col.status);
          return (
            <div key={col.status} className="space-y-3 rounded-2xl bg-surface-2 p-3">
              <h2 className="px-1 font-semibold">
                {col.title} <span className="text-ink-2">({orders.length})</span>
              </h2>
              {orders.length === 0 && <p className="px-1 text-sm text-ink-2">Boş</p>}
              {orders.map((o) => (
                <OrderCard key={o.id} order={o} closesAtTill={data.cafe.posKind === "shelby"} onAction={(a) => act(o, a)} />
              ))}
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3 p-5">
          <h2 className="font-serif text-xl font-semibold">Askı</h2>
          <p>
            Askıda <strong>{formatPeni(data.askida.balancePeni)}</strong> var
            {data.askida.referenceItemName && (
              <>
                {" ("}
                <Approx /> {data.askida.itemsAvailable} {data.askida.referenceItemName.toLocaleLowerCase("tr")})
              </>
            )}
            .
          </p>
          <p className="text-sm text-ink-2">Kasada biri askı için nakit ödediyse buraya gir; aynı askıya eklenir.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              className="input w-28"
              value={tillPeni}
              onChange={(e) => setTillPeni(Math.max(1, Number(e.target.value)))}
            />
            <span className="text-sm text-ink-2">peni (1 peni = 1 TL)</span>
            <button
              className="btn btn-primary"
              onClick={async () => {
                await peni.staff.tillDonation(slug, { peni: tillPeni, idempotencyKey: newIdempotencyKey() });
                await load();
              }}
            >
              Askıya ekle
            </button>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-serif text-xl font-semibold">Son 30 gün</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Stat label="Dağıtılan peni" value={formatPeni(r.issuedPeni)} />
            <Stat label="Harcanan peni" value={formatPeni(r.redeemedPeni)} />
            <Stat label="Üyelerden askıya" value={formatPeni(r.askidaDonatedByMembersPeni)} />
            <Stat label="Kasadan askıya" value={formatPeni(r.askidaTillDonationsPeni)} />
            <Stat label="Kafenin katkısı" value={formatPeni(r.askidaMatchedByCafePeni)} />
            <Stat label="Askıdan verilen" value={`${r.askidaClaims} ikram`} />
          </dl>
          <p className="mt-4 rounded-xl bg-copper-soft p-3 text-sm">
            <strong>{formatPeni(r.outstandingPeni)}</strong> henüz harcanmadı (cüzdanlar, askı ve bekleyen ısmarlamalar). Bu,
            ileride ikram edeceğin ürünlerin TL karşılığı.
          </p>
        </div>
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Bugün kapananlar</h2>
          <ul className="card divide-y divide-line text-sm">
            {closed.map((o) => (
              <li key={o.id} className="flex justify-between px-4 py-2">
                <span>
                  {o.orderNumber} · {o.customerName}
                </span>
                <span className="text-ink-2">
                  {{ collected: "Teslim edildi", rejected: "Reddedildi", cancelled: "Müşteri iptal etti", no_show: "Gelmedi" }[o.status as string] ?? o.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OrderCard({
  order,
  closesAtTill,
  onAction,
}: {
  order: OrderDTO;
  closesAtTill: boolean;
  onAction: (a: Action) => void;
}) {
  return (
    <article className="card space-y-2 p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-serif text-2xl font-semibold">{order.orderNumber}</p>
        <p className="text-xs text-ink-2">{timeAgo(order.submittedAt)}</p>
      </div>
      <p className="text-sm font-medium">{order.customerName}</p>
      <ul className="text-sm">
        {order.lines.map((l, i) => (
          <li key={i}>
            {l.quantity} × {l.name}
            {l.fromAskida && <span className="ml-1 rounded bg-leaf-soft px-1 text-xs text-leaf">askı</span>}
            {l.note && <span className="text-ink-2"> · {l.note}</span>}
          </li>
        ))}
      </ul>
      {order.customerNote && <p className="rounded-lg bg-surface-2 px-2 py-1 text-sm">&ldquo;{order.customerNote}&rdquo;</p>}
      <p className="text-sm">
        Kasada: <strong>{formatKurus(order.dueKurus)}</strong>
        {order.peniDiscountKurus > 0 && <span className="text-copper"> · peni −{formatKurus(order.peniDiscountKurus)}</span>}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {order.status === "submitted" && (
          <>
            <button className="btn btn-primary" onClick={() => onAction("accept")}>
              Kabul et
            </button>
            <button className="btn btn-berry" onClick={() => onAction("reject")}>
              Reddet
            </button>
          </>
        )}
        {order.status === "accepted" && (
          <>
            <button className="btn btn-leaf" onClick={() => onAction("ready")}>
              Hazır
            </button>
            <button className="btn btn-berry" onClick={() => onAction("reject")}>
              Reddet
            </button>
          </>
        )}
        {order.status === "ready" && (
          <>
            {closesAtTill ? (
              <span className="self-center text-sm text-ink-2">Shelby kasasında ödenince kapanır</span>
            ) : (
              <button className="btn btn-primary" onClick={() => onAction("collect")}>
                Ödendi, teslim edildi
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => onAction("no_show")}>
              Gelmedi
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </>
  );
}
