"use client";

import { askiCopy, cartCopy, elapsedChip, masaCopy, orderCopy, statusWords, type OrderStatus } from "@peni/brand/copy";
import { formatTL, trUpper } from "@peni/brand/format";
import type { ItemKind } from "@peni/brand/shapes";
import { cafeHueOrder } from "@peni/brand/tokens";
import { Clock, Gift, StickyNote } from "lucide-react";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import {
  Amount,
  Approx,
  AskiCaption,
  AskiRail,
  CafeCover,
  CafeHueBand,
  Coin,
  CoinGlyph,
  DateBlock,
  DeviceGlyph,
  Fis,
  FisDivider,
  FisRow,
  HazirStamp,
  HookGlyph,
  LongTable,
  Manicule,
  Masthead,
  SimitGlyph,
  StatusTrack,
  TableGlyph,
  type HangSignal,
  type StatusTrackOrder,
} from "@/components/brand";
import { applyTheme, readTheme, type ThemePreference } from "@/components/chrome/theme";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";

/* ========================================================================================== */
/* Fixtures: the demo cafés, on the spec's own example day (Friday 16 Oct 2026, Istanbul).     */
/* ========================================================================================== */

const MODA = { slug: "moda", name: "Moda Kahvesi", district: "Kadıköy", city: "İstanbul", coverImageUrl: null, hue: null };
const KUZGUNCUK = {
  slug: "kuzguncuk",
  name: "Kuzguncuk Kıraathanesi",
  district: "Üsküdar",
  city: "İstanbul",
  coverImageUrl: null,
  hue: null,
};
const MODA_REF = [
  { name: "Çay", priceKurus: 3_000 },
  { name: "Türk Kahvesi", priceKurus: 9_000 },
];
const PAPER_DATE = "2026-10-16T09:12:00+03:00";
const EVENT_DATE = "2026-10-22T19:00:00+03:00";
const SIZES = [16, 28, 56, 96] as const;

const T = (hhmm: string) => `2026-10-16T${hhmm}:00+03:00`;
const TRACK_FIXTURES: { status: OrderStatus; order: StatusTrackOrder }[] = [
  { status: "submitted", order: { status: "submitted", submittedAt: T("14:02"), acceptedAt: null, readyAt: null, closedAt: null } },
  { status: "accepted", order: { status: "accepted", submittedAt: T("14:02"), acceptedAt: T("14:03"), readyAt: null, closedAt: null } },
  { status: "ready", order: { status: "ready", submittedAt: T("14:02"), acceptedAt: T("14:03"), readyAt: T("14:09"), closedAt: null } },
  {
    status: "collected",
    order: { status: "collected", submittedAt: T("14:02"), acceptedAt: T("14:03"), readyAt: T("14:09"), closedAt: T("14:12") },
  },
  { status: "rejected", order: { status: "rejected", submittedAt: T("14:02"), acceptedAt: null, readyAt: null, closedAt: T("14:04") } },
  { status: "cancelled", order: { status: "cancelled", submittedAt: T("14:02"), acceptedAt: null, readyAt: null, closedAt: T("14:03") } },
  {
    status: "no_show",
    order: { status: "no_show", submittedAt: T("14:02"), acceptedAt: T("14:03"), readyAt: T("14:09"), closedAt: T("14:40") },
  },
];
const FLOW: OrderStatus[] = ["submitted", "accepted", "ready", "collected"];

const RAIL_ITEMS: { item: ItemKind; name: string }[] = [
  { item: "glass", name: "Çay" },
  { item: "fincan", name: "Filtre Kahve" },
  { item: "simit", name: "Simit" },
];
const RAIL_COUNTS = [0, 3, 7, 15];

const TABLE_6 = [{ initials: "ZD" }, { initials: "CÖ" }, { initials: null }, { initials: "EÇ" }, { initials: "SA" }];
const TABLE_FULL = [
  { initials: "ZD" },
  { initials: "CÖ" },
  { initials: null },
  { initials: "EÇ" },
  { initials: "SA" },
  { initials: null },
  { initials: "İG" },
  { initials: "NA" },
  { initials: "MK" },
  { initials: null },
  { initials: "AY", me: true },
  { initials: "DA" },
  { initials: null },
  { initials: "KA" },
];
const TABLE_20 = TABLE_FULL.slice(0, 13).map((s) => ({ initials: s.initials }));

/* ========================================================================================== */

