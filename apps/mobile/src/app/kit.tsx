/**
 * /kit — every mobile primitive (design-system.md §12.5) in every variant and state, for visual
 * QA on iOS, Android and the web preview, light and dark, with and without Reduce Motion.
 *
 * Dev only: it renders in `__DEV__` builds, or when the bundle is built with
 * `EXPO_PUBLIC_KIT=1`; anywhere else it sends the visitor home. Not linked from the app.
 */
import { actionCopy, cartCopy, elapsedChip, errorCopy, peniCopy, staffCopy } from "@peni/brand/copy";
import { formatPeni, formatTL, MINUS } from "@peni/brand/format";
import { Redirect, Stack } from "expo-router";
import {
  AlarmClock,
  ArrowRight,
  CalendarPlus,
  Check,
  ChevronLeft,
  CircleAlert,
  CirclePause,
  Clock,
  Gift,
  Heart,
  Info,
  LogOut,
  MapPin,
  MessageCircle,
  Plus,
  QrCode,
  ReceiptText,
  Share2,
  Store,
  Timer,
  Undo2,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Appearance, Platform, ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { CoinGlyph, HookGlyph } from "@/components/brand/glyphs";
import {
  Banner,
  Button,
  ButtonRow,
  Card,
  Chip,
  ChipGroup,
  CountWheel,
  EmptyState,
  Field,
  FieldFrame,
  Icon,
  IconButton,
  Input,
  NumberRoll,
  PressableScale,
  Row,
  RowGroup,
  Segmented,
  Skeleton,
  StatusDot,
  Stepper,
  SwitchRow,
  T,
  toast,
  toastUndo,
  type ChipTone,
  type TypeVariant,
} from "@/components/ui";
import { fonts, radius, space, useTokens } from "@/lib/theme";

const KIT_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_KIT === "1";

export default function KitRoute() {
  if (!KIT_ENABLED) return <Redirect href="/" />;
  return <Kit />;
}

function Kit() {
  const t = useTokens();
  return (
    <>
      <Stack.Screen options={{ title: "Bileşen kiti" }} />
      <ScrollView
        style={{ backgroundColor: t.bg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: 16, paddingBottom: 96, gap: 48 }}
      >
        <KitHeader />
        <TypeSection />
        <PressableSection />
        <ButtonSection />
        <IconButtonSection />
        <StepperSection />
        <SegmentedSection />
        <ChipSection />
        <CardSection />
        <RowSection />
        <SwitchSection />
        <FieldSection />
        <BannerSection />
        <EmptySection />
        <SkeletonSection />
        <ToastSection />
        <NumberSection />
        <T variant="meta" color="ink2">
          Bu ekran yalnız geliştirme derlemelerinde ya da EXPO_PUBLIC_KIT=1 ile açılır.
        </T>
      </ScrollView>
    </>
  );
}

/* ========================================================================================== */
/* Frame                                                                                      */
/* ========================================================================================== */

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
          İlan · §12.5
        </T>
        <T variant="h2">Bileşen kiti</T>
        <T variant="body" color="ink2">
          Her mobil bileşen, her türü ve her durumuyla. Hareketi azalt ayarıyla sakin hâlleri, ekran okuyucuyla da
          etiketleri kontrol et.
        </T>
      </View>
      {canForceTheme ? (
        <View style={{ gap: 8 }}>
          <T variant="meta" color="ink2">
            Görünüm
          </T>
          <Segmented
            id="kit-theme"
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
        {reduced ? "Hareketi azalt: açık. Ölçek, kayma ve dönüş yok; yalnız renk ve opaklık." : "Hareketi azalt: kapalı."}
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

/** One labelled specimen. `surface` puts it on a raised card (contrast on cards). */
function Specimen({ label, surface = false, children }: { label: string; surface?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="meta" color="ink2">
        {label}
      </T>
      {surface ? <Card style={{ gap: 12 }}>{children}</Card> : children}
    </View>
  );
}

function Wrap({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap }}>{children}</View>;
}

/* ========================================================================================== */
/* T                                                                                          */
/* ========================================================================================== */

const TYPE_SAMPLES: { variant: TypeVariant; sample: string; note: string }[] = [
  { variant: "legend", sample: "Peni masası", note: "Archivo 600 · 13/16 · caps (trUpper)" },
  { variant: "plate", sample: "Moda · 16 Ekim Perşembe", note: "Archivo Narrow 600 · 13/16 · caps" },
  { variant: "meta", sample: "Ayşe K. · 09:12", note: "Archivo 400 · 13/18" },
  { variant: "body", sample: "Siparişini önceden ver, kasada öde.", note: "Archivo 400 · 16/22" },
  { variant: "strong", sample: "Kasada ödenecek", note: "Archivo 600 · 16/22" },
  { variant: "button", sample: "Siparişi gönder", note: "Archivo 600 · 16/20" },
  { variant: "item", sample: "Latte", note: "Archivo 600 · 17/22" },
  { variant: "price", sample: "₺120", note: "Archivo 600 · 15/20 · tabular" },
  { variant: "h3", sample: "Moda Kahvesi", note: "Brygada 600 · 22/26" },
  { variant: "h2", sample: "Siparişlerim", note: "Brygada 600 · 28/32" },
  { variant: "question", sample: "Mahallede en sevdiğin köşe neresi?", note: "Brygada 500 italik · 20/26" },
  { variant: "balance", sample: "141", note: "Brygada 600 · 40/44 · lining tabular" },
  { variant: "code", sample: "P-003", note: "Brygada 600 · 64/64" },
  { variant: "ticket", sample: "P-004", note: "Archivo Narrow 600 · 40/44 · tabular" },
];

function TypeSection() {
  const t = useTokens();
  return (
    <Section
      title="T"
      note="§4.5 ölçeği. Her ağırlık kendi ailesi; ağırlık stili hiç verilmez. legend ve plate büyük harfi trUpper ile yapar, ekran okuyucu özgün yazımı duyar."
    >
      <View style={{ gap: 16 }}>
        {TYPE_SAMPLES.map(({ variant, sample, note }) => (
          <View key={variant} style={{ gap: 2 }}>
            <T variant="meta" color="ink2">
              {`${variant} · ${note}`}
            </T>
            <T variant={variant}>{sample}</T>
          </View>
        ))}
      </View>
      <Specimen label="Renk rolleri (her biri kendi zemininde 4.5:1 üstü)">
        <View style={{ gap: 6 }}>
          <T>
            Sende{" "}
            <T variant="strong" color="peniInk">
              90 peni
            </T>
            <T variant="meta" color="ink2">
              {" · ≈ 3 çay"}
            </T>
          </T>
          <T variant="meta" color="askiInk">
            Askıda 7 çay
          </T>
          <T variant="legend" color="masaInk">
            Günün sorusu
          </T>
          <T variant="meta" color="successInk">
            kabul edildi
          </T>
          <T variant="meta" color="warningInk">
            Uygulama siparişleri durdu
          </T>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
            <Icon icon={CircleAlert} size={16} color={t.danger} />
            <T variant="meta" color="danger" style={{ flex: 1 }}>
              {errorCopy.orderSend}
            </T>
          </View>
        </View>
      </Specimen>
      <Specimen label="Türkçe: İ ve ı, latin-ext, büyük harf">
        <View style={{ gap: 6 }}>
          <T variant="body">İĞÜŞÖÇ ığüşöç ₺ â î û</T>
          <T variant="legend">sipariş ışık · yiyecek · kadıköy</T>
          <T variant="plate">istanbul · iç kapı</T>
        </View>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* PressableScale                                                                             */
/* ========================================================================================== */

function PressableSection() {
  const t = useTokens();
  const [count, setCount] = useState(0);
  return (
    <Section
      title="PressableScale"
      note="A1: basınca 100 ms’de 0.97’ye iner, aynı eğriyle döner. Hareketi azalt açıkken ölçek yok; zemin pressedColor’a geçer. 44pt altı her hedef dokunma alanını kendiliğinden 44pt’ye büyütür."
    >
      <Specimen label="Ölçek + pressedColor (surface → surface2)">
        <PressableScale
          onPress={() => setCount((n) => n + 1)}
          pressedColor={t.surface2}
          accessibilityLabel="Bas ve bırak"
          style={{ padding: 16, borderRadius: radius.card, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}
        >
          <T variant="strong">Bas ve bırak</T>
          <T variant="meta" color="ink2" tabular>
            {`${count} kez basıldı`}
          </T>
        </PressableScale>
      </Specimen>
      <Specimen label="targetScale={1}: satırlar ölçeklenmez, yalnız zemin değişir">
        <PressableScale
          targetScale={1}
          pressedColor={t.surface2}
          onPress={() => {}}
          accessibilityLabel="Satır gibi"
          style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.control, backgroundColor: t.surface }}
        >
          <T>Satır gibi basılır</T>
        </PressableScale>
      </Specimen>
      <Specimen label="24pt çizilen hedef, 44pt dokunma alanı (hitSlop ölçülerek)">
        <Wrap>
          <PressableScale
            onPress={() => toast("Küçük hedefe dokundun.")}
            pressedColor={t.surface2}
            accessibilityLabel="Küçük hedef"
            style={{ width: 24, height: 24, borderRadius: radius.full, borderWidth: 1.5, borderColor: t.lineStrong }}
          />
          <T variant="meta" color="ink2" style={{ flex: 1 }}>
            Dairenin çevresine de dokunabilirsin.
          </T>
        </Wrap>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* Button                                                                                     */
/* ========================================================================================== */

function ButtonSection() {
  const [sending, setSending] = useState(false);
  const send = () => {
    setSending(true);
    setTimeout(() => setSending(false), 2400);
  };
  return (
    <Section
      title="Button"
      note="primary · secondary · quiet · aski · danger-quiet; sm 44 · md 48 · lg 56. Devre dışı hâl opaklık değil: surface2 üstünde ink2, sebebi altında. Bakır düğme yoktur."
    >
      <Specimen label='variant="primary"'>
        <Wrap>
          <Button title="Kod gönder" />
          <Button title={cartCopy.open} iconEnd={ArrowRight} />
        </Wrap>
      </Specimen>
      <Specimen label='variant="secondary"'>
        <Wrap>
          <Button variant="secondary" title={actionCopy.gift} icon={Gift} />
          <Button variant="secondary" title={peniCopy.peniCode} icon={QrCode} />
        </Wrap>
      </Specimen>
      <Specimen label='variant="quiet"'>
        <Wrap>
          <Button variant="quiet" title="Numarayı değiştir" />
          <Button variant="quiet" title="Bir çay ısmarla" icon={Gift} />
        </Wrap>
      </Specimen>
      <Specimen label='variant="aski" + variant="secondary" (eşit ağırlık, ButtonRow)'>
        <ButtonRow>
          <Button variant="aski" title="Askıdan al" haptic="tap" fullWidth />
          <Button variant="secondary" title="Askıya bırak" fullWidth />
        </ButtonRow>
      </Specimen>
      <Specimen label='variant="danger-quiet"'>
        <Wrap>
          <Button variant="danger-quiet" title="İptal et" />
          <Button variant="danger-quiet" title={actionCopy.signOut} icon={LogOut} />
        </Wrap>
      </Specimen>
      <Specimen label="size: sm 44 · md 48 · lg 56">
        <Wrap>
          <Button size="sm" variant="secondary" title="Şimdi aç" />
          <Button size="md" title={actionCopy.continue} />
          <Button size="lg" title="Kabul et" haptic="confirm" />
        </Wrap>
      </Specimen>
      <Specimen label="loading (dokun): LoaderCircle + “Gönderiliyor…”">
        <Button fullWidth loading={sending} onPress={send} haptic="confirm" title={cartCopy.submit(5500)} />
      </Specimen>
      <Specimen label="disabled + disabledReason">
        <Button disabled disabledReason="Masa doldu" title="Geliyorum" />
      </Specimen>
      <Specimen label="disabled, sebepsiz">
        <Wrap>
          <Button disabled title="Askıya ekle" />
          <Button variant="secondary" disabled title="Takvime ekle" icon={CalendarPlus} />
          <Button variant="quiet" disabled title="Kodu tekrar gönder (0:42)" />
        </Wrap>
      </Specimen>
      <Specimen label="Kart üstünde" surface>
        <Button fullWidth title={cartCopy.submit(5500)} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button variant="secondary" title="Takvime ekle" icon={CalendarPlus} style={{ flex: 1 }} />
          <Button variant="quiet" title="Kafeye git" />
        </View>
      </Specimen>
      <Specimen label="Uzun etiket (kırılır, kesilmez)">
        <View style={{ width: 240, maxWidth: "100%" }}>
          <Button fullWidth variant="secondary" title="Kafeye katıl ve ısmarlamayı kabul et" />
        </View>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* IconButton                                                                                 */
/* ========================================================================================== */

function IconButtonSection() {
  const t = useTokens();
  const [sound, setSound] = useState(true);
  const [liked, setLiked] = useState(false);
  return (
    <Section title="IconButton" note="Yuvarlak, en az 44pt. label zorunlu (erişilebilirlik etiketi), ikon gizli.">
      <Specimen label='variant="quiet" (varsayılan)'>
        <Wrap gap={4}>
          <IconButton icon={X} label={actionCopy.close} />
          <IconButton icon={Share2} label="Paylaş" />
          <IconButton icon={QrCode} label={peniCopy.peniCode} />
          <IconButton icon={ChevronLeft} label={actionCopy.back} />
        </Wrap>
      </Specimen>
      <Specimen label='variant="secondary"'>
        <Wrap gap={8}>
          <IconButton variant="secondary" icon={Plus} label={cartCopy.add("Latte")} haptic="tap" />
          <IconButton variant="secondary" icon={UserRound} label="Profil" />
        </Wrap>
      </Specimen>
      <Specimen label="pressed (anahtar) · size 48 · 56">
        <Wrap gap={8}>
          <IconButton
            variant="secondary"
            size={48}
            icon={Heart}
            iconFill={liked ? t.ink : undefined}
            label="Kalp bırak"
            pressed={liked}
            haptic="tap"
            onPress={() => setLiked((v) => !v)}
          />
          <IconButton variant="secondary" size={56} icon={Plus} label={cartCopy.add("Simit")} />
        </Wrap>
      </Specimen>
      <Specimen label="disabled">
        <Wrap gap={8}>
          <IconButton variant="secondary" icon={Plus} label={cartCopy.add("Latte")} disabled />
          <IconButton icon={Share2} label="Paylaş" disabled />
        </Wrap>
      </Specimen>
      <Specimen label='variant="press" (press başlığında; iki temada da koyu)'>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            borderRadius: radius.control,
            backgroundColor: t.press,
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        >
          <T variant="strong" style={{ color: t.onPress, flex: 1, paddingLeft: 8 }}>
            Moda Kahvesi
          </T>
          <IconButton
            variant="press"
            icon={sound ? Volume2 : VolumeX}
            label={sound ? "Ses açık" : "Ses kapalı"}
            pressed={sound}
            onPress={() => setSound((v) => !v)}
          />
          <IconButton variant="press" icon={CirclePause} label="Durdur" />
          <IconButton variant="press" icon={LogOut} label={staffCopy.logout} />
        </View>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* Stepper                                                                                    */
/* ========================================================================================== */

function StepperSection() {
  const [latte, setLatte] = useState(0);
  const [simit, setSimit] = useState(2);
  const [peni, setPeni] = useState(30);
  const [cay, setCay] = useState(1);
  return (
    <Section
      title="Stepper"
      note="− 44 · sayı 28 · + 44 = sabit 116pt yuva. A2: 0.94’e iner, springs.tap ile döner. A3: 0 → 1’de − ve sayı belirir, hiçbir şey kaymaz. Sayı CountWheel ile döner."
    >
      <Specimen label="Menü satırı (collapsible, 0’da yalnız +)" surface>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T variant="item">Latte</T>
            <T variant="meta" color="ink2" tabular>
              {`${formatTL(12000)} · çift shot, süt köpüğü`}
            </T>
          </View>
          <Stepper value={latte} onChange={setLatte} itemName="Latte" max={9} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T variant="item">Simit</T>
            <T variant="meta" color="ink2" tabular>
              {formatTL(2500)}
            </T>
          </View>
          <Stepper value={simit} onChange={setSimit} itemName="Simit" max={9} />
        </View>
      </Specimen>
      <Specimen label="Peni (Başka): step 5, min 5, en çok bakiye; sınırda sebep">
        <Wrap>
          <T variant="body">Peni</T>
          <Stepper
            value={peni}
            onChange={setPeni}
            itemName="Peni"
            step={5}
            min={5}
            max={45}
            collapsible={false}
            maxReason="Bakiyen 45"
          />
        </Wrap>
      </Specimen>
      <Specimen label="Kasada askıya (personel)">
        <Wrap>
          <T variant="body" style={{ flex: 1 }}>
            {`Çay · ${formatPeni(30)}`}
          </T>
          <Stepper value={cay} onChange={setCay} itemName="Çay" collapsible={false} />
        </Wrap>
      </Specimen>
      <Specimen label="disabled">
        <Stepper value={1} onChange={() => {}} itemName="Çay" disabled />
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* Segmented                                                                                  */
/* ========================================================================================== */

function SegmentedSection() {
  const [section, setSection] = useState("menu");
  const [column, setColumn] = useState("new");
  const [theme, setTheme] = useState("system");
  return (
    <Section
      title="Segmented"
      note="48pt. A15: gösterge 200 ms’de kayar; hareketi azalt açıkken anında yer değiştirir. Değişim selection titreşimi verir. Sığmazsa yana kayar."
    >
      <Specimen label='variant="underline" (kafe bölümleri)'>
        <Segmented
          id="kit-cafe"
          label="Kafe bölümleri"
          items={[
            { id: "menu", label: "Menü" },
            { id: "aski", label: "Askı" },
            { id: "masa", label: "Masa" },
          ]}
          value={section}
          onChange={setSection}
        />
      </Specimen>
      <Specimen label="Sayılı (Tezgâh)">
        <Segmented
          id="kit-board"
          label={staffCopy.sections.tezgah}
          items={[
            { id: "new", label: staffCopy.columns.new, count: 2 },
            { id: "accepted", label: staffCopy.columns.accepted, count: 1 },
            { id: "ready", label: staffCopy.columns.ready, count: 0 },
          ]}
          value={column}
          onChange={setColumn}
        />
      </Specimen>
      <Specimen label='variant="track" (Görünüm)'>
        <Segmented
          id="kit-track"
          variant="track"
          label="Görünüm"
          items={[
            { id: "system", label: "Sistem" },
            { id: "light", label: "Açık" },
            { id: "dark", label: "Koyu" },
          ]}
          value={theme}
          onChange={setTheme}
        />
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* Chip                                                                                       */
/* ========================================================================================== */

const TONES: ChipTone[] = ["neutral", "peni", "aski", "masa", "success", "warning", "danger"];

function ChipSection() {
  const t = useTokens();
  const [item, setItem] = useState("cay");
  const elapsed = [3, 7, 12].map((m) => elapsedChip(m));
  const elapsedIcon = { Clock, Timer, AlarmClock } as const;
  return (
    <Section
      title="Chip"
      note="status 24pt (ikon + kelime; renk tek başına durum anlatmaz) · tag legend · choice 44pt, seçili 2pt ink kenar. Devre dışı seçenek sebebini altında yazar."
    >
      <Specimen label="status, tonlar">
        <Wrap gap={8}>
          {TONES.map((tone) => (
            <Chip key={tone} tone={tone}>
              {tone}
            </Chip>
          ))}
        </Wrap>
      </Specimen>
      <Specimen label="status, spec örnekleri">
        <Wrap gap={8}>
          <Chip tone="success" icon={Check}>
            Teslim edildi
          </Chip>
          <Chip icon={Undo2}>Kafe yetişemedi</Chip>
          <Chip>İptal edildi</Chip>
          <Chip tone="warning" icon={CircleAlert}>
            Teslim alınmadı
          </Chip>
          <Chip tone="warning" icon={Clock}>
            bekliyor
          </Chip>
          <Chip tone="success" icon={Check}>
            kabul edildi
          </Chip>
          <Chip icon={Undo2}>sana döndü</Chip>
          <Chip icon={<HookGlyph size={16} color={t.ink2} absoluteStrokeWidth />}>ikram</Chip>
        </Wrap>
      </Specimen>
      <Specimen label="status, geçen süre (0–4 · 5–9 · ≥10 dk)">
        <Wrap gap={8}>
          {elapsed.map((e) => (
            <Chip key={e.label} tone={e.tone} icon={elapsedIcon[e.icon]}>
              {e.label}
            </Chip>
          ))}
        </Wrap>
      </Specimen>
      <Specimen label="status dot">
        <Wrap gap={16}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <StatusDot tone="success" />
            <T variant="meta">Sipariş alıyor</T>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon icon={CirclePause} size={16} color={t.warningInk} />
            <T variant="meta" color="warningInk">
              Şu an sipariş almıyor
            </T>
          </View>
        </Wrap>
      </Specimen>
      <Specimen label="tag">
        <Wrap gap={8}>
          <Chip kind="tag">Tükendi</Chip>
          <Chip kind="tag">Geçti</Chip>
          <Chip kind="tag" tone="masa">
            Peni masası
          </Chip>
          <Chip kind="tag" tone="aski">
            Askıda kahve
          </Chip>
        </Wrap>
      </Specimen>
      <Specimen label="choice: Hangisi? (biri seçili, biri devre dışı)">
        <ChipGroup label="Hangisi?">
          <Chip kind="choice" selected={item === "cay"} onPress={() => setItem("cay")} detail={formatPeni(30)}>
            1 çay
          </Chip>
          <Chip kind="choice" selected={item === "simit"} onPress={() => setItem("simit")} detail={formatPeni(25)}>
            1 simit
          </Chip>
          <Chip kind="choice" disabledReason="Askıda yeterli peni yok">
            1 filtre kahve
          </Chip>
        </ChipGroup>
      </Specimen>
      <Specimen label="choice: tek satır, ikonlu, bakiye sınırı">
        <ChipGroup label="Ne ısmarlıyorsun?">
          <Chip kind="choice" selected icon={Gift}>
            {`1 çay · ${formatPeni(30)}`}
          </Chip>
          <Chip kind="choice" disabledReason="Bakiyen 25">
            {`1 Türk kahvesi · ${formatPeni(90)}`}
          </Chip>
          <Chip kind="choice">Başka</Chip>
        </ChipGroup>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* Card                                                                                       */
/* ========================================================================================== */

function CardSection() {
  const t = useTokens();
  return (
    <Section title="Card" note="raised: surface + yükselti (koyu temada yalnız 1pt line). Tonlar düz paneldir: gölge yok, kenar yok. Kart kart içine girmez.">
      <Card style={{ gap: 6 }}>
        <T variant="legend" color="ink2">
          Kadıköy · İstanbul
        </T>
        <T variant="h3">Moda Kahvesi</T>
        <T variant="meta" color="ink2">
          Her harcamada %5 peni · 1 peni = ₺1, yalnız bu kafede
        </T>
      </Card>
      <Card tone="aski" style={{ gap: 6 }}>
        <T variant="legend" color="askiInk">
          Askıda kahve
        </T>
        <T>Askıda 7 çay bekliyor.</T>
      </Card>
      <Card tone="masa" style={{ gap: 6 }}>
        <T variant="legend" color="masaInk">
          Günün sorusu
        </T>
        <T variant="question">Mahallede en sevdiğin köşe neresi?</T>
      </Card>
      <Card tone="peni" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <CoinGlyph size={16} color={t.peniInk} absoluteStrokeWidth />
        <T style={{ flex: 1 }}>
          Kasada ödeyince{" "}
          <T variant="strong" color="peniInk">
            +2 peni
          </T>{" "}
          kazanırsın
        </T>
      </Card>
      <Card tone="warning" style={{ gap: 4 }}>
        <T variant="strong">Not: az şekerli, yulaf sütlü</T>
      </Card>
    </Section>
  );
}

/* ========================================================================================== */
/* Row                                                                                        */
/* ========================================================================================== */

function RowSection() {
  const t = useTokens();
  return (
    <Section
      title="Row ve RowGroup"
      note="En az 56pt, 12 × 16 dolgu. Basınca zemin surface2 olur, satır ölçeklenmez. href satırı ArrowRight ile biter."
    >
      <RowGroup title="Profil">
        <Row title={peniCopy.peniCode} start={<Icon icon={QrCode} size={24} color={t.ink} />} onPress={() => toast("Peni kodum açılır.")} />
        <Row title="Masa kuralları" href="/masa-kurallari" />
        <Row title="Moda Kahvesi" meta="Kadıköy" start={<CoinGlyph size={24} color={t.peniInk} />} end={
          <T variant="strong" color="peniInk" tabular>
            {formatPeni(141)}
          </T>
        } />
        <Row title="Kafeye git" meta="Askıda 7 çay" start={<Icon icon={MapPin} size={24} color={t.ink} />} arrow onPress={() => {}} />
        <Row title="Üye sayısı" start={<Icon icon={Users} size={24} color={t.ink} />} end="142" />
        <Row title="Kafe moduna geç" meta="Bu kafe için personel anahtarı gerekli." disabled onPress={() => {}} />
        <Row title={actionCopy.signOut} tone="danger" start={<Icon icon={LogOut} size={24} color={t.danger} />} onPress={() => {}} />
      </RowGroup>
      <Specimen label="flat (bir sayfanın ya da fişin üstünde)">
        <RowGroup flat>
          <Row title="1 × Latte" end={formatTL(12000)} />
          <Row title="Peni" end={<T color="ink2" tabular>{`${MINUS}${formatTL(9000)}`}</T>} />
          <Row title="İkram" end={<T color="ink2" tabular>{`${MINUS}${formatTL(3000)}`}</T>} />
        </RowGroup>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* Switch                                                                                     */
/* ========================================================================================== */

function SwitchSection() {
  const [visible, setVisible] = useState(true);
  const [usePeni, setUsePeni] = useState(false);
  const [named, setNamed] = useState(false);
  return (
    <Section
      title="SwitchRow"
      note="RN Switch, 56pt satır; satırın tamamı dokunma alanı. Yalnız peni anahtarı bakırdır. Devre dışı hâl soluklaşmaz, sebebini yazar."
    >
      <Card padding="none" style={{ paddingHorizontal: 16 }}>
        <SwitchRow
          label="Profilim görünsün"
          hint="Açıkken Peni masasında baş harflerin, cevaplarda adın görünür."
          checked={visible}
          onCheckedChange={setVisible}
        />
        <SwitchRow
          tone="peni"
          label={cartCopy.usePeni(55)}
          value={`${MINUS}${formatTL(5500)}`}
          hint={cartCopy.usePeniCap(55)}
          checked={usePeni}
          onCheckedChange={setUsePeni}
        />
        <SwitchRow
          label="Adım askıda görünsün"
          hint="Kapalıyken bağışın adsız görünür."
          checked={named}
          onCheckedChange={setNamed}
        />
        <SwitchRow label="Titreşim" checked={false} onCheckedChange={() => {}} disabled disabledReason="Bu cihazda titreşim yok." />
        <SwitchRow label="Ses" checked onCheckedChange={() => {}} disabled disabledReason="Vardiya başlayınca açılır." />
      </Card>
    </Section>
  );
}

/* ========================================================================================== */
/* Field                                                                                      */
/* ========================================================================================== */

function FieldSection() {
  const [name, setName] = useState("Ayşe");
  const [phone, setPhone] = useState("532");
  const [note, setNote] = useState("");
  const [key, setKey] = useState("");
  const phoneError = phone.length > 0 && (!phone.startsWith("5") || phone.length !== 10) ? errorCopy.phone : null;
  return (
    <Section
      title="Field"
      note="Etiket girişin üstünde gerçek metin. 48pt, radius 10, 16pt Archivo, 1.5pt lineStrong kenar; odakta ink, hatada danger. Hata CircleAlert ile yazılır ve okunur."
    >
      <Field
        label="Adın"
        hint="Siparişin hazır olunca bu adla çağrılırsın."
        value={name}
        onChangeText={setName}
        autoComplete="given-name"
        textContentType="givenName"
      />
      <Field
        label="Telefon numarası"
        labelVariant="legend"
        prefix="+90"
        hint="Bu kafenin üyesi olmalı."
        error={phoneError}
        value={phone}
        onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
        keyboardType="number-pad"
        autoComplete="tel-national"
        textContentType="telephoneNumber"
        placeholder="5xx xxx xx xx"
      />
      <Field
        label="Notun (isteğe bağlı)"
        rows={3}
        maxLength={140}
        counter
        value={note}
        onChangeText={setNote}
        placeholder="Afiyet olsun!"
      />
      <Field
        label="Personel anahtarı"
        secureTextEntry
        value={key}
        onChangeText={setKey}
        error={key === "0000" ? errorCopy.staffKey : null}
        autoCapitalize="none"
      />
      <Field label="Adın" value="Ayşe Yılmaz" disabled hint="Giriş yapınca değiştirebilirsin." />
      <FieldFrame label="FieldFrame + Input (özel denetim)" hint="Kod alanları ve seçiciler bu çerçeveyi kullanır.">
        <Input placeholder="6 haneli kod" keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" accessibilityLabel="SMS ile gelen kod" />
      </FieldFrame>
    </Section>
  );
}

/* ========================================================================================== */
/* Banner                                                                                     */
/* ========================================================================================== */

function BannerSection() {
  return (
    <Section title="Banner" note="radius 10, dolgu 12, düz yumuşak zemin, ikon + kelime. danger her zaman CircleAlert ve uyarı olarak okunur.">
      <Banner tone="warning" icon={CirclePause} title="Kafe şu an uygulamadan sipariş almıyor. Kasaya uğrayabilirsin." />
      <Banner
        tone="warning"
        icon={VolumeX}
        title="Ses kapalı. Yeni siparişleri duymayabilirsin."
        action={<Button size="sm" variant="secondary" title="Sesi aç" />}
      />
      <Banner tone="warning" icon={CirclePause} title="Uygulama siparişleri durdu · 12 dk kaldı" action={<Button size="sm" title="Şimdi aç" />} />
      <Banner tone="danger" title={errorCopy.cafesLoad} action={<Button size="sm" variant="secondary" title={errorCopy.retry} />} />
      <Banner tone="info" title={cartCopy.dropped("Simit")} />
      <Banner tone="aski" icon={Info} title="Askı, eski mahalle sebilleri gibi.">
        Biri bırakır, isteyen alır; kimin aldığı hiçbir yerde görünmez.
      </Banner>
    </Section>
  );
}

/* ========================================================================================== */
/* EmptyState                                                                                 */
/* ========================================================================================== */

function EmptySection() {
  return (
    <Section title="EmptyState" note="64pt surface2 daire, 32pt ikon (çizgi 1.5), tek cümle, en çok bir ikincil düğme.">
      <Card padding="none">
        <EmptyState
          icon={ReceiptText}
          text="Henüz siparişin yok. Bir kafe seç, ilk siparişini ver."
          action={{ label: actionCopy.browseCafes, href: "/" }}
        />
      </Card>
      <EmptyState icon={Store} text="Yakında burada mahallenin kafeleri olacak." />
      <EmptyState icon={MessageCircle} text="Masa bugün sakin. Kafe yeni bir soru sorunca burada görürsün." />
    </Section>
  );
}

/* ========================================================================================== */
/* Skeleton                                                                                   */
/* ========================================================================================== */

function SkeletonSection() {
  return (
    <Section title="Skeleton" note="Durağan surface2; parıltı ve nabız yok. Metin satırı, yerini tuttuğu satır yüksekliğinin 0.7’si; satırın yüksekliği korunur.">
      <Specimen label="Kafe kartı">
        <Card padding="none" accessibilityState={{ busy: true }}>
          <Skeleton aspectRatio={16 / 7} radius={0} />
          <View style={{ padding: 16, gap: 4 }}>
            <Skeleton line="legend" width="40%" />
            <Skeleton line="h3" width="70%" />
            <Skeleton line="meta" width="55%" />
          </View>
        </Card>
      </Specimen>
      <Specimen label="İki satır">
        <RowGroup>
          {[0, 1].map((i) => (
            <View key={i} style={{ minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Skeleton width={28} height={28} radius="full" />
              <View style={{ flex: 1 }}>
                <Skeleton line="body" width="60%" />
                <Skeleton line="meta" width="35%" />
              </View>
              <Skeleton line="body" width={48} />
            </View>
          ))}
        </RowGroup>
      </Specimen>
    </Section>
  );
}

/* ========================================================================================== */
/* Toast                                                                                      */
/* ========================================================================================== */

function ToastSection() {
  const [undoResult, setUndoResult] = useState<string | null>(null);
  return (
    <Section
      title="Toast"
      note="Üstte, güvenli alanın altında; aynı anda bir tane. 4 sn (geri almalı 5 sn). FadeInUp 200 / FadeOutUp 150; hareketi azalt açıkken yalnız solar. Her toast okunur."
    >
      <Wrap gap={8}>
        <Button variant="secondary" size="sm" title="Nötr" onPress={() => toast("1 çay askıya asıldı. Kafe de 15 peni ekledi.")} />
        <Button variant="secondary" size="sm" title="Başarı" onPress={() => toast("Askıya 2 çay eklendi.", { tone: "success" })} />
        <Button variant="secondary" size="sm" title="Hata" onPress={() => toast(errorCopy.change, { tone: "danger" })} />
        <Button
          variant="secondary"
          size="sm"
          title="Geri al"
          onPress={() => {
            setUndoResult(null);
            toastUndo("P-004 · Hazır", {
              onUndo: () => setUndoResult("Geri alındı; hiçbir şey gönderilmedi."),
              onCommit: () => setUndoResult("Süre doldu; kaydedildi."),
            });
          }}
        />
      </Wrap>
      {undoResult ? (
        <T variant="meta" color="ink2">
          {undoResult}
        </T>
      ) : null}
    </Section>
  );
}

/* ========================================================================================== */
/* NumberRoll / CountWheel                                                                    */
/* ========================================================================================== */

function NumberSection() {
  const t = useTokens();
  const [balance, setBalance] = useState(141);
  const [due, setDue] = useState(5500);
  const [count, setCount] = useState(9);
  return (
    <Section
      title="NumberRoll · CountWheel"
      note="A17: yalnız değişen basamak döner (±18, 400 ms, Easing.out(cubic)); artarken yukarı, azalırken aşağı. İlk boyamada kıpırdamaz. Hareketi azalt açıkken sayı yer değiştirir."
    >
      <Specimen label="Bakiye (balance) + peni" surface>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <NumberRoll value={balance} variant="balance" />
          <T variant="body">peni</T>
        </View>
        <T variant="meta" color="ink2">
          ≈ 4 çay · 1 Türk kahvesi
        </T>
        <Wrap gap={8}>
          <Button size="sm" variant="secondary" title="+6 peni" onPress={() => setBalance((b) => b + 6)} />
          <Button size="sm" variant="secondary" title={`${MINUS}30 peni`} onPress={() => setBalance((b) => Math.max(0, b - 30))} />
          <Button size="sm" variant="secondary" title="+900 peni" onPress={() => setBalance((b) => b + 900)} />
        </Wrap>
      </Specimen>
      <Specimen label='kind="tl" (kuruş): kasada ödenecek'>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <T variant="strong">{cartCopy.dueLabel}</T>
          <NumberRoll kind="tl" value={due} variant="h3" textStyle={{ fontFamily: fonts.sansSemiBold }} />
        </View>
        <Wrap gap={8}>
          <Button size="sm" variant="secondary" title="+ Simit" onPress={() => setDue((d) => d + 2500)} />
          <Button size="sm" variant="secondary" title="+ ₺0,50" onPress={() => setDue((d) => d + 50)} />
          <Button size="sm" variant="secondary" title="Sıfırla" onPress={() => setDue(5500)} />
        </Wrap>
      </Specimen>
      <Specimen label='kind="peni" signed · CountWheel (sayı)'>
        <Wrap gap={16}>
          <NumberRoll value={6} signed variant="strong" color="peniInk" />
          <NumberRoll value={-90} variant="strong" color="ink2" />
          <CountWheel value={count} variant="item" />
          <IconButton variant="secondary" icon={Plus} label="Bir arttır" onPress={() => setCount((c) => c + 1)} />
        </Wrap>
        <T variant="meta" color="ink2">
          9 → 10 ve 99 → 100 geçişlerinde yeni basamak soldan katılır.
        </T>
      </Specimen>
    </Section>
  );
}
