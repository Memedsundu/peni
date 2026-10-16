/**
 * /kit-brand — every signature object (design-system.md §6) in every size and state, with
 * buttons that play each named animation (§7.2: A6 coin-strike, A7 coin-flip, A8 cup-hang,
 * A9 cup-take, A10 stage-advance, A11 hazır, A14 seat-take). For visual QA on iOS, Android and
 * the web preview, light and dark, with and without Reduce Motion.
 *
 * Dev only: it renders in `__DEV__` builds, or when the bundle is built with
 * `EXPO_PUBLIC_KIT=1`; anywhere else it sends the visitor home. Not linked from the app.
 */
import { askiItemFor, type ItemKind } from "@peni/brand/shapes";
import { askiCopy, orderCopy, type OrderStatus } from "@peni/brand/copy";
import { capitalizeTr, dateBlock, dativeTime, formatTL, formatTime, greeting, relDay, trUpper, type RefItem } from "@peni/brand/format";
import type { CafeHue } from "@peni/brand/tokens";
import { Redirect, Stack } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, Platform, ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  Amount,
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
  FisText,
  HazirStamp,
  HookGlyph,
  InkRule,
  LongTable,
  Manicule,
  Masthead,
  OxfordRule,
  SimitGlyph,
  StatusTrack,
  TableGlyph,
  type CoinCafe,
  type GlyphProps,
  type HangSignal,
} from "@/components/brand";
import { Button, ButtonRow, Card, Chip, Segmented, T } from "@/components/ui";
import { space, useTokens } from "@/lib/theme";

const KIT_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_KIT === "1";

export default function KitBrandRoute() {
  if (!KIT_ENABLED) return <Redirect href="/" />;
  return <KitBrand />;
}

/* ========================================================================================== */
/* Fixtures                                                                                   */
/* ========================================================================================== */

const MODA: CoinCafe = { name: "Moda Kahvesi", district: "Kadıköy", city: "İstanbul", slug: "moda" };
/** A long name: the 96 rim legend drops the district (over 30 characters). */
const KUZGUNCUK: CoinCafe = { name: "Kuzguncuk Kıraathanesi", district: "Üsküdar", city: "İstanbul", slug: "kuzguncuk" };
/** No district or city: the 56 coin shows only the top initial. */
const BARE: CoinCafe = { name: "Fener Ocağı", slug: "fener" };

const REF_ITEMS: RefItem[] = [
  { name: "Çay", priceKurus: 3000 },
  { name: "Türk Kahvesi", priceKurus: 9000 },
];

const HUES: { hue: CafeHue; name: string }[] = [
  { hue: "zeytin", name: "Zeytin" },
  { hue: "lacivert", name: "Lacivert" },
  { hue: "murekkep", name: "Mürekkep" },
  { hue: "patlican", name: "Patlıcan" },
];

const ITEM_NAMES: Record<ItemKind, string> = { glass: "Çay", fincan: "Türk Kahvesi", simit: "Simit" };

/* ========================================================================================== */
/* Frame                                                                                      */
/* ========================================================================================== */

function KitBrand() {
  const t = useTokens();
  return (
    <>
      <Stack.Screen options={{ title: "Marka kiti" }} />
      <ScrollView
        style={{ backgroundColor: t.bg }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: 16, paddingBottom: 96, gap: 48 }}
      >
        <KitHeader />
        <CoinSection />
        <AmountSection />
        <AskiSection />
        <FisSection />
        <MastheadSection />
        <CoverSection />
        <HueSection />
        <DateSection />
        <TableSection />
        <GlyphSection />
        <T variant="meta" color="ink2">
          Bu ekran yalnız geliştirme derlemelerinde ya da EXPO_PUBLIC_KIT=1 ile açılır.
        </T>
      </ScrollView>
    </>
  );
}

type ThemeChoice = "system" | "light" | "dark";
const canForceTheme = Platform.OS !== "web" && typeof Appearance.setColorScheme === "function";

