"use client";

import type { CafeDetailDTO, PostDTO } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, Chip } from "@/components/ui";
import { peni } from "@/lib/client";
import { CafeContext, type CafeCtx } from "./cafe-context";
import { MasaFeed, MasaFeedSkeleton } from "./masa-feed";
import { MasaSignInNavigate } from "./masa-shared";

/*
 * QA harness for the Masa feed (/kit/masa). The café is fetched live (the cookie session decides
 * who is looking); `?durum=` bends the response into each state so every one can be
 * screenshot: /kit/masa?durum=dolu, ?kafe=kuzguncuk, … Actions really go to the demo server.
 */

type Durum =
  | "canli"
  | "uye-degil"
  | "giris-yok"
  | "cevapladi"
  | "cevapsiz"
  | "dolu"
  | "dolu-ben"
  | "gecti"
  | "yorumsuz"
  | "bos"
  | "hata"
  | "yukleniyor";

const DURUMLAR: { id: Durum; label: string }[] = [
  { id: "canli", label: "Canlı veri" },
  { id: "uye-degil", label: "Üye değil" },
  { id: "giris-yok", label: "Giriş yok" },
  { id: "cevapladi", label: "Bugün cevapladı" },
  { id: "cevapsiz", label: "Cevapsız soru" },
  { id: "dolu", label: "Masa doldu" },
  { id: "dolu-ben", label: "Doldu, ben de varım" },
  { id: "gecti", label: "Geçmiş masa" },
  { id: "yorumsuz", label: "Yorumsuz gönderi" },
  { id: "bos", label: "Masa boş" },
  { id: "hata", label: "İşlem hatası" },
  { id: "yukleniyor", label: "Yükleniyor" },
];

const HOUR = 3_600_000;

function bendPost(p: PostDTO, durum: Durum, now: number): PostDTO {
  const q = { ...p };
  if (durum === "uye-degil" || durum === "giris-yok") {
    q.reactedByMe = false;
    q.rsvpedByMe = false;
    q.answeredTodayByMe = false;
    q.attendees = p.attendees.filter((a) => !a.me);
  }
  if (q.kind === "question") {
    if (durum === "cevapladi") q.answeredTodayByMe = true;
    if (durum === "cevapsiz") {
      q.comments = [];
      q.commentCount = 0;
      q.answeredTodayByMe = false;
    }
  }
  if (q.kind === "event" && q.eventCapacity && Date.parse(q.eventStartsAt ?? "") > now) {
    if (durum === "dolu" || durum === "dolu-ben") {
      const me = durum === "dolu-ben";
      const others = q.attendees.filter((a) => !a.me);
      const fillers = ["ZD", null, "SA", "İG", null, "EÇ", "CÖ", null, "KA", "BK", "OY", null, "NA", "MK", "AY", null];
      while (others.length < q.eventCapacity - (me ? 1 : 0)) others.push({ initials: fillers[others.length % fillers.length] ?? null, me: false });
      q.attendees = me ? [...others, { initials: "AY", me: true }] : others;
      q.rsvpCount = q.eventCapacity;
      q.rsvpedByMe = me;
    }
    if (durum === "gecti") q.eventStartsAt = new Date(now - 26 * HOUR).toISOString();
  }
  if (q.kind === "post" && durum === "yorumsuz") {
    q.comments = [];
    q.commentCount = 0;
    q.reactionCount = 0;
    q.reactedByMe = false;
  }
  if (durum === "hata") q.id = `yok_${p.id}`;
  return q;
}

function bend(cafe: CafeDetailDTO, durum: Durum): CafeDetailDTO {
  const now = Date.now();
  const c: CafeDetailDTO = { ...cafe, posts: cafe.posts.map((p) => bendPost(p, durum, now)) };
  if (durum === "uye-degil" || durum === "giris-yok") {
    c.membership = null;
    c.isMember = false;
  }
  if (durum === "bos") c.posts = [];
  return c;
}

function readParams(): { durum: Durum; slug: string } {
  if (typeof window === "undefined") return { durum: "canli", slug: "moda" };
  const q = new URLSearchParams(window.location.search);
  const d = q.get("durum") as Durum | null;
  return { durum: d && DURUMLAR.some((x) => x.id === d) ? d : "canli", slug: q.get("kafe") ?? "moda" };
}

export function MasaKit() {
  const [{ durum, slug }, setParams] = useState<{ durum: Durum; slug: string }>({ durum: "canli", slug: "moda" });
  const [raw, setRaw] = useState<CafeDetailDTO | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  // "Giriş yap ve katıl" stays on this page and writes where it would have gone.
  const logSignIn = useCallback((href: string) => setLog((l) => [`signIn: ${decodeURIComponent(href)}`, ...l]), []);

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
    void load(p.slug);
  }, [load]);

  const ctx = useMemo<CafeCtx | null>(() => {
    if (!raw) return null;
    const cafe = bend(raw, durum);
    const isSignedIn = durum === "giris-yok" ? false : signedIn;
    const member = isSignedIn && cafe.membership != null;
    return {
      cafe,
      signedIn: isSignedIn,
      member,
      // Like the page shell: a failed re-read keeps what is on screen.
      refresh: () => load(slug).catch(() => undefined),
      requireJoin: (then) => {
        if (!isSignedIn) {
          setLog((l) => [`requireJoin: /giris?returnTo=/k/${slug}`, ...l]);
          return;
        }
        if (member) return then?.();
        setLog((l) => [`requireJoin: join sheet for ${slug}${then ? ", then continue" : ""}`, ...l]);
      },
      addIkram: () => undefined,
      ikramProductId: null,
      orderingBlocked: null,
    };
  }, [raw, durum, signedIn, slug, load]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="legend text-ink-2">§9.3 · §6.5 · A14</p>
        <h1 className="font-display text-h2">Masa akışı</h1>
        <p className="max-w-[640px] text-body text-ink-2">
          Kafe sayfasındaki Masa bölümü, canlı demo verisiyle. Kalp, katılım ve cevaplar gerçekten sunucuya gider; her
          durum bir bağlantı uzağında.
        </p>
        <nav aria-label="Durumlar" className="flex flex-wrap gap-2">
          {DURUMLAR.map((d) => (
            <Chip key={d.id} kind="choice" selected={d.id === durum} href={`/kit/masa?durum=${d.id}&kafe=${slug}`}>
              {d.label}
            </Chip>
          ))}
        </nav>
      </header>

      {/* The café page grid from 1024px (§9.3): the feed sits in the 1fr column. */}
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section id="masa" aria-label="Masa" className="min-w-0 scroll-mt-28">
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
          ) : ctx && durum !== "yukleniyor" ? (
            <CafeContext.Provider value={ctx}>
              <MasaSignInNavigate.Provider value={logSignIn}>
                <MasaFeed key={durum} />
              </MasaSignInNavigate.Provider>
            </CafeContext.Provider>
          ) : (
            <MasaFeedSkeleton />
          )}
        </section>
        <aside aria-label="Kayıt" className="hidden lg:block">
          <p className="legend text-ink-2">Bağlam çağrıları</p>
          <ul className="mt-3 flex flex-col gap-1 text-meta text-ink-2">
            {log.length === 0 ? <li>Henüz yok.</li> : log.map((l, i) => <li key={`${i}-${l}`}>{l}</li>)}
          </ul>
        </aside>
      </div>
    </div>
  );
}
