"use client";

import { actionCopy, cartCopy, errorCopy, peniCopy, staffCopy } from "@peni/brand/copy";
import { formatPeni, formatTL } from "@peni/brand/format";
import { HOOK } from "@peni/brand/shapes";
import {
  AlarmClock,
  ArrowRight,
  CalendarPlus,
  ChevronLeft,
  CirclePause,
  CirclePlay,
  Clock,
  Gift,
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Plus,
  QrCode,
  ReceiptText,
  Share2,
  StickyNote,
  Store,
  Timer,
  Undo2,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CoinGlyph } from "@/components/brand/glyphs";
import { applyTheme, readTheme, type ThemePreference } from "@/components/chrome/theme";
import {
  Banner,
  Button,
  Card,
  Chip,
  ChipGroup,
  CodeInput,
  EmptyState,
  Field,
  IconButton,
  Input,
  NumberRoll,
  PhoneInput,
  Row,
  RowGroup,
  Segmented,
  Sheet,
  Skeleton,
  StatusDot,
  Stepper,
  Switch,
  Textarea,
  isPhoneComplete,
  toast,
  toastUndo,
} from "@/components/ui";

/* ========================================================================================== */
/* Page                                                                                       */
/* ========================================================================================== */

const SECTIONS = [
  ["button", "Button"],
  ["icon-button", "IconButton"],
  ["stepper", "Stepper"],
  ["segmented", "Segmented"],
  ["switch", "Switch"],
  ["field", "Field ve girişler"],
  ["chip", "Chip"],
  ["card", "Card"],
  ["row", "Row ve RowGroup"],
  ["banner", "Banner"],
  ["empty", "EmptyState"],
  ["skeleton", "Skeleton"],
  ["sheet", "Sheet"],
  ["toast", "Toast"],
  ["number-roll", "NumberRoll"],
  ["context", "Renkli kaplar"],
] as const;

export function Kit() {
  return (
    <div className="flex flex-col gap-14">
      <KitHeader />
      <ButtonSection />
      <IconButtonSection />
      <StepperSection />
      <SegmentedSection />
      <SwitchSection />
      <FieldSection />
      <ChipSection />
      <CardSection />
      <RowSection />
      <BannerSection />
      <EmptySection />
      <SkeletonSection />
      <SheetSection />
      <ToastSection />
      <NumberRollSection />
      <ContextSection />
      <p className="text-meta text-ink-2">Bu sayfa yalnız geliştirme ortamında, ya da NEXT_PUBLIC_KIT=1 ile görünür.</p>
    </div>
  );
}

function KitHeader() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  useEffect(() => setTheme(readTheme()), []);

  return (
    <header className="flex flex-col gap-6">
      <div className="rule-oxford" />
      <div className="flex flex-col gap-2">
        <p className="legend text-ink-2">İlan · §12.2</p>
        <h1 className="font-display text-h1">Bileşen kiti</h1>
        <p className="max-w-[60ch] text-body-lg text-ink-2">
          Her web bileşeni, her türü ve her durumuyla. Tema sistemden gelir; denemek için aşağıdan değiştir. Klavyeyle
          gezinip odak halkasını, “Hareketi azalt” ayarıyla da sakin hâlleri kontrol et.
        </p>
      </div>
      <div className="flex max-w-sm flex-col gap-2">
        <span className="text-meta text-ink-2">Görünüm</span>
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
            const pref = id as ThemePreference;
            setTheme(pref);
            applyTheme(pref);
          }}
        />
      </div>
      <nav aria-label="Kit bölümleri">
        <ul className="flex flex-wrap gap-x-1 gap-y-0">
          {SECTIONS.map(([id, title]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] px-2 text-meta text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-6">
      <div className="flex flex-col gap-1.5 border-t border-ink pt-3">
        <h2 id={`${id}-title`} className="font-display text-h2">
          {title}
        </h2>
        {note && <p className="max-w-[72ch] text-meta text-ink-2">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** One labelled specimen. `surface` puts it on a raised card (to check contrast on cards). */
function Specimen({
  label,
  children,
  wide = false,
  surface = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  surface?: boolean;
}) {
  return (
    <figure className={wide ? "flex w-full flex-col gap-2" : "flex min-w-0 flex-col gap-2"}>
      <figcaption className="text-meta text-ink-2">{label}</figcaption>
      {surface ? <Card className="min-w-0">{children}</Card> : <div className="min-w-0">{children}</div>}
    </figure>
  );
}

function Grid({ children, cols = "auto" }: { children: ReactNode; cols?: "auto" | "2" }) {
  return (
    <div
      className={
        cols === "2"
          ? "grid grid-cols-1 gap-6 md:grid-cols-2"
          : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] items-start gap-6"
      }
    >
      {children}
    </div>
  );
}

/** The askı legend icon (§6.7), for the staff "ikram" chip. */
function HookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={HOOK} />
    </svg>
  );
}

/* ========================================================================================== */
/* Button                                                                                     */
/* ========================================================================================== */