function KitHeader() {
  const reduced = useReducedMotion();
  const [theme, setTheme] = useState<ThemeChoice>("system");

  // Leaving the kit hands the theme back to the system.
  useEffect(
    () => () => {
      if (canForceTheme) Appearance.setColorScheme("auto");
    },
    [],
  );

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <T variant="legend" color="ink2">
          İlan · §6
        </T>
        <T variant="h2">Marka kiti</T>
        <T variant="body" color="ink2">
          Beş imza nesnesi ve simgeler, her boyut ve durumuyla. Düğmeler her hareketi bir kez oynatır; hareketi azalt
          açıkken yerlerine solma ve geçişler gelir.
        </T>
      </View>
      {canForceTheme ? (
        <View style={{ gap: 8 }}>
          <T variant="meta" color="ink2">
            Görünüm
          </T>
          <Segmented
            id="kit-brand-theme"
            variant="track"
            label="Görünüm"
            items={[
              { id: "system", label: "Sistem" },
              { id: "light", label: "Açık" },
              { id: "dark", label: "Koyu" },
            ]}
            value={theme}
            onChange={(id) => {
              const next = id as ThemeChoice;
              setTheme(next);
              Appearance.setColorScheme(next === "system" ? "auto" : next);
            }}
          />
        </View>
      ) : (
        <T variant="meta" color="ink2">
          Web önizlemede tema tarayıcıdan gelir (prefers-color-scheme).
        </T>
      )}
      <T variant="meta" color="ink2">
        {reduced ? "Hareketi azalt: açık. Ölçek, kayma ve dönüş yok; yalnız opaklık." : "Hareketi azalt: kapalı."}
      </T>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: t.ink, paddingTop: 12 }}>
        <T variant="h2">{title}</T>
        {note ? (
          <T variant="meta" color="ink2">
            {note}
          </T>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <T variant="meta" color="ink2">
        {label}
      </T>
      {children}
    </View>
  );
}

function Wrap({ children, gap = 16, align = "flex-end" }: { children: ReactNode; gap?: number; align?: "center" | "flex-end" }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: align, gap }}>{children}</View>;
}

/** A specimen with its caption under it ("56", "zeytin"). */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      {children}
      <T variant="meta" color="ink2" tabular>
        {label}
      </T>
    </View>
  );
}

/* ========================================================================================== */
/* 6.1 Coin                                                                                   */
/* ========================================================================================== */

const SIZES = [16, 28, 56, 96] as const;

