"use client";

import { newIdempotencyKey, PeniApiError, type CafeDetailDTO, type MenuItemDTO } from "@peni/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { peni } from "@/lib/client";
import { formatKurus, formatPeni } from "@/lib/format";
import { AskidaCard } from "./askida-card";
import { Feed } from "./feed";

type Cart = Record<string, number>;

export function CafeView({ slug }: { slug: string }) {
  const router = useRouter();
  const [cafe, setCafe] = useState<CafeDetailDTO | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [usePeni, setUsePeni] = useState(0);
  const [askidaProductId, setAskidaProductId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // One key per checkout attempt, so a double tap or a retry can't create two orders.
  const orderKey = useRef(newIdempotencyKey());

  const load = useCallback(async () => {
    try {
      setCafe(await peni.cafes.get(slug));
      peni.wallet.get().then(
        () => setSignedIn(true),
        () => setSignedIn(false),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const menuById = useMemo(() => new Map(cafe?.menu.map((m) => [m.productId, m]) ?? []), [cafe]);
  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const subtotal = lines.reduce((s, [id, q]) => s + (menuById.get(id)?.priceKurus ?? 0) * q, 0);
  const askidaKurus = askidaProductId && cart[askidaProductId] ? (menuById.get(askidaProductId)?.priceKurus ?? 0) : 0;
  const balance = cafe?.membership?.balancePeni ?? 0;
  const maxPeni = Math.max(
    0,
    Math.min(balance, Math.floor(((subtotal - askidaKurus) * (cafe?.maxRedeemSharePercent ?? 100)) / 100 / 100)),
  );
  const appliedPeni = Math.min(usePeni, maxPeni);
  const due = subtotal - askidaKurus - appliedPeni * 100;

  if (error) return <p className="text-berry">{error}</p>;
  if (!cafe) return <p className="text-ink-2">Yükleniyor…</p>;

  const member = !!cafe.membership;
  const add = (id: string, d: number) => {
    const q = Math.max(0, (cart[id] ?? 0) + d);
    if (q === 0 && askidaProductId === id) setAskidaProductId(null);
    setCart({ ...cart, [id]: q });
  };

  async function join() {
    setBusy(true);
    try {
      setCafe(await peni.cafes.join(slug));
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) router.push("/giris");
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function order() {
    setBusy(true);
    setError(null);
    try {
      const o = await peni.orders.create({
        cafeSlug: slug,
        lines: lines.map(([productId, quantity]) => ({ productId, quantity })),
        usePeni: appliedPeni,
        askidaProductId: askidaKurus > 0 ? askidaProductId : null,
        customerNote: note || undefined,
        idempotencyKey: orderKey.current,
      });
      router.push(`/siparis/${o.id}`);
    } catch (e) {
      setError((e as Error).message);
      orderKey.current = newIdempotencyKey();
      void load();
    } finally {
      setBusy(false);
    }
  }

  const categories = [...new Set(cafe.menu.map((m) => m.category))];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="font-serif text-4xl font-semibold">{cafe.name}</h1>
          <p className="text-ink-2">
            {[cafe.address, cafe.district].filter(Boolean).join(" · ")} · Her harcamada %{cafe.earnRatePercent} peni
            kazanırsın
          </p>
          {member ? (
            <p className="text-sm">
              <span className="coin" aria-hidden /> Bu kafede <strong>{formatPeni(balance)}</strong> var
              {!cafe.membership!.preorderEnabled && (
                <span className="ml-2 text-berry">· Uygulamadan sipariş özelliğin kapalı</span>
              )}
            </p>
          ) : signedIn === false ? (
            <Link href="/giris" className="btn btn-primary">
              Katılmak için giriş yap
            </Link>
          ) : (
            <button className="btn btn-primary" onClick={join} disabled={busy}>
              Kafeye katıl
            </button>
          )}
        </header>

        <AskidaCard
          slug={slug}
          askida={cafe.askida}
          items={cafe.menu.filter((m) => m.askida)}
          balancePeni={balance}
          canDonate={member}
          onChange={load}
        />

        <section className="space-y-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-semibold">Menü</h2>
            {!cafe.acceptingOrders && <span className="text-sm text-berry">Şu an uygulamadan sipariş alınmıyor</span>}
          </div>
          {categories.map((cat) => (
            <div key={cat}>
              <h3 className="mb-2 text-sm font-semibold tracking-wide text-ink-2 uppercase">{cat}</h3>
              <ul className="card divide-y divide-line">
                {cafe.menu
                  .filter((m) => m.category === cat)
                  .map((m) => (
                    <MenuRow
                      key={m.productId}
                      item={m}
                      qty={cart[m.productId] ?? 0}
                      canOrder={member && cafe.acceptingOrders && m.available}
                      askidaAvailable={cafe.askida.itemsAvailable > 0}
                      fromAskida={askidaProductId === m.productId}
                      onAdd={(d) => add(m.productId, d)}
                      onToggleAskida={() => {
                        if (askidaProductId === m.productId) setAskidaProductId(null);
                        else {
                          setAskidaProductId(m.productId);
                          if (!cart[m.productId]) add(m.productId, 1);
                        }
                      }}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </section>

        <Feed slug={slug} posts={cafe.posts} canInteract={member} onChange={load} />
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="card space-y-4 p-5">
          <h2 className="font-serif text-xl font-semibold">Siparişin</h2>
          {lines.length === 0 ? (
            <p className="text-sm text-ink-2">Menüden bir şey seç. Ödemeyi kasada yaparsın.</p>
          ) : (
            <>
              <ul className="space-y-1 text-sm">
                {lines.map(([id, q]) => (
                  <li key={id} className="flex justify-between">
                    <span>
                      {q} × {menuById.get(id)?.name}
                    </span>
                    <span>{formatKurus((menuById.get(id)?.priceKurus ?? 0) * q)}</span>
                  </li>
                ))}
              </ul>
              {askidaKurus > 0 && (
                <p className="flex justify-between text-sm text-leaf">
                  <span>Askıdan</span>
                  <span>−{formatKurus(askidaKurus)}</span>
                </p>
              )}
              {balance > 0 && maxPeni > 0 && (
                <label className="block space-y-1 text-sm">
                  <span className="flex justify-between">
                    <span>Peni kullan (en fazla {maxPeni})</span>
                    <span className="font-semibold text-copper">−{formatPeni(appliedPeni)}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={maxPeni}
                    value={appliedPeni}
                    onChange={(e) => setUsePeni(Number(e.target.value))}
                    className="w-full accent-[var(--copper)]"
                  />
                </label>
              )}
              <input className="input text-sm" placeholder="Not: az şekerli, yulaf sütlü…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
              <p className="flex justify-between border-t border-line pt-3 font-semibold">
                <span>Kasada ödenecek</span>
                <span>{formatKurus(due)}</span>
              </p>
              <button className="btn btn-primary w-full" disabled={busy || !cafe.acceptingOrders} onClick={order}>
                Siparişi gönder
              </button>
            </>
          )}
          {error && <p className="text-sm text-berry">{error}</p>}
        </div>
      </aside>
    </div>
  );
}

function MenuRow({
  item,
  qty,
  canOrder,
  askidaAvailable,
  fromAskida,
  onAdd,
  onToggleAskida,
}: {
  item: MenuItemDTO;
  qty: number;
  canOrder: boolean;
  askidaAvailable: boolean;
  fromAskida: boolean;
  onAdd: (delta: number) => void;
  onToggleAskida: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.name}</p>
        <p className="text-sm text-ink-2">
          {formatKurus(item.priceKurus)}
          {item.description && ` · ${item.description}`}
        </p>
      </div>
      {item.askida && canOrder && askidaAvailable && (
        <button className={`btn text-xs ${fromAskida ? "btn-leaf" : "btn-ghost"}`} onClick={onToggleAskida} aria-pressed={fromAskida}>
          {fromAskida ? "Askıdan ✓" : "Askıdan al"}
        </button>
      )}
      {canOrder && (
        <div className="flex items-center gap-2">
          {qty > 0 && (
            <button className="btn btn-ghost h-9 w-9 p-0" onClick={() => onAdd(-1)} aria-label={`${item.name} azalt`}>
              −
            </button>
          )}
          {qty > 0 && <span className="w-5 text-center font-semibold">{qty}</span>}
          <button className="btn btn-ghost h-9 w-9 p-0" onClick={() => onAdd(1)} aria-label={`${item.name} ekle`}>
            +
          </button>
        </div>
      )}
    </li>
  );
}
