"use client";

import type { CafeDetailDTO } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AskiPanel } from "@/components/cafe/aski-panel";
import { CafeContext, type CafeCtx } from "@/components/cafe/cafe-context";
import { Banner, Button, Chip, Skeleton } from "@/components/ui";
import { peni } from "@/lib/client";

/*
 * QA harness for the Askı module. The café is fetched live (the cookie session decides who is
 * looking); `?durum=` bends the response into each state so every one can be screenshot:
 * /kit/aski?durum=claimed_today, ?kafe=kuzguncuk, ?bakiye=16 (the viewer's balance),
 * ?havuz=40 (the pool, in peni; the viewer may take), …
 */

type Durum =
  | "canli"
  | "claimed_today"
  | "too_new"
  | "blocked"
  | "not_member"
  | "signed_out"
  | "empty"
  | "closed"
  | "preorder_off"
  | "sakin"
  | "eslesmesiz"
  | "bakiyesiz"
  | "ikram"
  | "kalabalik";

const DURUMLAR: { id: Durum; label: string }[] = [
  { id: "canli", label: "Canlı veri" },
  { id: "claimed_today", label: "Bugün aldı" },
  { id: "too_new", label: "Yeni üye" },
  { id: "blocked", label: "Engelli" },
  { id: "not_member", label: "Üye değil" },
  { id: "signed_out", label: "Giriş yok" },
  { id: "empty", label: "Askı boş" },
  { id: "closed", label: "Sipariş kapalı" },
  { id: "preorder_off", label: "Önden sipariş kapalı" },
  { id: "sakin", label: "Sakin hafta" },
  { id: "eslesmesiz", label: "Eşleşme yok" },
  { id: "bakiyesiz", label: "Bakiye 0" },
  { id: "ikram", label: "Sepette ikram" },
  { id: "kalabalik", label: "23 çay" },
];

function bend(cafe: CafeDetailDTO, durum: Durum, bakiye: number | null, havuz: number | null): CafeDetailDTO {
  const a = { ...cafe.askida };
  const c: CafeDetailDTO = { ...cafe, askida: a };
  if (bakiye != null && c.membership) c.membership = { ...c.membership, balancePeni: bakiye };
  if (havuz != null) {
    const ref = cafe.menu.find((m) => m.askida && m.name === a.referenceItemName);
    a.balancePeni = havuz;
    a.itemsAvailable = ref ? Math.floor(havuz / Math.ceil(ref.priceKurus / 100)) : 0;
    a.myEligibility = { status: "ok" };
  }
  switch (durum) {
    case "claimed_today":
      a.myEligibility = { status: "claimed_today" };
      break;
    case "too_new":
      a.myEligibility = { status: "too_new", daysLeft: 3 };
      break;
    case "blocked":
      a.myEligibility = { status: "blocked" };
      break;
    case "not_member":
    case "signed_out":
      a.myEligibility = { status: "not_member" };
      c.membership = null;
      c.isMember = false;
      break;
    case "empty":
      a.balancePeni = 12;
      a.itemsAvailable = 0;
      a.myEligibility = { status: "ok" };
      break;
    case "sakin":
      a.claimedLast7Days = 2;
      a.donatedLast7DaysPeni = 0;
      a.wall = [];
      break;
    case "eslesmesiz":
      a.matchPercent = null;
      break;
    case "bakiyesiz":
      if (c.membership) c.membership = { ...c.membership, balancePeni: 0 };
      break;
    case "kalabalik":
      a.balancePeni = 23 * 30 + 4;
      a.itemsAvailable = 23;
      break;
    default:
      break;
  }
  if (durum === "closed" || durum === "preorder_off" || durum === "ikram") a.myEligibility = { status: "ok" };
  return c;
}

interface Params {
  durum: Durum;
  slug: string;
  bakiye: number | null;
  havuz: number | null;
}