function CoinSection() {
  const [play, setPlay] = useState<{ kind: "strike" | "flip" | null; n: number }>({ kind: null, n: 0 });
  const [status, setStatus] = useState<string | null>(null);
  const run = (kind: "strike" | "flip") => {
    setStatus(null);
    setPlay((p) => ({ kind, n: p.n + 1 }));
  };

  return (
    <Section title="Peni jetonu" note="§6.1 · 16 satır içi · 28 satır · 56 cüzdan kartı · 96 kazanma anı, Peni kodum, giriş.">
      <Specimen label="Moda Kahvesi (bardak, M · K · İ)">
        <Wrap>
          {SIZES.map((s) => (
            <Labelled key={s} label={String(s)}>
              <Coin size={s} cafe={MODA} />
            </Labelled>
          ))}
        </Wrap>
      </Specimen>
      <Specimen label="Genel jeton (kafe yok): PENİ · MAHALLENİN MASASI">
        <Wrap>
          {SIZES.map((s) => (
            <Labelled key={s} label={String(s)}>
              <Coin size={s} />
            </Labelled>
          ))}
        </Wrap>
      </Specimen>
      <Specimen label="Kuzguncuk (fincan; uzun ad, kenar yazısında yalnız ad) · ilçesiz kafe (yalnız üst harf)">
        <Wrap>
          <Labelled label="56">
            <Coin size={56} cafe={KUZGUNCUK} />
          </Labelled>
          <Labelled label="96">
            <Coin size={96} cafe={KUZGUNCUK} />
          </Labelled>
          <Labelled label="56">
            <Coin size={56} cafe={BARE} />
          </Labelled>
          <Labelled label="96">
            <Coin size={96} cafe={BARE} />
          </Labelled>
        </Wrap>
      </Specimen>
      <Specimen label="Arka yüz (yalnız dönüşte görünür)">
        <Wrap>
          <Labelled label="28">
            <Coin size={28} cafe={MODA} face="back" />
          </Labelled>
          <Labelled label="56 · +30">
            <Coin size={56} cafe={MODA} face="back" backLabel="+30" />
          </Labelled>
          <Labelled label="96">
            <Coin size={96} cafe={MODA} face="back" />
          </Labelled>
        </Wrap>
      </Specimen>
      <Specimen label="A6 coin-strike · A7 coin-flip">
        <Card style={{ gap: 16 }}>
          <Wrap align="center" gap={24}>
            <Coin
              key={`a-${play.n}`}
              size={96}
              cafe={MODA}
              backLabel="+30"
              animate={play.kind}
              onLand={() => setStatus("Jeton indi.")}
              onAnimationComplete={() => setStatus((s) => (s ? `${s} Hareket bitti.` : "Hareket bitti."))}
            />
            <Coin key={`b-${play.n}`} size={56} cafe={KUZGUNCUK} backLabel="+30" animate={play.kind} haptics={false} />
            <Coin key={`c-${play.n}`} size={28} cafe={MODA} backLabel="+2" animate={play.kind} haptics={false} />
          </Wrap>
          <T variant="meta" color="ink2" accessibilityLiveRegion="polite">
            {status ?? "Bir hareket seç."}
          </T>
          <ButtonRow>
            <Button title="Darp et" variant="secondary" onPress={() => run("strike")} />
            <Button title="Çevir" variant="secondary" onPress={() => run("flip")} />
          </ButtonRow>
        </Card>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* Amount                                                                                     */
/* ========================================================================================== */

function AmountSection() {
  const [balance, setBalance] = useState(90);
  const [from, setFrom] = useState<number | null>(null);
  return (
    <Section title="Tutar" note="Jeton + sayaç + peni + ≈ ürün. Yalnız bütün ürünler; bir çaydan azsa ürün kısmı yok.">
      <Card style={{ gap: 20 }}>
        <Specimen label="sm · kafe kartı, üyelik çipi">
          <Amount peni={balance} refItems={REF_ITEMS} prefix="Sende" />
        </Specimen>
        <Specimen label="md · satır">
          <Amount peni={balance} refItems={REF_ITEMS} size="md" cafe={MODA} />
        </Specimen>
        <Specimen label="lg · cüzdan bakiyesi (A6 kazanınca)">
          <Amount peni={balance} refItems={REF_ITEMS} size="lg" cafe={MODA} from={from} />
        </Specimen>
        <Specimen label="Ürün yok (20 peni) · jetonsuz">
          <Wrap gap={24} align="center">
            <Amount peni={20} refItems={REF_ITEMS} prefix="Sende" />
            <Amount peni={1240} refItems={REF_ITEMS} coin={false} />
          </Wrap>
        </Specimen>
        <ButtonRow>
          <Button
            title="+6 peni kazan"
            variant="secondary"
            onPress={() => {
              setFrom(balance);
              setBalance(balance + 6);
            }}
          />
          <Button
            title="30 peni harca"
            variant="secondary"
            disabled={balance < 30}
            disabledReason={balance < 30 ? `Bakiyen ${balance}` : undefined}
            onPress={() => {
              setFrom(null);
              setBalance(balance - 30);
            }}
          />
        </ButtonRow>
      </Card>
    </Section>
  );
}

/* ========================================================================================== */
/* 6.2 Askı rafı                                                                              */
/* ========================================================================================== */

function AskiSection() {
  const [item, setItem] = useState<ItemKind>("glass");
  const [count, setCount] = useState(7);
  const [hang, setHang] = useState<HangSignal>(0);
  const [take, setTake] = useState(0);
  const hangN = typeof hang === "number" ? hang : hang.n;
  const name = ITEM_NAMES[item];

  return (
    <Section
      title="Askı rafı"
      note="§6.2 · A8 yalnız bağışçının kendi ekranında ve kasada, A9 yalnız alanın kendi sayfasında oynar. Kanca hiç sallanmaz."
    >
      <Segmented
        id="kit-aski-item"
        variant="track"
        label="Askıdaki ürün"
        items={[
          { id: "glass", label: "Çay" },
          { id: "fincan", label: "Kahve" },
          { id: "simit", label: "Simit" },
        ]}
        value={item}
        onChange={(id) => setItem(id as ItemKind)}
      />
      <Card tone="aski" style={{ gap: 16 }}>
        <T variant="legend" color="askiInk">
          Askıda kahve
        </T>
        <AskiRail
          count={count}
          item={item}
          size="md"
          hangSignal={hang}
          takeSignal={take}
          onTakeComplete={() => setCount((c) => Math.max(0, c - 1))}
        />
        <AskiCaption
          askida={{
            itemsAvailable: count,
            referenceItemName: name,
            claimsPerDay: 1,
            claimedLast7Days: 12,
            donatedLast7DaysPeni: 235,
          }}
        />
        <ButtonRow>
          <Button
            title="Askıya bırak"
            variant="secondary"
            onPress={() => {
              setCount((c) => c + 1);
              setHang({ n: hangN + 1 });
            }}
          />
          <Button
            title="Eşleşmeyle"
            variant="secondary"
            onPress={() => {
              setCount((c) => c + 2);
              setHang({ n: hangN + 1, count: 1, match: true });
            }}
          />
        </ButtonRow>
        <ButtonRow>
          <Button title="Askıdan al" variant="aski" disabled={count === 0} onPress={() => setTake((n) => n + 1)} />
          <Button title="Sıfırla" variant="quiet" onPress={() => setCount(7)} />
        </ButtonRow>
      </Card>

      <Specimen label="md · 6 yuva (alma sayfasındaki mini raf) · dolu raf, son yuva +N">
        <View style={{ gap: 16 }}>
          <AskiRail count={count} item={item} size="md" maxSlots={6} />
          <AskiRail count={19} item={item} size="md" />
        </View>
      </Specimen>
      <Specimen label="sm · kafe kartı (6 yuva): boş · 4 · 6 · 9">
        <Wrap gap={20}>
          {[0, 4, 6, 9].map((n) => (
            <Labelled key={n} label={askiCopy.cardLine(n, name)}>
              <AskiRail count={n} item={item} size="sm" />
            </Labelled>
          ))}
        </Wrap>
      </Specimen>
      <Specimen label="Ürün eşlemesi: adında çay → bardak, simit → simit, gerisi fincan">
        <Wrap gap={20}>
          {["Rize Çayı", "Simit", "Filtre Kahve"].map((n) => (
            <Labelled key={n} label={n}>
              <AskiRail count={3} item={askiItemFor(n)} size="sm" />
            </Labelled>
          ))}
        </Wrap>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* 6.3 Fiş                                                                                    */
/* ========================================================================================== */

const STAGES: { id: OrderStatus; label: string }[] = [
  { id: "submitted", label: "İletildi" },
  { id: "accepted", label: "Hazırlanıyor" },
  { id: "ready", label: "Hazır" },
  { id: "collected", label: "Teslim" },
];
const ORDER: OrderStatus[] = ["submitted", "accepted", "ready", "collected"];
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { submitted: "accepted", accepted: "ready", ready: "collected" };
const CODE = "P-003";
const DUE = 5500;

function FisSection() {
  const t = useTokens();
  const [status, setStatus] = useState<OrderStatus>("submitted");
  const [base] = useState(() => Date.now() - 9 * 60_000);
  const at = (min: number) => new Date(base + min * 60_000).toISOString();
  const order = useMemo(() => {
    const reached = (s: OrderStatus) => ORDER.indexOf(status) >= ORDER.indexOf(s);
    const rejected = status === "rejected";
    return {
      status,
      submittedAt: at(0),
      acceptedAt: !rejected && reached("accepted") ? at(2) : null,
      readyAt: !rejected && reached("ready") ? at(7) : null,
      closedAt: status === "collected" || rejected ? at(9) : null,
    };
  }, [status]);
  const ready = status === "ready";
  const next = NEXT[status];

  return (
    <Section title="Fiş" note="§6.3 · A10 aşama ilerler, A11 Hazır: fiş yeşile döner, mühür basılır, titreşim ve duyuru.">
      <Segmented
        id="kit-fis-status"
        variant="track"
        label="Sipariş durumu"
        items={STAGES}
        value={status === "rejected" ? "submitted" : status}
        onChange={(id) => setStatus(id as OrderStatus)}
      />
      <Fis tone={ready ? "ready" : "default"} legend={orderCopy.legend(MODA.name)} announce={orderCopy.readyAnnouncement(CODE)}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 12 }}>
          <View>
            <FisText variant="code">{CODE}</FisText>
            <FisText variant="meta" color="ink2">
              Ayşe
            </FisText>
          </View>
          {ready ? <HazirStamp style={{ marginTop: 8 }} /> : null}
        </View>
        <StatusTrack order={order} style={{ marginTop: 20 }} />
        <View style={{ marginTop: 20, gap: 4 }} accessibilityLiveRegion={ready ? "assertive" : "polite"}>
          <FisText variant="h3">{orderCopy.headline[status]}</FisText>
          {ready ? <FisText variant="body">{orderCopy.readyBody(CODE, DUE)}</FisText> : null}
          {status === "collected" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Coin size={28} cafe={MODA} animate="strike" />
              <FisText variant="strong" color="peniInk">
                {orderCopy.earned(2)}
              </FisText>
            </View>
          ) : null}
          {status === "rejected" ? (
            <>
              <FisText variant="meta" color="ink2">
                {orderCopy.rejectedNote("Malzeme bitti")}
              </FisText>
              <FisText variant="body">{orderCopy.rejectedPeniBack(90)}</FisText>
              <FisText variant="body">{orderCopy.rejectedAskiBack("Çay")}</FisText>
            </>
          ) : null}
        </View>
        <FisDivider style={{ marginTop: 16 }} />
        <View style={{ gap: 6 }}>
          <FisRow label="1 × Latte" value={formatTL(12000)} />
          <FisRow label="1 × Simit" value={formatTL(2500)} />
          <FisRow label="1 × Çay" value={formatTL(3000)} />
          <FisRow label={orderCopy.peniLine} value={formatTL(-9000)} muted />
          <FisRow label={orderCopy.askiLine} value={formatTL(-3000)} muted />
        </View>
        <FisDivider />
        <FisRow label={orderCopy.dueLabel} value={formatTL(DUE)} strong />
        <FisText variant="plate" color="ink2" style={{ marginTop: 16 }}>
          {orderCopy.memberCode("M7K-42Q")}
        </FisText>
      </Fis>
      <ButtonRow>
        <Button title="İlerlet" variant="secondary" disabled={!next} onPress={() => next && setStatus(next)} />
        <Button title="Kafe yetişemedi" variant="quiet" onPress={() => setStatus("rejected")} />
      </ButtonRow>

      <GiftSpecimen />

      <Specimen label="variant=ticket · Tezgâh (Oxford çizgisi ve tırtıl yok; 4pt kafe rengi)">
        <Fis variant="ticket" slug="moda" contentStyle={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
            <T variant="ticket">P-004</T>
            <T variant="item">Mehmet</T>
          </View>
          <T variant="item">2 × Çay</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T variant="item">1 × Simit</T>
            <Chip icon={<HookGlyph size={16} color={t.ink2} absoluteStrokeWidth />}>{askiCopy.ticketChip}</Chip>
          </View>
          <T variant="meta">{`Kasada ${formatTL(DUE)}`}</T>
        </Fis>
      </Specimen>

      <Specimen label="Sipariş fişi, tamamlanmış (yeniden açılınca mühür hareketsiz)">
        <Fis tone="ready" legend={orderCopy.legend(KUZGUNCUK.name)}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 12 }}>
            <FisText variant="code">P-012</FisText>
            <HazirStamp animate={false} style={{ marginTop: 8 }} />
          </View>
          <StatusTrack
            order={{ status: "ready", submittedAt: at(0), acceptedAt: at(1), readyAt: at(5), closedAt: null }}
            style={{ marginTop: 20 }}
          />
          <FisText variant="h3" style={{ marginTop: 20 }}>
            {orderCopy.headline.ready}
          </FisText>
          <FisText variant="body">{orderCopy.readyBody("P-012", 0)}</FisText>
        </Fis>
      </Specimen>
    </Section>
  );
}