export function BrandKit() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [reduced, setReduced] = useState(false);
  useEffect(() => setTheme(readTheme()), []);

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      <main className="mx-auto flex max-w-[1120px] flex-col gap-12 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="legend text-ink-2">Geliştirme kiti · İlan</p>
            <h1 className="font-display text-h1 text-ink">Marka nesneleri</h1>
            <p className="max-w-[60ch] text-body-lg text-ink-2">
              Jeton, askı rafı, fiş, manşet ve uzun masa: her boy, her durum. Düğmeler adlı animasyonları yeniden oynatır (§7.2).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              id="kit-theme"
              label="Görünüm"
              variant="track"
              items={[
                { id: "system", label: "Sistem" },
                { id: "light", label: "Açık" },
                { id: "dark", label: "Koyu" },
              ]}
              value={theme}
              onChange={(id) => {
                const next = id as ThemePreference;
                setTheme(next);
                applyTheme(next);
              }}
              className="w-full max-w-[360px]"
            />
            <Button variant="secondary" size="sm" aria-pressed={reduced} onClick={() => setReduced((r) => !r)}>
              {reduced ? "Azaltılmış hareket: açık" : "Azaltılmış hareket: kapalı"}
            </Button>
          </div>
        </header>

        <CoinSection />
        <AmountSection />
        <RailSection />
        <FisSection />
        <TrackSection />
        <MastheadSection />
        <CoverSection />
        <TableSection />
        <GlyphSection />
      </main>
    </MotionConfig>
  );
}

/* ========================================================================================== */