function ButtonSection() {
  const [sending, setSending] = useState(false);
  const send = () => {
    setSending(true);
    window.setTimeout(() => setSending(false), 2400);
  };
  return (
    <Section
      id="button"
      title="Button"
      note="primary · secondary · quiet · aski · danger-quiet; sm 44 · md 48 · lg 56. Basılınca %97 küçülür (A1); hareket azaltılınca yalnız zemin değişir. Devre dışı hâl opaklık değil: surface-2 üstünde ink-2, ve sebebi altında."
    >
      <Grid>
        <Specimen label='variant="primary"'>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Kod gönder</Button>
            <Button iconEnd={ArrowRight}>Sepeti gör</Button>
          </div>
        </Specimen>
        <Specimen label='variant="secondary"'>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" iconStart={Gift}>
              {actionCopy.gift}
            </Button>
            <Button variant="secondary" iconStart={QrCode}>
              {peniCopy.peniCode}
            </Button>
          </div>
        </Specimen>
        <Specimen label='variant="quiet"'>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="quiet">Numarayı değiştir</Button>
            <Button variant="quiet" iconStart={Gift}>
              Bir çay ısmarla
            </Button>
          </div>
        </Specimen>
        <Specimen label='variant="aski" · variant="secondary" (eşit ağırlık)'>
          <div className="flex gap-3">
            <Button variant="aski" className="flex-1">
              Askıdan al
            </Button>
            <Button variant="secondary" className="flex-1">
              Askıya bırak
            </Button>
          </div>
        </Specimen>
        <Specimen label='variant="danger-quiet"'>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="danger-quiet">İptal et</Button>
            <Button variant="danger-quiet" iconStart={LogOut}>
              {actionCopy.signOut}
            </Button>
          </div>
        </Specimen>
        <Specimen label="size: sm 44 · md 48 · lg 56">
          <div className="flex flex-wrap items-end gap-3">
            <Button size="sm" variant="secondary">
              Şimdi aç
            </Button>
            <Button size="md">Devam</Button>
            <Button size="lg">Kabul et</Button>
          </div>
        </Specimen>
        <Specimen label="loading (tıkla) · LoaderCircle + “Gönderiliyor…”">
          <Button fullWidth loading={sending} onClick={send}>
            {cartCopy.submit(5500)}
          </Button>
        </Specimen>
        <Specimen label="disabled + disabledReason (odaklanabilir)">
          <Button disabled disabledReason="Masa doldu">
            Geliyorum
          </Button>
        </Specimen>
        <Specimen label="disabled, sebepsiz (yerel disabled)">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Askıya ekle</Button>
            <Button variant="secondary" disabled>
              Takvime ekle
            </Button>
            <Button variant="quiet" disabled>
              Kodu tekrar gönder (0:42)
            </Button>
          </div>
        </Specimen>
        <Specimen label="fullWidth + href (Link)">
          <Button href="/" fullWidth variant="secondary" iconEnd={ArrowRight}>
            {actionCopy.backToCafes}
          </Button>
        </Specimen>
        <Specimen label="Kart üstünde" surface>
          <div className="flex flex-col gap-3">
            <Button fullWidth>{cartCopy.submit(5500)}</Button>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" iconStart={CalendarPlus}>
                Takvime ekle
              </Button>
              <Button variant="quiet">Kafeye git</Button>
            </div>
          </div>
        </Specimen>
        <Specimen label="Uzun etiket, 360px (kırılır, kesilmez)">
          <div className="w-[240px] max-w-full">
            <Button fullWidth variant="secondary">
              Kafeye katıl ve ısmarlamayı kabul et
            </Button>
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* IconButton                                                                                 */
/* ========================================================================================== */

function IconButtonSection() {
  const [sound, setSound] = useState(true);
  const [liked, setLiked] = useState(false);
  return (
    <Section id="icon-button" title="IconButton" note="Yuvarlak, en az 44px. label zorunlu (aria-label olur), ikon aria-hidden.">
      <Grid>
        <Specimen label='variant="quiet" (varsayılan)'>
          <div className="flex items-center gap-2">
            <IconButton icon={X} label={actionCopy.close} />
            <IconButton icon={Share2} label="Paylaş" />
            <IconButton icon={QrCode} label={peniCopy.peniCode} />
          </div>
        </Specimen>
        <Specimen label='variant="secondary"'>
          <div className="flex items-center gap-2">
            <IconButton variant="secondary" icon={Plus} label={cartCopy.add("Latte")} />
            <IconButton variant="secondary" icon={UserRound} label="Profil" />
          </div>
        </Specimen>
        <Specimen label="pressed (aria-pressed), size 48 · 56">
          <div className="flex items-center gap-2">
            <IconButton
              variant="secondary"
              size={48}
              icon={<Heart aria-hidden strokeWidth={1.75} className={liked ? "fill-ink" : undefined} />}
              label="Kalp bırak"
              pressed={liked}
              onClick={() => setLiked((v) => !v)}
            />
            <IconButton variant="secondary" size={56} icon={Plus} label={cartCopy.add("Simit")} />
          </div>
        </Specimen>
        <Specimen label="disabled · href (Link)">
          <div className="flex items-center gap-2">
            <IconButton variant="secondary" icon={Plus} label={cartCopy.add("Latte")} disabled />
            <IconButton href="/" icon={ChevronLeft} label={actionCopy.back} />
          </div>
        </Specimen>
        <Specimen label='variant="press" (press header, --focus = on-press)'>
          <div className="flex items-center gap-1 rounded-[10px] bg-press px-2 py-1.5 text-on-press [--focus:var(--on-press)]">
            <IconButton
              variant="press"
              icon={sound ? Volume2 : VolumeX}
              label={sound ? "Ses açık" : "Ses kapalı"}
              pressed={sound}
              onClick={() => setSound((v) => !v)}
            />
            <IconButton variant="press" icon={CirclePause} label="Durdur" />
            <IconButton variant="press" icon={LogOut} label={staffCopy.logout} />
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Stepper                                                                                    */
/* ========================================================================================== */

function StepperSection() {
  const [latte, setLatte] = useState(0);
  const [simit, setSimit] = useState(2);
  const [cay, setCay] = useState(19);
  const [till, setTill] = useState(0);
  const [peni, setPeni] = useState(45);
  return (
    <Section
      id="stepper"
      title="Stepper"
      note="Sabit 116px yuva: − 44 · sayı 28 · + 44. 0'dan 1'e − ve sayı kayarak gelir (A3); dokununca %94 (A2); sayı NumberFlow ile döner ve aria-live ile okunur."
    >
      <Grid>
        <Specimen label="collapsible: 0 iken yalnız “+” (dene)">
          <Stepper itemName="Latte" value={latte} onChange={setLatte} />
        </Specimen>
        <Specimen label="value 2">
          <Stepper itemName="Simit" value={simit} onChange={setSimit} />
        </Specimen>
        <Specimen label="max 20'ye yakın · maxReason">
          <Stepper itemName="Çay" value={cay} onChange={setCay} maxReason="En fazla 20" />
        </Specimen>
        <Specimen label="collapsible={false}, min 0 (kasa askısı)">
          <Stepper itemName="Çay" value={till} onChange={setTill} collapsible={false} />
        </Specimen>
        <Specimen label="peni: step 5, min 1, max 141">
          <Stepper itemName="Peni" value={peni} onChange={setPeni} min={1} max={141} step={5} maxReason="Bakiyen 141" />
        </Specimen>
        <Specimen label="disabled">
          <Stepper itemName="Latte" value={1} onChange={() => {}} disabled />
        </Specimen>
        <Specimen label="MenuRow bağlamında" wide>
          <div>
            <RowGroup>
              <Row title="Latte" meta={<span><span className="tabular-nums">{formatTL(12000)}</span> · <span className="text-ink-2">Çift shot espresso, süt</span></span>} end={<Stepper itemName="Latte" value={latte} onChange={setLatte} />} />
              <Row title="Simit" meta={<span className="tabular-nums">{formatTL(2500)}</span>} end={<Stepper itemName="Simit" value={simit} onChange={setSimit} />} />
              <Row
                title="Poğaça"
                meta={<span className="tabular-nums">{formatTL(3000)}</span>}
                end={
                  <span className="flex w-[116px] justify-end">
                    <Chip kind="tag">{cartCopy.soldOut}</Chip>
                  </span>
                }
              />
            </RowGroup>
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Segmented                                                                                  */
/* ========================================================================================== */

function SegmentedSection() {
  const [cafe, setCafe] = useState("menu");
  const [board, setBoard] = useState("new");
  const [staff, setStaff] = useState("tezgah");
  const [nav, setNav] = useState("button");
  const [look, setLook] = useState("system");
  return (
    <Section
      id="segmented"
      title="Segmented"
      note="48px, role=tablist; sol ve sağ ok, Home, End ile gezilir. Alt çizgi layoutId ile kayar (A15), hareket azaltılınca anında. Etiketler hep 600; yalnız renk değişir, hiçbir şey kaymaz."
    >
      <Grid cols="2">
        <Specimen label='variant="underline" · kafe sayfası'>
          <Segmented
            id="kit-cafe"
            label="Kafe bölümleri"
            items={[
              { id: "menu", label: "Menü" },
              { id: "aski", label: "Askı" },
              { id: "masa", label: "Masa" },
            ]}
            value={cafe}
            onChange={setCafe}
          />
        </Specimen>
        <Specimen label="count · tezgâh (<768)">
          <Segmented
            id="kit-board"
            label="Tezgâh sütunları"
            items={[
              { id: "new", label: "Yeni", count: 2 },
              { id: "accepted", label: "Hazırlanıyor", count: 1 },
              { id: "ready", label: "Hazır", count: 0 },
            ]}
            value={board}
            onChange={setBoard}
          />
        </Specimen>
        <Specimen label="personel bölümleri">
          <Segmented
            id="kit-staff"
            label="Panel bölümleri"
            items={[
              { id: "tezgah", label: staffCopy.sections.tezgah },
              { id: "aski", label: staffCopy.sections.aski },
              { id: "rapor", label: staffCopy.sections.rapor },
            ]}
            value={staff}
            onChange={setStaff}
          />
        </Specimen>
        <Specimen label="href ile nav çapaları (aria-current)">
          <Segmented
            id="kit-nav"
            label="Kit çapaları"
            items={[
              { id: "button", label: "Button", href: "#button" },
              { id: "stepper", label: "Stepper", href: "#stepper" },
              { id: "sheet", label: "Sheet", href: "#sheet" },
            ]}
            value={nav}
            onChange={setNav}
          />
        </Specimen>
        <Specimen label='variant="track" · Profil “Görünüm”'>
          <Segmented
            id="kit-look"
            variant="track"
            label="Görünüm"
            items={[
              { id: "system", label: "Sistem" },
              { id: "light", label: "Açık" },
              { id: "dark", label: "Koyu" },
            ]}
            value={look}
            onChange={setLook}
          />
        </Specimen>
        <Specimen label='variant="track" kart üstünde' surface>
          <Segmented
            id="kit-look-card"
            variant="track"
            label="Görünüm"
            items={[
              { id: "system", label: "Sistem" },
              { id: "light", label: "Açık" },
              { id: "dark", label: "Koyu" },
            ]}
            value={look}
            onChange={setLook}
          />
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Switch                                                                                     */
/* ========================================================================================== */

function SwitchSection() {
  const [named, setNamed] = useState(false);
  const [usePeni, setUsePeni] = useState(true);
  const [visible, setVisible] = useState(true);
  return (
    <Section
      id="switch"
      title="Switch"
      note="Base UI Switch, 52×32 iz, 56px satır; satırın tamamı etiket. Açık iz ink, peni anahtarı (yalnız o) bakır."
    >
      <Grid cols="2">
        <Specimen label="ink · kapalı (varsayılan)" surface>
          <Switch
            checked={named}
            onCheckedChange={setNamed}
            label="Adım askıda görünsün"
            hint="Kapalıyken bağışın adsız görünür."
          />
        </Specimen>
        <Specimen label='tone="peni" · value · hint' surface>
          <Switch
            tone="peni"
            checked={usePeni}
            onCheckedChange={setUsePeni}
            label={cartCopy.usePeni(55)}
            value={`−${formatTL(5500)}`}
            hint={cartCopy.usePeniCap(55)}
          />
        </Specimen>
        <Specimen label="ink · açık" surface>
          <Switch
            checked={visible}
            onCheckedChange={setVisible}
            label="Profilim görünsün"
            hint="Açıkken Peni masasında baş harflerin, cevaplarda adın görünür."
          />
        </Specimen>
        <Specimen label="disabled + disabledReason" surface>
          <div className="flex flex-col divide-y divide-line">
            <Switch checked={false} onCheckedChange={() => {}} disabled disabledReason="Bu kafede bakiyen yok." label={cartCopy.usePeni(0)} tone="peni" />
            <Switch checked onCheckedChange={() => {}} disabled disabledReason="Vardiyayı başlatınca değiştirebilirsin." label="Ses" />
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Field and inputs                                                                           */
/* ========================================================================================== */

function FieldSection() {
  const [name, setName] = useState("Ayşe");
  const [phone, setPhone] = useState("532123");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [note, setNote] = useState("");
  const [gift, setGift] = useState("Afiyet olsun!");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [badCode, setBadCode] = useState("123");

  const phoneError = phoneTouched && !isPhoneComplete(phone) ? errorCopy.phone : undefined;

  return (
    <Section
      id="field"
      title="Field, Input, Textarea, PhoneInput, CodeInput"
      note="Gerçek etiket üstte; id, aria-describedby ve aria-invalid Field'dan gelir. 48px, yarıçap 10, 16px yazı, 1.5px line-strong. Hata CircleAlert + danger, kibar canlı bölgede."
    >
      <Grid cols="2">
        <Specimen label="Input + hint" surface>
          <Field label="Adın" hint="Siparişin hazır olunca bu adla çağrılırsın.">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </Field>
        </Specimen>
        <Specimen label="Input + error" surface>
          <Field label="Personel anahtarı" error={errorCopy.staffKey}>
            <Input type="password" defaultValue="yanlis-anahtar" />
          </Field>
        </Specimen>
        <Specimen label="PhoneInput (+90, maske, yapıştır: +90 532 123 45 67)" surface>
          <Field label="Telefon numaran" error={phoneError}>
            <PhoneInput value={phone} onValueChange={setPhone} onBlur={() => setPhoneTouched(true)} />
          </Field>
        </Specimen>
        <Specimen label="Input disabled · placeholder" surface>
          <div className="flex flex-col gap-4">
            <Field label="Kafe" hint="Ismarlama aynı kafede kalır.">
              <Input disabled value="Moda Kahvesi" readOnly />
            </Field>
            <Field label="Cevabın">
              <Input placeholder="Bir cümle yeter" />
            </Field>
          </div>
        </Specimen>
        <Specimen label="Textarea · 2 satır, içerikle büyür" surface>
          <Field label={cartCopy.noteLabel}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={cartCopy.notePlaceholder} />
          </Field>
        </Specimen>
        <Specimen label="Textarea + counter" surface>
          <Field label="Notun (isteğe bağlı)" counter={{ length: gift.length, max: 140 }}>
            <Textarea value={gift} onChange={(e) => setGift(e.target.value)} maxLength={140} />
          </Field>
        </Specimen>
        <Specimen label="CodeInput · 000000 doğru, başka kod hata verir" surface>
          <div className="flex flex-col gap-3">
            <p className="text-meta text-ink-2">+90 532 123 45 67 numarasına bir kod gönderdik.</p>
            <Field label="SMS ile gelen kod" error={codeError}>
              <CodeInput
                value={code}
                onValueChange={(v) => {
                  setCode(v);
                  setCodeError(null);
                }}
                onComplete={(v) => {
                  if (v === "000000") toast.success("Giriş yapıldı.");
                  else setCodeError(errorCopy.code);
                }}
              />
            </Field>
            <Button variant="quiet" disabled className="self-start">
              Kodu tekrar gönder (0:42)
            </Button>
          </div>
        </Specimen>
        <Specimen label="CodeInput · invalid · disabled" surface>
          <div className="flex flex-col gap-5">
            <Field label="SMS ile gelen kod" error={errorCopy.codeLocked}>
              <CodeInput value={badCode} onValueChange={setBadCode} />
            </Field>
            <Field label="SMS ile gelen kod" hint="Yeni kod isteyince açılır.">
              <CodeInput value="" disabled />
            </Field>
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Chip                                                                                       */
/* ========================================================================================== */

function ChipSection() {
  const [pick, setPick] = useState("cay");
  return (
    <Section
      id="chip"
      title="Chip"
      note="choice 44px, yarıçap 10, seçili = 2px ink çerçeve + surface; devre dışı sebebi etiketin altında. status 24px, yarıçap 4, 13px 600, her zaman ikon + kelime. tag: legend."
    >
      <Grid cols="2">
        <Specimen label='kind="choice" · seçili, devre dışı + sebep' surface>
          <ChipGroup label="Ne bırakıyorsun?">
            <Chip kind="choice" selected={pick === "cay"} onClick={() => setPick("cay")}>
              1 çay · 30 peni
            </Chip>
            <Chip kind="choice" selected={pick === "filtre"} onClick={() => setPick("filtre")}>
              1 filtre kahve · 85 peni
            </Chip>
            <Chip kind="choice" disabledReason="Bakiyen 25">
              1 Türk kahvesi · 90 peni
            </Chip>
            <Chip kind="choice" selected={pick === "other"} onClick={() => setPick("other")}>
              Başka
            </Chip>
          </ChipGroup>
        </Specimen>
        <Specimen label='kind="choice" · href (Link) · ikon'>
          <ChipGroup label="Yeniden sipariş">
            <Chip kind="choice" href="/k/moda?sepet=latte:1,simit:1">
              Her zamanki: Latte + Simit
            </Chip>
            <Chip kind="choice" icon={MapPin} selected>
              Moda Kahvesi
            </Chip>
          </ChipGroup>
        </Specimen>
        <Specimen label='kind="status" · sipariş durumları'>
          <div className="flex flex-wrap gap-2">
            <Chip tone="success">Teslim edildi</Chip>
            <Chip tone="neutral" icon={Undo2}>
              Kafe yetişemedi
            </Chip>
            <Chip tone="neutral">İptal edildi</Chip>
            <Chip tone="warning">Teslim alınmadı</Chip>
          </div>
        </Specimen>
        <Specimen label='kind="status" · ısmarlama ve kafe'>
          <div className="flex flex-wrap gap-2">
            <Chip tone="warning" icon={Clock}>
              bekliyor
            </Chip>
            <Chip tone="success">kabul edildi</Chip>
            <Chip tone="neutral" icon={Undo2}>
              sana döndü
            </Chip>
            <Chip tone="neutral" icon={<StatusDot tone="success" />}>
              Sipariş alıyor
            </Chip>
            <Chip tone="warning" icon={CirclePause}>
              Şu an sipariş almıyor
            </Chip>
          </div>
        </Specimen>
        <Specimen label='kind="status" · tezgâh süreleri ve ikram'>
          <div className="flex flex-wrap gap-2">
            <Chip tone="neutral" icon={Clock}>
              3 dk
            </Chip>
            <Chip tone="warning" icon={Timer}>
              7 dk
            </Chip>
            <Chip tone="danger" icon={AlarmClock}>
              12 dk · gecikiyor
            </Chip>
            <Chip tone="neutral" icon={HookGlyph}>
              ikram
            </Chip>
          </div>
        </Specimen>
        <Specimen label='kind="status" · peni, askı, masa, danger'>
          <div className="flex flex-wrap gap-2">
            <Chip tone="peni" icon={CoinGlyph}>
              Sende {formatPeni(90)}
            </Chip>
            <Chip tone="aski" icon={HookGlyph}>
              Askıda 7 çay
            </Chip>
            <Chip tone="masa">Per 19:00 · Peni masası</Chip>
            <Chip tone="danger">Gönderilemedi</Chip>
          </div>
        </Specimen>
        <Specimen label='kind="tag"'>
          <div className="flex flex-wrap gap-2">
            <Chip kind="tag">{cartCopy.soldOut}</Chip>
            <Chip kind="tag">Geçti</Chip>
            <Chip kind="tag" tone="masa">
              Peni masası
            </Chip>
            <Chip kind="tag" tone="aski">
              Askıda kahve
            </Chip>
            <Chip kind="tag" tone="peni">
              Jeton kesesi
            </Chip>
            <Chip kind="tag" tone="success">
              Hazır
            </Chip>
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Card                                                                                       */
/* ========================================================================================== */

function CardSection() {
  return (
    <Section id="card" title="Card" note="raised = surface + shadow-raised, yarıçap 14. Tonlar düz: gölge yok, çerçeve yok. Kart kart içine girmez.">
      <Grid>
        <Specimen label='tone="raised"'>
          <Card>
            <p className="legend text-ink-2">Kadıköy · İstanbul</p>
            <h3 className="mt-1 font-display text-h3">Moda Kahvesi</h3>
            <p className="mt-2 text-body text-ink-2">Her harcamada %5 peni · 1 peni = ₺1, yalnız bu kafede</p>
          </Card>
        </Specimen>
        <Specimen label='tone="aski"'>
          <Card tone="aski">
            <p className="legend text-aski-ink">Askıda kahve</p>
            <p className="mt-2 text-item">Askıda 7 çay bekliyor</p>
            <p className="mt-1 text-meta text-ink-2">İsteyen alır, günde bir tane.</p>
          </Card>
        </Specimen>
        <Specimen label='tone="masa"'>
          <Card tone="masa">
            <p className="legend text-masa-ink">Günün sorusu</p>
            <p className="mt-2 font-display text-question italic">Bu hafta hangi kitabı okuyorsun?</p>
          </Card>
        </Specimen>
        <Specimen label='tone="peni"'>
          <Card tone="peni" className="flex items-center gap-2">
            <CoinGlyph className="size-4 text-peni-ink" />
            <p className="text-body">
              Kasada ödeyince <strong className="font-semibold text-peni-ink">+2 peni</strong> kazanırsın
            </p>
          </Card>
        </Specimen>
        <Specimen label='tone="warning"'>
          <Card tone="warning" className="flex items-start gap-2">
            <StickyNote aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0 text-warning-ink" />
            <p className="text-body">Not: az şekerli, yulaf sütlü</p>
          </Card>
        </Specimen>
        <Specimen label='padding="none" · as="article"'>
          <Card as="article" padding="none" className="overflow-hidden">
            <div className="aspect-[16/7] shadow-[0_0_0_1px_var(--plate-ring)]" style={{ background: "var(--hue-murekkep)" }} />
            <div className="p-4">
              <h3 className="font-display text-h3">Kuzguncuk Fırını</h3>
            </div>
          </Card>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Row, RowGroup                                                                              */
/* ========================================================================================== */

function RowSection() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Section
      id="row"
      title="Row ve RowGroup"
      note="En az 56px, 12 × 16 dolgu, line ayraçlar. Satırlar küçülmez; basınca zemin surface-2 olur. Odak halkası içeride, çünkü kart köşeleri keser."
    >
      <Grid cols="2">
        <Specimen label="RowGroup + title · href / onClick / statik">
          <RowGroup title="Hesap">
            <Row href="/masa-kurallari" title="Masa kuralları" />
            <Row
              onClick={() => toast("Peni kodum açılırdı.")}
              start={<QrCode aria-hidden size={24} strokeWidth={1.75} className="size-6 text-ink-2" />}
              title={peniCopy.peniCode}
              meta="Kasada göster, peni kazan."
            />
            <Row title="Kasada ödenecek" end={<span className="font-semibold tabular-nums">{formatTL(5500)}</span>} />
            <Row
              start={<LogOut aria-hidden size={24} strokeWidth={1.75} className="size-6 text-danger" />}
              onClick={() => toast("Çıkış yapılırdı.")}
              title={<span className="text-danger">{actionCopy.signOut}</span>}
            />
          </RowGroup>
        </Specimen>
        <Specimen label="Seçim satırları (ısmarlama adım 1)">
          <RowGroup>
            {[
              ["moda", "Moda Kahvesi", 90],
              ["kuzguncuk", "Kuzguncuk Fırını", 141],
            ].map(([id, name, peni]) => (
              <Row
                key={id as string}
                onClick={() => setPicked(id as string)}
                start={<CoinGlyph className="size-7 text-peni-ink" />}
                title={name}
                end={<span className="text-meta text-ink-2 tabular-nums">{formatPeni(peni as number)}</span>}
                arrow
                aria-label={`${name}, ${formatPeni(peni as number)}`}
              />
            ))}
            <Row disabled onClick={() => {}} title="Bebek Kahvecisi" meta="Bakiyen yok" />
          </RowGroup>
          <p className="mt-2 text-meta text-ink-2" aria-live="polite">
            {picked ? `Seçilen: ${picked}` : "Bir kafe seç."}
          </p>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Banner                                                                                     */
/* ========================================================================================== */

function BannerSection() {
  return (
    <Section id="banner" title="Banner" note="Yarıçap 10, dolgu 12, ikon + kelime. role=status; danger role=alert ve her zaman CircleAlert.">
      <div className="flex max-w-[640px] flex-col gap-3">
        <Banner tone="warning" icon={CirclePause} title="Kafe şu an uygulamadan sipariş almıyor. Kasaya uğrayabilirsin." />
        <Banner
          tone="warning"
          icon={CirclePause}
          title="Uygulama siparişleri durdu · 12 dk kaldı"
          action={
            <Button size="sm" iconStart={CirclePlay}>
              Şimdi aç
            </Button>
          }
        />
        <Banner
          tone="warning"
          icon={VolumeX}
          title="Ses kapalı. Yeni siparişleri duymayabilirsin."
          action={
            <Button size="sm" variant="secondary">
              Sesi aç
            </Button>
          }
        />
        <Banner
          tone="danger"
          title={errorCopy.cafesLoad}
          action={
            <Button size="sm" variant="secondary">
              {errorCopy.retry}
            </Button>
          }
        />
        <Banner tone="info" title="Simit şu an tükendi; sepetine eklemedik." />
        <Banner
          tone="aski"
          title="Askıdan almak için kafeye katıl."
          action={
            <Button size="sm" variant="secondary">
              {actionCopy.join}
            </Button>
          }
        >
          Üyelik ücretsiz.
        </Banner>
      </div>
    </Section>
  );
}

/* ========================================================================================== */
/* EmptyState, Skeleton                                                                       */
/* ========================================================================================== */

function EmptySection() {
  return (
    <Section id="empty" title="EmptyState" note="64px surface-2 disk, 32px ikon (çizgi 1.5, ink-2), tek cümle, en çok bir secondary düğme.">
      <Grid cols="2">
        <Specimen label="action ile" surface>
          <EmptyState icon={ReceiptText} text="Henüz siparişin yok. Bir kafe seç, ilk siparişini ver." action={{ label: actionCopy.browseCafes, href: "/" }} />
        </Specimen>
        <Specimen label="action'sız" surface>
          <EmptyState icon={Store} text="Yakında burada mahallenin kafeleri olacak." />
        </Specimen>
        <Specimen label="Masa boş" wide>
          <EmptyState icon={MessageCircle} text="Masa bugün sakin. Kafe yeni bir soru sorunca burada görürsün." />
        </Specimen>
      </Grid>
    </Section>
  );
}

function SkeletonSection() {
  return (
    <Section id="skeleton" title="Skeleton" note="Durağan surface-2, gerçek ölçü ve yarıçap; parıltı yok. aria-hidden; kapsayan bölgede aria-busy.">
      <Grid>
        <Specimen label="Kafe kartı (kapak 16/7, sonra 16 · 22 · 16px)">
          <div aria-busy="true" aria-label="Kafeler yükleniyor" className="overflow-hidden rounded-[14px] bg-surface shadow-raised">
            <Skeleton radius={0} className="aspect-[16/7] w-full" />
            <div className="flex flex-col gap-2.5 p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-[22px] w-44" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
        </Specimen>
        <Specimen label="Menü satırları">
          <div aria-busy="true" className="divide-y divide-line overflow-hidden rounded-[14px] bg-surface shadow-raised">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex min-h-[72px] items-center gap-3 px-4 py-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-[17px] w-24" />
                  <Skeleton className="h-[13px] w-40" />
                </div>
                <Skeleton radius="full" className="size-11" />
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen label="Bakiye ve düğme">
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton radius={10} className="h-12 w-full" />
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Sheet                                                                                      */
/* ========================================================================================== */

function SheetSection() {
  const [open, setOpen] = useState<null | "join" | "cart" | "gift" | "cancel" | "code">(null);
  const [step, setStep] = useState(1);
  const [usePeni, setUsePeni] = useState(true);
  const [note, setNote] = useState("");
  const [latte, setLatte] = useState(1);
  const [simit, setSimit] = useState(1);
  const close = () => setOpen(null);
  const set = (key: typeof open) => (next: boolean) => setOpen(next ? key : null);

  return (
    <Section
      id="sheet"
      title="Sheet"
      note="768px altı Base UI Drawer (içerik yüksekliği, en çok 88dvh, 36×4 tutamak, aşağı kaydırınca kapanır), üstü Base UI Dialog (480px). Escape, arka plan ve “Kapat” kapatır. Pencereyi daraltıp genişleterek ikisini de dene."
    >
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setOpen("join")}>
          Katılma (kısa, footer)
        </Button>
        <Button variant="secondary" onClick={() => setOpen("cart")}>
          Sepet (uzun, kaydırmalı)
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setStep(1);
            setOpen("gift");
          }}
        >
          Ismarla (adımlı, geri)
        </Button>
        <Button variant="secondary" onClick={() => setOpen("cancel")}>
          İptal onayı
        </Button>
        <Button variant="secondary" iconStart={QrCode} onClick={() => setOpen("code")}>
          Peni kodum (telefonda tam ekran)
        </Button>
      </div>

      <Sheet
        open={open === "join"}
        onOpenChange={set("join")}
        title={actionCopy.join}
        footer={
          <div className="flex flex-col gap-2">
            <Button fullWidth onClick={close}>
              {actionCopy.joinAndAdd}
            </Button>
            <Button fullWidth variant="quiet" onClick={close}>
              {actionCopy.cancel}
            </Button>
          </div>
        }
      >
        <p className="text-body-lg">Moda Kahvesi üyesi olunca sipariş verir, her harcamada peni biriktirirsin. Üyelik ücretsiz.</p>
      </Sheet>

      <Sheet
        open={open === "cart"}
        onOpenChange={set("cart")}
        title={cartCopy.title}
        footer={
          <Button fullWidth onClick={close}>
            {cartCopy.submit(5500)}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="divide-y divide-line">
            <CartLine name="Latte" price={12000} qty={latte} setQty={setLatte} />
            <CartLine name="Simit" price={2500} qty={simit} setQty={setSimit} />
            <div className="flex min-h-14 items-center justify-between gap-3 py-2 text-body">
              <span>
                <span className="text-ink-2">İkram</span> Çay
              </span>
              <span className="tabular-nums">−{formatTL(3000)}</span>
            </div>
          </div>
          <Switch
            tone="peni"
            checked={usePeni}
            onCheckedChange={setUsePeni}
            label={cartCopy.usePeni(55)}
            value={`−${formatTL(5500)}`}
            hint={cartCopy.usePeniCap(55)}
          />
          <Field label={cartCopy.noteLabel}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={cartCopy.notePlaceholder} />
          </Field>
          <Card tone="peni" className="flex items-start gap-2">
            <CoinGlyph className="mt-0.5 size-4 shrink-0 text-peni-ink" />
            <div>
              <p className="text-body">
                Kasada ödeyince <strong className="font-semibold text-peni-ink">+2 peni</strong> kazanırsın
              </p>
              {usePeni && <p className="text-meta text-ink-2">{cartCopy.earnPreviewNote}</p>}
            </div>
          </Card>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body">{cartCopy.dueLabel}</span>
            <span className="font-sans text-h3 tabular-nums">
              <NumberRoll kind="tl" value={usePeni ? 5500 : 11000} />
            </span>
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <p key={i} className="text-meta text-ink-2">
              Kaydırma denemesi için dolgu satırı {i + 1}. Sepet uzadığında gövde kayar; başlık ve alt düğme yerinde kalır.
            </p>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={open === "gift"}
        onOpenChange={set("gift")}
        onOpenChangeComplete={(o) => !o && setStep(1)}
        eyebrow={`Adım ${step}/3`}
        title={step === 1 ? "Hangi kafede?" : step === 2 ? "Kime ısmarlıyorsun?" : "Ne ısmarlıyorsun?"}
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
        footer={
          step === 3 ? (
            <Button fullWidth onClick={close}>
              Ismarla · 30 peni
            </Button>
          ) : undefined
        }
      >
        {step === 1 && (
          <RowGroup flat className="-mx-4 md:-mx-6">
            <Row onClick={() => setStep(2)} title="Moda Kahvesi · 90 peni" arrow />
            <Row onClick={() => setStep(2)} title="Kuzguncuk Fırını · 141 peni" arrow />
          </RowGroup>
        )}
        {step === 2 && <GiftStepTwo onNext={() => setStep(3)} />}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <ChipGroup label="Ne ısmarlıyorsun?">
              <Chip kind="choice" selected>
                1 çay · 30 peni
              </Chip>
              <Chip kind="choice" disabledReason="Bakiyen 25">
                1 Türk kahvesi · 90 peni
              </Chip>
            </ChipGroup>
            <p className="text-meta text-ink-2">Günde en fazla 200 peni ısmarlayabilirsin.</p>
            <p className="text-meta text-ink-2">Kabul edilmezse peni 24 saat içinde sana döner.</p>
          </div>
        )}
      </Sheet>

      <Sheet
        open={open === "cancel"}
        onOpenChange={set("cancel")}
        title="Siparişi iptal edelim mi?"
        description="Barista henüz başlamadı; iptal edersen kullandığın peni cüzdanına döner."
      >
        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
          <Button fullWidth onClick={close}>
            {actionCopy.cancel}
          </Button>
          <Button fullWidth variant="danger-quiet" onClick={close}>
            İptal et
          </Button>
        </div>
      </Sheet>

      <Sheet open={open === "code"} onOpenChange={set("code")} title={peniCopy.peniCode} fullScreenOnPhone>
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div aria-hidden className="grid size-60 place-items-center rounded-[14px] bg-surface-2 text-meta text-ink-2">
            QR alanı (240px)
          </div>
          <p className="font-display text-[40px] leading-none font-semibold tracking-[.08em] tabular-nums lining-nums">M7K-42Q</p>
          <p className="text-body-lg text-ink-2">{peniCopy.peniCodeBody}</p>
          <Button variant="secondary" onClick={close}>
            {actionCopy.close}
          </Button>
        </div>
      </Sheet>
    </Section>
  );
}

function CartLine({ name, price, qty, setQty }: { name: string; price: number; qty: number; setQty: (n: number) => void }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-body">{cartCopy.line(Math.max(qty, 1), name)}</p>
        <p className="text-meta text-ink-2 tabular-nums">{formatTL(price * Math.max(qty, 1))}</p>
      </div>
      <Stepper itemName={name} value={qty} onChange={setQty} collapsible={false} min={1} />
    </div>
  );
}

function GiftStepTwo({ onNext }: { onNext: () => void }) {
  const [phone, setPhone] = useState("");
  const ok = isPhoneComplete(phone);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Telefon numarası" hint="Bu kafenin üyesi olmalı.">
        <PhoneInput value={phone} onValueChange={setPhone} />
      </Field>
      {ok && (
        <div className="flex items-center justify-between gap-3 border-y border-line py-3">
          <p className="text-body">Mehmet K. · bu kafenin üyesi</p>
          <Button size="sm" onClick={onNext}>
            {actionCopy.continue}
          </Button>
        </div>
      )}
      {!ok && (
        <Button variant="quiet" className="self-start" onClick={onNext}>
          Numarayı atla (kit)
        </Button>
      )}
    </div>
  );
}

/* ========================================================================================== */
/* Toast                                                                                      */
/* ========================================================================================== */

function ToastSection() {
  const [last, setLast] = useState("Henüz bir şey olmadı.");
  return (
    <Section
      id="toast"
      title="Toast"
      note="sonner, üst orta, bir tane görünür, 4 sn (geri al: 5 sn). Yalnız ekranın zaten göstermediği eşzamansız sonuçlar için; sipariş gönderince asla."
    >
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => toast("1 çay askıya asıldı.", { description: "Kafe de 15 peni ekledi." })}>
          Bilgi + açıklama
        </Button>
        <Button variant="secondary" onClick={() => toast.success("Askıya 2 çay eklendi.")}>
          Başarı
        </Button>
        <Button variant="secondary" onClick={() => toast.error(errorCopy.change)}>
          Hata
        </Button>
        <Button variant="secondary" onClick={() => toast("Bağlantı kopyalandı.")}>
          Kısa
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toastUndo("P-004 · Hazır", {
              onUndo: () => setLast("Geri alındı; hiçbir şey gönderilmedi."),
              onCommit: () => setLast("Kaydedildi (istek şimdi giderdi)."),
            })
          }
        >
          Geri al (5 sn)
        </Button>
      </div>
      <p className="text-meta text-ink-2" aria-live="polite">
        Son geri al sonucu: {last}
      </p>
    </Section>
  );
}

/* ========================================================================================== */
/* NumberRoll                                                                                 */
/* ========================================================================================== */

function NumberRollSection() {
  const [peni, setPeni] = useState(90);
  const [due, setDue] = useState(5500);
  return (
    <Section
      id="number-roll"
      title="NumberRoll"
      note="@number-flow/react, tr-TR. tl değeri kuruş alır (formatTL gibi). Eksiler gerçek eksi işaretiyle (−). Hareket azaltılınca rakam yalnız değişir."
    >
      <Grid>
        <Specimen label='kind="peni" · bakiye (Brygada, lining tabular)'>
          <div className="flex flex-col gap-3">
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-balance lining-nums">
                <NumberRoll value={peni} />
              </span>
              <span className="text-body">peni</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPeni((p) => p + 6)}>
                +6 peni
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setPeni((p) => Math.max(0, p - 30))}>
                −30 peni
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setPeni((p) => p + 1200)}>
                +1.200
              </Button>
            </div>
          </div>
        </Specimen>
        <Specimen label='kind="tl" · toplam (Archivo h3, tabular)'>
          <div className="flex flex-col gap-3">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-body">{cartCopy.dueLabel}</span>
              <span className="font-sans text-h3 tabular-nums">
                <NumberRoll kind="tl" value={due} />
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDue((d) => d + 3050)}>
                +₺30,50
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDue((d) => Math.max(0, d - 2500))}>
                −₺25
              </Button>
            </div>
          </div>
        </Specimen>
        <Specimen label="signed · negatif">
          <div className="flex flex-col gap-2 text-item">
            <span className="text-peni-ink">
              <NumberRoll value={2} signed /> peni
            </span>
            <span className="text-ink-2">
              <NumberRoll kind="tl" value={-9000} />
            </span>
            <span>
              <NumberRoll kind="tl" value={3050} />
            </span>
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

/* ========================================================================================== */
/* Coloured containers: --focus and token overrides (D2)                                      */
/* ========================================================================================== */

function ContextSection() {
  return (
    <Section
      id="context"
      title="Renkli kaplar"
      note="Her renkli kap --focus'u kendi üst rengine çeker (D2). Tab ile gezip odak halkasının hem basın başlığında hem Hazır fişinde göründüğünü kontrol et."
    >
      <Grid cols="2">
        <Specimen label="Basın başlığı (press, iki temada da koyu)">
          <div className="flex h-14 items-center gap-2 rounded-[10px] bg-press px-3 text-on-press [--focus:var(--on-press)]">
            <p className="min-w-0 flex-1 truncate text-item">Moda Kahvesi</p>
            <span className="text-body text-on-press-2 tabular-nums">14:02</span>
            <IconButton variant="press" icon={Volume2} label="Ses açık" pressed />
            <IconButton variant="press" icon={LogOut} label={staffCopy.logout} />
          </div>
        </Specimen>
        <Specimen label="Hazır fişi (.fis[data-tone=ready])">
          <div className="fis-shadow">
            <div className="fis" data-tone="ready">
              <p className="plate text-ink-2">Moda Kahvesi · Sipariş</p>
              <p className="mt-2 font-display text-h3">Hazır!</p>
              <p className="mt-1 text-body">Kasada P-003 kodunu söyle, ₺55 öde.</p>
              <p className="mt-3 text-meta">
                <a href="#context" className="inline-flex min-h-11 items-center underline underline-offset-4">
                  Odak halkası burada on-success
                </a>
              </p>
            </div>
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}