function GiftSpecimen() {
  const [accepted, setAccepted] = useState(0);
  const deadline = useMemo(() => new Date(Date.now() + 22 * 3600_000), []);
  const day = capitalizeTr(relDay(deadline));
  return (
    <Specimen label="variant=gift · A7 kabul edince">
      <Fis variant="gift" legend={`ISMARLAMA · ${trUpper(MODA.name)}`}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", marginTop: 12 }}>
          <Coin key={accepted} size={56} cafe={MODA} backLabel="+30" animate={accepted > 0 ? "flip" : null} />
          <FisText variant="h3" style={{ flex: 1 }}>
            {accepted > 0 ? "Afiyet olsun! 30 peni cüzdanında." : "Ayşe sana 1 çay ısmarladı"}
          </FisText>
        </View>
        {accepted === 0 ? (
          <View style={{ gap: 8, marginTop: 12 }}>
            <FisText variant="question" style={{ fontSize: 17, lineHeight: 24 }}>
              “Afiyet olsun!”
            </FisText>
            <FisText variant="meta" color="ink2">
              {`${day} ${dativeTime(formatTime(deadline))} kadar kabul edebilirsin.`}
            </FisText>
          </View>
        ) : null}
        <ButtonRow style={{ marginTop: 16 }}>
          <Button title={accepted > 0 ? "Bir daha" : "Kabul et"} onPress={() => setAccepted((n) => n + 1)} />
          <Button title="Geri çevir" variant="quiet" onPress={() => setAccepted(0)} />
        </ButtonRow>
      </Fis>
    </Specimen>
  );
}