function readParams(): Params {
  if (typeof window === "undefined") return { durum: "canli", slug: "moda", bakiye: null, havuz: null };
  const q = new URLSearchParams(window.location.search);
  const d = q.get("durum") as Durum | null;
  const num = (k: string) => {
    const v = q.get(k);
    return v != null && /^\d+$/.test(v) ? Number(v) : null;
  };
  return { durum: d && DURUMLAR.some((x) => x.id === d) ? d : "canli", slug: q.get("kafe") ?? "moda", bakiye: num("bakiye"), havuz: num("havuz") };
}

export function AskiKit() {
  const [{ durum, slug, bakiye, havuz }, setParams] = useState<Params>({ durum: "canli", slug: "moda", bakiye: null, havuz: null });
  const [raw, setRaw] = useState<CafeDetailDTO | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ikram, setIkram] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const load = useCallback(async (s: string) => {
    try {
      const [cafe, me] = await Promise.all([peni.cafes.get(s), peni.me.get().then(() => true, () => false)]);
      setRaw(cafe);
      setSignedIn(me);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : errorCopy.network);
    }
  }, []);

  useEffect(() => {
    const p = readParams();
    setParams(p);
    if (p.durum === "ikram") setIkram("cay");
    void load(p.slug);
  }, [load]);

  const ctx = useMemo<CafeCtx | null>(() => {
    if (!raw) return null;
    const cafe = bend(raw, durum, bakiye, havuz);
    const isSignedIn = durum === "signed_out" ? false : signedIn;
    const member = isSignedIn && cafe.membership != null;
    return {
      cafe,
      signedIn: isSignedIn,
      member,
      refresh: () => load(slug),
      requireJoin: (then) => {
        if (!isSignedIn) {
          window.location.assign(`/giris?returnTo=${encodeURIComponent(`/kit/aski?kafe=${slug}`)}`);
          return;
        }
        if (member) return then?.();
        setLog((l) => [`requireJoin: join ${slug}`, ...l]);
        void peni.cafes.join(slug).then(async () => {
          await load(slug);
          then?.();
        });
      },
      addIkram: (productId) => {
        setIkram(productId);
        setLog((l) => [`addIkram("${productId}")`, ...l]);
      },
      ikramProductId: ikram,
      orderingBlocked: durum === "closed" ? "closed" : durum === "preorder_off" ? "preorder_off" : null,
    };
  }, [raw, durum, bakiye, havuz, signedIn, slug, load, ikram]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="legend text-ink-2">§9.3 · §6.2 · A8 · A9</p>
        <h1 className="font-display text-h2">Askı modülü</h1>
        <p className="max-w-[640px] text-body text-ink-2">
          Kafe sayfasındaki askı paneli, canlı demo verisiyle. Her durum bir bağlantı uzağında; gerçek bağış ve katılma
          istekleri sunucuya gider.
        </p>
        <nav aria-label="Durumlar" className="flex flex-wrap gap-2">
          {DURUMLAR.map((d) => (
            <Chip key={d.id} kind="choice" selected={d.id === durum} href={`/kit/aski?durum=${d.id}&kafe=${slug}`}>
              {d.label}
            </Chip>
          ))}
        </nav>
      </header>

      {/* The café page grid from 1024px (§9.3): the panel sits in the 1fr column. */}
      <div className="grid gap-12 lg:grid-cols-[1fr_360px]">
        <section id="aski" className="min-w-0 scroll-mt-28">
          {error ? (
            <Banner
              tone="danger"
              title={error}
              action={
                <Button size="sm" variant="secondary" onClick={() => void load(slug)}>
                  {errorCopy.retry}
                </Button>
              }
            />
          ) : ctx ? (
            <CafeContext.Provider value={ctx}>
              <AskiPanel />
            </CafeContext.Provider>
          ) : (
            <div aria-busy className="flex flex-col gap-4 rounded-[14px] bg-aski-soft p-4 md:p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
        </section>
        <aside className="hidden flex-col gap-2 rounded-[14px] border border-dashed border-line-strong p-4 text-meta text-ink-2 lg:flex">
          <p className="legend">Kit günlüğü</p>
          {log.length === 0 ? <p>Henüz bir şey olmadı.</p> : log.map((l, i) => <p key={i} className="font-mono">{l}</p>)}
        </aside>
      </div>
    </div>
  );
}