function Section({
  id,
  legend,
  title,
  note,
  actions,
  children,
}: {
  id: string;
  legend: string;
  title: string;
  note?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-6 border-t border-line pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[64ch] flex-col gap-1">
          <p className="legend text-ink-2">{legend}</p>
          <h2 id={`${id}-title`} className="font-display text-h2 text-ink">
            {title}
          </h2>
          {note && <p className="text-body text-ink-2">{note}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-meta text-ink-2">{children}</span>;
}

/* ---------------------------------------------------------------- Peni jetonu (§6.1, A6, A7) */

function CoinSection() {
  const [play, setPlay] = useState<{ kind: "strike" | "flip"; n: number } | null>(null);
  const rows = [
    { label: "Moda Kahvesi · ön yüz", cafe: MODA, face: "front" as const },
    { label: "Kuzguncuk Kıraathanesi · ön yüz (uzun ad: yalnız ad)", cafe: KUZGUNCUK, face: "front" as const },
    { label: "Arka yüz · +30 PENİ", cafe: MODA, face: "back" as const },
    { label: "Genel jeton (giriş, uygulama simgesi)", cafe: null, face: "front" as const },
  ];
  return (
    <Section
      id="coin"
      legend="§6.1 · A6 · A7"
      title="Peni jetonu"
      note="16 ve 28: kabartma p. 56: alamet ve baş harfler. 96: üstüne düz bant ve kenar yazısı."
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => setPlay((p) => ({ kind: "strike", n: (p?.n ?? 0) + 1 }))}>
            Darp et
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPlay((p) => ({ kind: "flip", n: (p?.n ?? 0) + 1 }))}>
            Çevir
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-[14px] bg-surface shadow-raised">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-3 border-b border-line px-4 py-5 last:border-b-0 md:px-5">
            <Label>{row.label}</Label>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              {SIZES.map((size) => (
                <div key={size} className="flex flex-col items-center gap-2">
                  <Coin
                    key={play && row.face === "front" ? `${play.kind}-${play.n}` : "still"}
                    size={size}
                    cafe={row.cafe}
                    face={row.face}
                    backLabel={row.face === "back" ? "+30" : play?.kind === "flip" ? "+30" : undefined}
                    animate={row.face === "front" ? (play?.kind ?? null) : null}
                  />
                  <span className="text-meta text-ink-2 tabular-nums">{size}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- Amount (§12.3, A6, A17) */

function AmountSection() {
  const [state, setState] = useState<{ peni: number; from: number | null }>({ peni: 141, from: null });
  const earn = () => setState((s) => ({ peni: s.peni + 6, from: s.peni }));
  return (
    <Section
      id="amount"
      legend="§12.3 · A6"
      title="Tutar"
      note="Jeton, yuvarlanan sayı, “peni” ve mal karşılığı. Jeton indiğinde sayı yukarı yuvarlanır."
      actions={
        <Button variant="secondary" size="sm" onClick={earn}>
          6 peni kazan
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-raised md:p-5">
          <Label>sm · kafe kartı</Label>
          <Amount
            size="sm"
            peni={state.peni}
            from={state.from}
            refItems={MODA_REF}
            cafe={MODA}
            prefix={<span className="text-body text-ink">Sende&nbsp;</span>}
          />
          <Amount size="sm" peni={20} refItems={MODA_REF} cafe={MODA} />
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-raised md:p-5">
          <Label>md · satırlar</Label>
          <Amount size="md" peni={state.peni} from={state.from} refItems={MODA_REF} cafe={MODA} />
          <Amount size="md" peni={state.peni} goods={false} coin={false} />
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-raised md:p-5">
          <Label>lg · cüzdan bakiyesi</Label>
          <Amount size="lg" peni={state.peni} from={state.from} refItems={MODA_REF} cafe={MODA} />
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-[14px] bg-peni-soft p-4">
        <Label>Kazanç önizlemesi (düz peni-soft panel)</Label>
        <p className="flex items-center gap-2 text-body text-ink">
          <Coin size={16} cafe={MODA} />
          <span>
            {cartCopy.earnPreview(2).before}
            <strong className="font-semibold text-peni-ink">{cartCopy.earnPreview(2).amount}</strong>
            {cartCopy.earnPreview(2).after}
          </span>
        </p>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- Askı rafı (§6.2, A8, A9) */

function RailSection() {
  const [count, setCount] = useState(7);
  const [hang, setHang] = useState<HangSignal>({ n: 0 });
  const [take, setTake] = useState(0);
  const n = typeof hang === "number" ? hang : hang.n;

  return (
    <Section
      id="rail"
      legend="§6.2 · A8 · A9"
      title="Askı rafı"
      note="Bir bardak, bekleyen bir ikram. Kanca asla sallanmaz; asma ve alma yalnız kişinin kendi ekranında oynar."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCount((c) => c + 1);
              setHang({ n: n + 1 });
            }}
          >
            Bir ikram as
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCount((c) => c + 2);
              setHang({ n: n + 1, match: true });
            }}
          >
            Eşleşmeyle as
          </Button>
          <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => setTake((t) => t + 1)}>
            Askıdan al
          </Button>
        </>
      }
    >
      <div className="flex max-w-[640px] flex-col gap-4 rounded-[14px] bg-aski-soft p-4">
        <div className="flex items-center gap-2 text-aski-ink">
          <HookGlyph size={20} />
          <span className="legend">{askiCopy.legend}</span>
        </div>
        <AskiRail
          count={count}
          item="glass"
          size="md"
          hangSignal={hang}
          takeSignal={take}
          onTakeComplete={() => setCount((c) => Math.max(0, c - 1))}
        />
        <AskiCaption
          askida={{ itemsAvailable: count, referenceItemName: "Çay", claimsPerDay: 1, claimedLast7Days: 12, donatedLast7DaysPeni: 235 }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {RAIL_ITEMS.map(({ item, name }) => (
          <div key={item} className="flex flex-col gap-5 rounded-[14px] bg-aski-soft p-4">
            <span className="legend text-aski-ink">{trUpper(name)}</span>
            {RAIL_COUNTS.map((c) => (
              <div key={c} className="flex flex-col gap-2">
                <div className="w-full max-w-[296px]">
                  <AskiRail count={c} item={item} size="md" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <AskiRail count={c} item={item} size="sm" />
                  <span className="text-meta text-ink">{askiCopy.cardLine(c, name)}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- Fiş (§6.3, A10, A11) */

function OrderLines({ status }: { status: OrderStatus }) {
  return (
    <>
      <FisDivider className="mt-5" />
      <div className="flex flex-col gap-1">
        <FisRow label={cartCopy.line(1, "Latte")} value={formatTL(12_000)} />
        <FisRow label={cartCopy.line(1, "Simit")} value={formatTL(2_500)} />
        <FisRow muted label={orderCopy.peniLine} value={formatTL(-9_000)} />
      </div>
      <FisDivider />
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-button">{orderCopy.dueLabel}</span>
        <span className="font-sans text-h3 tabular-nums">{formatTL(5_500)}</span>
      </div>
      {status !== "collected" && <p className="plate mt-4 text-plate text-ink-2">{orderCopy.memberCode("M7K-42Q")}</p>}
    </>
  );
}

function OrderFisDemo({ status, stampAnimates }: { status: OrderStatus; stampAnimates: boolean }) {
  const order = TRACK_FIXTURES.find((f) => f.status === status)!.order;
  const ready = status === "ready";
  return (
    <Fis variant="order" tone={ready ? "ready" : "default"} legend={orderCopy.legend("Moda Kahvesi")}>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className="font-display text-code whitespace-nowrap lining-nums tabular-nums">P-003</span>
          <span className="text-meta text-ink-2">Ayşe Y.</span>
        </div>
        {ready && <HazirStamp animate={stampAnimates} className="mt-3" />}
      </div>
      <StatusTrack order={order} className="mt-5" />
      <div className="mt-5 flex flex-col gap-1" aria-live={ready ? "assertive" : "polite"}>
        <p className="font-display text-h3">{orderCopy.headline[status]}</p>
        {ready && <p className="text-body">{orderCopy.readyBody("P-003", 5_500)}</p>}
        {status === "collected" && (
          <p className="mt-1 inline-flex items-center gap-2 text-body">
            <Coin size={28} cafe={MODA} animate="strike" />
            <span className="font-semibold text-peni-ink">{orderCopy.earned(2)}</span>
          </p>
        )}
      </div>
      <OrderLines status={status} />
    </Fis>
  );
}

function FisSection() {
  const [step, setStep] = useState(1);
  const [moved, setMoved] = useState(false);
  const status = FLOW[step % FLOW.length]!;
  const [accepted, setAccepted] = useState(false);
  const [flipKey, setFlipKey] = useState(0);
  const tick = elapsedChip(3);

  return (
    <Section
      id="fis"
      legend="§6.3 · A10 · A11 · A7"
      title="Fiş"
      note="Taraklı alt kenar CSS maskesiyle kesilir; gölge sarmalayıcıdadır. Hazır olunca fişin tamamı yeşile döner."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setMoved(true);
              setStep((s) => s + 1);
            }}
          >
            İlerlet: {statusWords[FLOW[(step + 1) % FLOW.length]!]}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setMoved(true);
              setStep(status === "ready" ? 1 : 2);
            }}
          >
            {status === "ready" ? "Hazırlanıyor’a dön" : "Hazır yap"}
          </Button>
        </>
      }
    >
      <div className="grid items-start gap-8 md:grid-cols-2">
        <div className="flex w-full max-w-[440px] flex-col gap-2">
          <Label>Sipariş · etkileşimli</Label>
          <OrderFisDemo status={status} stampAnimates={moved} />
        </div>
        <div className="flex w-full max-w-[440px] flex-col gap-2">
          <Label>Sipariş · Hazır (sayfa hazır açıldı: damga canlanmaz)</Label>
          <OrderFisDemo status="ready" stampAnimates={false} />
        </div>

        <div className="flex w-full max-w-[440px] flex-col gap-2">
          <Label>Ismarlama</Label>
          <Fis variant="gift" legend={`ISMARLAMA · ${trUpper("Moda Kahvesi")}`}>
            <div className="mt-4 flex items-start gap-4">
              <Coin key={flipKey} size={56} cafe={MODA} backLabel="+30" animate={flipKey > 0 ? "flip" : null} />
              <div className="flex min-w-0 flex-col gap-2">
                {accepted ? (
                  <p className="font-display text-h3">Afiyet olsun! 30 peni cüzdanında.</p>
                ) : (
                  <>
                    <p className="font-display text-h3">Ayşe sana 1 çay ısmarladı</p>
                    <p className="font-display text-[17px] leading-6 font-medium italic">“Afiyet olsun!”</p>
                    <p className="text-meta text-ink-2">Yarın 14:30&apos;a kadar kabul edebilirsin.</p>
                  </>
                )}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {accepted ? (
                <Button variant="quiet" size="sm" onClick={() => setAccepted(false)}>
                  Baştan
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setAccepted(true);
                      setFlipKey((k) => k + 1);
                    }}
                  >
                    Kabul et
                  </Button>
                  <Button variant="quiet">Geri çevir</Button>
                </>
              )}
            </div>
          </Fis>
        </div>

        <div className="flex w-full max-w-[440px] flex-col gap-2">
          <Label>Tezgâh bileti (personel)</Label>
          <Fis variant="ticket" slug="moda">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <span className="text-ticket [font-stretch:75%] tabular-nums">P-004</span>
                <span className="text-item">Mehmet</span>
              </div>
              <span className="inline-flex h-6 items-center gap-1 rounded-[4px] bg-surface-2 px-2 text-meta font-semibold text-ink-2 tabular-nums">
                <Clock size={16} strokeWidth={1.75} absoluteStrokeWidth aria-hidden />
                {tick.label}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-item">{cartCopy.line(2, "Çay")}</p>
              <p className="flex flex-wrap items-center gap-2 text-item">
                {cartCopy.line(1, "Simit")}
                <span className="inline-flex h-6 items-center gap-1 rounded-[4px] bg-surface-2 px-2 text-meta font-semibold text-ink-2">
                  <HookGlyph size={16} absoluteStrokeWidth />
                  {askiCopy.ticketChip}
                </span>
              </p>
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-warning-soft p-3 text-body text-ink">
              <StickyNote size={20} strokeWidth={1.75} aria-hidden className="mt-px shrink-0 text-warning-ink" />
              Not: az şekerli, yulaf sütlü
            </p>
            <p className="mt-3 text-meta text-ink-2">Kasada {formatTL(6_000)}</p>
            <Button variant="primary" size="lg" fullWidth className="mt-4">
              Kabul et
            </Button>
          </Fis>
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- StatusTrack, every status */

function TrackSection() {
  return (
    <Section
      id="track"
      legend="§6.3 · A10"
      title="Durum çizgisi"
      note="Dört durak; bir durak yalnız barista dokununca ilerler ve dokunduğu saati gösterir. Biten siparişler kaldığı yerde durur."
    >
      <div className="grid gap-8 md:grid-cols-2">
        {TRACK_FIXTURES.map(({ status, order }) => (
          <Fis
            key={status}
            variant="order"
            tone={status === "ready" ? "ready" : "default"}
            legend={trUpper(statusWords[status])}
            className="max-w-[440px]"
          >
            <StatusTrack order={order} className="mt-5" />
          </Fis>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- Manşet (§6.4) */

function MastheadSection() {
  return (
    <Section id="masthead" legend="§6.4" title="Manşet" note="Oxford çizgisi yalnız manşetin başında ve fişin başında görünür.">
      <div className="flex max-w-[720px] flex-col gap-4">
        <Label>Tam · üye selamıyla</Label>
        <CafeCover cafe={MODA} size="hero" morph={false} />
        <Masthead cafe={MODA} date={PAPER_DATE} greeting="Günaydın Ayşe." headingLevel={2} />
      </div>
      <div className="flex max-w-[720px] flex-col gap-4">
        <Label>Tam · uzun ad</Label>
        <Masthead cafe={KUZGUNCUK} date={PAPER_DATE} headingLevel={2} />
      </div>
      <div className="flex max-w-[720px] flex-col gap-4">
        <Label>Kısa · Masa bölümünün başı</Label>
        <h3 className="font-display text-h2">{masaCopy.section}</h3>
        <Masthead cafe={MODA} date={PAPER_DATE} compact />
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- Covers and colourways (§6.4, §6.6) */

function CoverSection() {
  return (
    <Section
      id="cover"
      legend="§6.4 · §6.6"
      title="Kapak ve kafe rengi"
      note="Fotoğraf yokken kafenin rengi üzerine kendi alameti. Karanlıkta 1px halka."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[MODA, KUZGUNCUK].map((cafe) => (
          <div key={cafe.slug} className="overflow-hidden rounded-[14px] bg-surface shadow-raised">
            <CafeCover cafe={cafe} size="card" />
            <div className="flex flex-col gap-1 p-4">
              <p className="legend text-ink-2">
                {cafe.district} · {cafe.city}
              </p>
              <p className="font-display text-h3">{cafe.name}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CafeCover cafe={KUZGUNCUK} size="hero" morph={false} />
        <div className="flex flex-col gap-4">
          {[MODA, KUZGUNCUK].map((cafe) => (
            <div key={cafe.slug} className="flex flex-col gap-2">
              <Label>{cafe.name} · 6 · 4 · 2 · 3 (dikey)</Label>
              <div className="flex flex-col gap-3">
                <CafeHueBand slug={cafe.slug} size={6} />
                <CafeHueBand slug={cafe.slug} size={4} />
                <CafeHueBand slug={cafe.slug} size={2} />
                <div className="flex min-h-11 items-stretch gap-3">
                  <CafeHueBand slug={cafe.slug} size={3} orientation="vertical" />
                  <span className="self-center text-meta text-ink-2">Kafe gönderisinin sol kenarı</span>
                </div>
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <Label>Dört renk: zeytin · lacivert · mürekkep · patlıcan</Label>
            <div className="grid grid-cols-4 gap-2">
              {cafeHueOrder.map((hue) => (
                <CafeHueBand key={hue} slug="moda" hue={hue} size={6} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- Uzun masa and date block (§6.5, A14) */

function TableSection() {
  const [rsvped, setRsvped] = useState(true);
  const seats = rsvped ? [...TABLE_6, { initials: "AY", me: true }] : TABLE_6;
  return (
    <Section
      id="table"
      legend="§6.5 · A14"
      title="Uzun masa"
      note="Masada herkes eşit: baş harfler yalnız profili açık olanlarda. Geri çevirenler hiç çizilmez."
      actions={
        <Button variant={rsvped ? "secondary" : "primary"} size="sm" aria-pressed={rsvped} onClick={() => setRsvped((r) => !r)}>
          {rsvped ? masaCopy.rsvped : masaCopy.rsvp}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-8">
        <div className="flex items-center gap-3">
          <DateBlock date={EVENT_DATE} size="md" />
          <div className="flex flex-col">
            <span className="legend text-masa-ink">{masaCopy.eventLegend}</span>
            <span className="text-item tabular-nums">19:00</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DateBlock date={EVENT_DATE} size="sm" />
          <span className="text-item tabular-nums">19:00</span>
        </div>
        <span className="inline-flex min-h-9 items-center gap-2 rounded-[10px] bg-masa-soft px-3 text-meta font-semibold text-masa-ink">
          <TableGlyph size={16} absoluteStrokeWidth />
          Per 19:00 · Peni masası
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-raised md:p-5">
          <Label>14 kişilik · ben de varım (etkileşimli)</Label>
          <LongTable capacity={14} seats={seats} count={seats.length} rsvpedByMe={rsvped} />
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-raised md:p-5">
          <Label>14 kişilik · dolu</Label>
          <LongTable capacity={14} seats={TABLE_FULL} count={14} rsvpedByMe />
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-raised md:p-5">
          <Label>20 kişilik · 16 sandalye çizilir, son sandalye “+N”</Label>
          <LongTable capacity={20} seats={TABLE_20} count={13} />
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-raised md:p-5">
          <Label>Katılımcı listesi yokken (yedek): yalnız sayı</Label>
          <LongTable capacity={8} count={3} rsvpedByMe />
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- Glyphs (§6.7) */

function GlyphSection() {
  const glyphs = [
    { label: "CoinGlyph", el: <CoinGlyph /> },
    { label: "Cezve", el: <DeviceGlyph kind="cezve" /> },
    { label: "Bardak", el: <DeviceGlyph kind="glass" /> },
    { label: "Fincan", el: <DeviceGlyph kind="fincan" /> },
    { label: "Simit", el: <SimitGlyph /> },
    { label: "Kanca", el: <HookGlyph /> },
    { label: "Uzun masa", el: <TableGlyph /> },
    { label: "El", el: <Manicule /> },
  ];
  return (
    <Section id="glyphs" legend="§6.7" title="Glifler" note="24'lük ızgarada çizgi glifler: currentColor, 1,75 kalınlık, yuvarlak uçlar.">
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-[14px] bg-line shadow-raised sm:grid-cols-8">
        {glyphs.map((g) => (
          <div key={g.label} className="flex flex-col items-center gap-2 bg-surface px-2 py-5 text-ink">
            {g.el}
            <span className="text-meta text-ink-2">{g.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-8">
        <a
          href="/masa-kurallari"
          className="inline-flex min-h-11 items-center gap-2 text-button text-ink underline-offset-[5px] hover:underline"
        >
          Neden peni?
          <Manicule size={18} />
        </a>
        <p className="text-body text-ink">
          Sende <span className="font-semibold text-peni-ink">90 peni</span>
          <span className="text-meta text-ink-2">
            {" · "}
            <Approx /> 3 çay
          </span>
        </p>
        <p className="inline-flex items-center gap-2 text-button text-ink">
          <Gift size={20} strokeWidth={1.75} aria-hidden />
          Bir çay ısmarla
        </p>
      </div>
    </Section>
  );
}