/* ========================================================================================== */
/* 6.4 Manşet, kapak                                                                          */
/* ========================================================================================== */

function MastheadSection() {
  const now = useMemo(() => new Date(), []);
  return (
    <Section title="Manşet" note="§6.4 · Oxford çizgisi yalnız burada ve fişin başında.">
      <Specimen label="Kafe sayfası, üye selamı ile">
        <Masthead cafe={MODA} date={now} greeting={`${greeting(now)} Ayşe.`} />
      </Specimen>
      <Specimen label="compact · Masa bölümünün başı">
        <Masthead cafe={MODA} date={now} compact />
      </Specimen>
      <Specimen label="Çizgiler: Oxford (3 · 2 · 1) ve mürekkep (1)">
        <View style={{ gap: 12 }}>
          <OxfordRule />
          <InkRule />
        </View>
      </Specimen>
    </Section>
  );
}

function CoverSection() {
  return (
    <Section title="Kafe kapağı" note="§6.4 · Fotoğraf yoksa kafe renginde, cihazıyla desenli plaka. Koyu temada 1px halka.">
      <Specimen label="card · 16/7 · moda (mürekkep + bardak), kuzguncuk (zeytin + fincan)">
        <View style={{ gap: 16 }}>
          <CafeCover cafe={{ slug: "moda", name: MODA.name, coverImageUrl: null }} size="card" />
          <CafeCover cafe={{ slug: "kuzguncuk", name: KUZGUNCUK.name, coverImageUrl: null }} size="card" />
        </View>
      </Specimen>
      <Specimen label="hero · 200pt, üst bant (şeffaf başlık altında)">
        <CafeCover cafe={{ slug: "fener", name: BARE.name, coverImageUrl: null, hue: "lacivert" }} size="hero" scrim />
      </Specimen>
      <Specimen label="Kafe seçtiği renk [G9]: patlıcan">
        <CafeCover cafe={{ slug: "moda", name: MODA.name, coverImageUrl: null, hue: "patlican" }} size="card" />
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* 6.6 Kafe rengi                                                                             */
/* ========================================================================================== */

function HueSection() {
  return (
    <Section title="Kafe rengi" note="§6.6 · 6 cüzdan kartı · 4 tezgâh fişi · 2 basın başlığı · 3 dikey gönderi kenarı.">
      {HUES.map(({ hue, name }) => (
        <Specimen key={hue} label={name}>
          <View style={{ gap: 8 }}>
            <CafeHueBand slug="moda" hue={hue} size={6} />
            <CafeHueBand slug="moda" hue={hue} size={4} />
            <CafeHueBand slug="moda" hue={hue} size={2} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <CafeHueBand slug="moda" hue={hue} size={3} orientation="vertical" />
              <T variant="body" color="ink2">
                Kafe gönderisinin sol kenarı
              </T>
            </View>
          </View>
        </Specimen>
      ))}
    </Section>
  );
}

/* ========================================================================================== */
/* 6.5 Tarih bloğu, uzun masa                                                                 */
/* ========================================================================================== */

/** Next Thursday, 19:00 in Istanbul (UTC+3 all year), whatever the device's own time zone. */
function nextThursdayAt19(): Date {
  const now = new Date();
  const add = (4 - now.getUTCDay() + 7) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add, 16, 0, 0));
}

function DateSection() {
  const date = useMemo(nextThursdayAt19, []);
  const block = dateBlock(date);
  return (
    <Section title="Tarih bloğu" note="§6.5 · Saat bloğun içine değil, yanına yazılır.">
      <Wrap gap={24}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <DateBlock date={date} />
          <View>
            <T variant="legend" color="masaInk">
              Peni masası
            </T>
            <T variant="item" tabular>
              {formatTime(date)}
            </T>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <DateBlock date={date} size="sm" />
          <T variant="meta" tabular>
            {`${block.short} · ${formatTime(date)}`}
          </T>
        </View>
      </Wrap>
    </Section>
  );
}

function TableSection() {
  const [going, setGoing] = useState(false);
  const seats = [{ initials: "AK" }, { initials: null }, { initials: "BS" }, { initials: "DE" }, { initials: null }];
  return (
    <Section title="Uzun masa" note="§6.5 · A14 Geliyorum deyince sandalyen yerine oturur. Gelmeyenler hiç çizilmez.">
      <Card style={{ gap: 16 }}>
        <T variant="legend" color="masaInk">
          Peni masası
        </T>
        <LongTable capacity={14} seats={going ? [...seats, { initials: "VS", me: true }] : seats} count={seats.length + (going ? 1 : 0)} rsvpedByMe={going} />
        <Button
          title={going ? "Geliyorsun" : "Geliyorum"}
          variant={going ? "secondary" : "primary"}
          onPress={() => setGoing((g) => !g)}
        />
      </Card>
      <Specimen label="Dolu masa (6/6)">
        <LongTable capacity={6} count={6} />
      </Specimen>
      <Specimen label="16'dan büyük masa: son alt sandalye +N">
        <LongTable capacity={24} count={19} rsvpedByMe />
      </Specimen>
      <Specimen label="Katılımcı listesi yokken [G4]: baş harfsiz sandalyeler">
        <LongTable capacity={10} count={3} />
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* 6.7 Glyphs                                                                                 */
/* ========================================================================================== */

const GLYPHS: { name: string; render: (p: GlyphProps) => ReactNode }[] = [
  { name: "CoinGlyph", render: (p) => <CoinGlyph {...p} /> },
  { name: "cezve", render: (p) => <DeviceGlyph kind="cezve" {...p} /> },
  { name: "glass", render: (p) => <DeviceGlyph kind="glass" {...p} /> },
  { name: "fincan", render: (p) => <DeviceGlyph kind="fincan" {...p} /> },
  { name: "simit", render: (p) => <SimitGlyph {...p} /> },
  { name: "HookGlyph", render: (p) => <HookGlyph {...p} /> },
  { name: "TableGlyph", render: (p) => <TableGlyph {...p} /> },
  { name: "Manicule", render: (p) => <Manicule {...p} /> },
];

function GlyphSection() {
  const t = useTokens();
  return (
    <Section title="Simgeler" note="§6.7 · 24'lük ızgara, 1.75 çizgi. 16pt'de mutlak çizgi, 32pt'de 1.5.">
      {GLYPHS.map((g) => (
        <Specimen key={g.name} label={g.name}>
          <Wrap gap={20} align="center">
            {g.render({ size: 16, absoluteStrokeWidth: true })}
            {g.render({ size: 20 })}
            {g.render({ size: 24 })}
            {g.render({ size: 32, strokeWidth: 1.5 })}
            {g.render({ size: 24, color: t.ink2 })}
          </Wrap>
        </Specimen>
      ))}
      <Specimen label="Manicule, tek kullanımı: “Neden peni?” bağlantısı">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <T variant="button">Neden peni?</T>
          <Manicule size={18} />
        </View>
      </Specimen>
    </Section>
  );
}
