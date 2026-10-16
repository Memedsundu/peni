/**
 * `askiya-birak` sheet (design-system.md §9.3 "Give sheet", §10.2, A8, G12): formSheet,
 * detents [0.75, 1]. Opened with `?kafe=<slug>` (members only; non-members join first).
 *
 * - "Askıya bırak", the balance, then "Ne bırakıyorsun?": one column of full-width choice
 *   chips, one per askı item ("1 çay · 30 peni"), disabled with "Bakiyen 25" when the balance
 *   can't cover it, and "Başka" last, which reveals a peni stepper (step 5, min 1, max the
 *   balance).
 * - With a café match [G12]: "Kafe her bağışa %50 ekliyor."
 * - "Adım askıda görünsün", off by default, hint "Kapalıyken bağışın adsız görünür."
 * - Primary (ink): "1 çay bırak · 30 peni" / "45 peni bırak".
 * - On success the sheet closes; the café screen hangs the new cup on its own rail (A8, with
 *   the `success` haptic) and shows "1 çay askıya asıldı." (+ "Kafe de 15 peni ekledi.").
 *   Errors stay inline, above the button; a retry of the same choice re-uses its key.
 */
import { newIdempotencyKey, type MenuItemDTO } from "@peni/api";
import { askiCopy, peniCopy } from "@peni/brand/copy";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { View } from "react-native";
import { Coin, CoinGlyph, DeviceGlyph, SimitGlyph } from "@/components/brand";
import { askiItems, itemPeni, referenceItem } from "@/components/cafe/aski-model";
import { loadCafe, messageOf, pushDonation, useCafeEntry } from "@/components/cafe/cafe-store";
import { InlineError, SheetFrame } from "@/components/cafe/sheet";
import { Button, Chip, ChipGroup, Skeleton, Stepper, SwitchRow, T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { radius, useTokens } from "@/lib/theme";

const OTHER = "other";
const STEP = 5;

/** A full-width option in the "Ne bırakıyorsun?" column. */
const OPTION = { alignSelf: "stretch" } as const;

/** With nothing to leave: why the button rests. */
const NO_BALANCE = "Penin biriktikçe sen de askıya bırakabilirsin.";

function itemGlyph(name: string, color: string): ReactElement {
  const n = name.toLocaleLowerCase("tr");
  if (n.includes("simit")) return <SimitGlyph size={20} color={color} />;
  return <DeviceGlyph kind={n.includes("çay") ? "glass" : "fincan"} size={20} color={color} />;
}

export default function AskiyaBirakSheet() {
  const t = useTokens();
  const { kafe } = useLocalSearchParams<{ kafe?: string }>();
  const slug = kafe ?? "";
  const { api } = useSession();
  const { cafe } = useCafeEntry(slug);

  // A fresh read on open (the pool, eligibility, pause); what's in memory shows meanwhile.
  useEffect(() => {
    if (slug) void loadCafe(api, slug);
  }, [api, slug]);

  const balance = Math.max(0, Math.floor(cafe?.membership?.balancePeni ?? 0));
  const items = cafe ? askiItems(cafe) : [];
  const reference = cafe ? referenceItem(cafe) : null;
  const affordable = (item: MenuItemDTO) => itemPeni(item) <= balance;

  /* The choice: the reference item when it fits, else the first that does, else "Başka". */
  const [choice, setChoice] = useState<string | null>(null);
  const fallbackChoice =
    (reference && affordable(reference) ? reference.productId : null) ?? items.find(affordable)?.productId ?? (balance >= 1 ? OTHER : null);
  const picked = choice ?? fallbackChoice;
  const [custom, setCustom] = useState<number | null>(null);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = picked && picked !== OTHER ? (items.find((i) => i.productId === picked && affordable(i)) ?? null) : null;
  const isOther = picked === OTHER && balance >= 1;
  const customPeni = Math.min(balance, Math.max(1, custom ?? Math.min(balance, 2 * STEP)));
  const amount = item ? itemPeni(item) : isOther ? customPeni : 0;

  /* Custom amount: steps of 5 from 1 (1 → 5 → 10 …), never past the balance. */
  const stepCustom = (next: number) => {
    const up = next > customPeni;
    setCustom(up ? Math.min(balance, Math.floor(customPeni / STEP) * STEP + STEP) : Math.max(1, Math.ceil(customPeni / STEP) * STEP - STEP));
    setError(null);
  };

  /* One idempotency key per (amount, name) attempt. */
  const key = useRef<{ sig: string; key: string } | null>(null);

  const submit = async () => {
    if (!cafe || busy || amount < 1) return;
    const sig = `${amount}:${showName}`;
    if (!key.current || key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    setError(null);
    try {
      const r = await api.askida.donate({ cafeSlug: slug, peni: amount, showName, idempotencyKey: key.current.key });
      key.current = null;
      // The screen plays A8 (and its success haptic) once this sheet has gone.
      pushDonation(slug, { peni: amount, matchedPeni: Math.max(0, r.matchedPeni), item });
      if (router.canGoBack()) router.back();
    } catch (e) {
      haptic("error");
      setError(messageOf(e));
      setBusy(false);
    }
  };

  if (!cafe) {
    return (
      <SheetFrame title={askiCopy.giveSheet.title} mode="scroll">
        <Skeleton width="60%" line="button" />
        <Skeleton height={44} radius={10} style={{ marginTop: 8 }} />
        <Skeleton height={44} radius={10} style={{ marginTop: 8 }} />
      </SheetFrame>
    );
  }

  const label = item ? askiCopy.giveSheet.submitItem(item.name, itemPeni(item)) : isOther ? askiCopy.giveSheet.submitCustom(customPeni) : askiCopy.give;
  const match = cafe.askida.matchPercent;

  return (
    <SheetFrame
      title={askiCopy.giveSheet.title}
      mode="scroll"
      description={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessible accessibilityLabel={`Sende ${balance} peni`}>
          <Coin size={16} cafe={cafe} />
          <T variant="body" color="ink2">
            {peniCopy.balance(balance).before}
            <T variant="strong" color="peniInk" tabular>
              {peniCopy.balance(balance).amount}
            </T>
          </T>
        </View>
      }
      footer={
        <View style={{ gap: 12 }}>
          <InlineError message={error} />
          <Button
            size="lg"
            fullWidth
            title={label}
            loading={busy}
            disabled={amount < 1}
            disabledReason={amount < 1 ? NO_BALANCE : undefined}
            onPress={() => void submit()}
          />
        </View>
      }
    >
      <View style={{ gap: 10 }}>
        <T variant="button" aria-hidden>
          {askiCopy.giveSheet.what}
        </T>
        {/* One calm column of choices, "Başka" last. */}
        <ChipGroup label={askiCopy.giveSheet.what} style={{ flexDirection: "column", flexWrap: "nowrap" }}>
          {items.map((it) => {
            const reason = affordable(it) ? undefined : askiCopy.giveSheet.balance(balance);
            return (
              <Chip
                key={it.productId}
                kind="choice"
                icon={itemGlyph(it.name, reason ? t.ink2 : t.ink)}
                selected={picked === it.productId}
                disabledReason={reason}
                onPress={() => {
                  setChoice(it.productId);
                  setError(null);
                }}
                style={OPTION}
              >
                {askiCopy.giveSheet.chip(it.name, itemPeni(it))}
              </Chip>
            );
          })}
          <Chip
            kind="choice"
            // A peni amount of your own: the coin glyph keeps the labels in one column.
            icon={<CoinGlyph size={20} color={balance >= 1 ? t.ink : t.ink2} />}
            selected={isOther}
            disabledReason={balance >= 1 ? undefined : askiCopy.giveSheet.balance(balance)}
            onPress={() => {
              setChoice(OTHER);
              setError(null);
            }}
            style={OPTION}
          >
            {askiCopy.giveSheet.other}
          </Chip>
        </ChipGroup>
      </View>

      {isOther ? (
        <View
          style={{
            marginTop: 16,
            minHeight: 56,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            borderRadius: radius.control,
            backgroundColor: t.surface2,
            paddingVertical: 6,
            paddingLeft: 16,
            paddingRight: 6,
          }}
        >
          <T variant="body" aria-hidden>
            {askiCopy.giveSheet.stepperLabel}
          </T>
          <Stepper
            value={customPeni}
            onChange={stepCustom}
            min={1}
            max={balance}
            step={STEP}
            collapsible={false}
            itemName={askiCopy.giveSheet.stepperLabel}
            maxReason={askiCopy.giveSheet.balance(balance)}
          />
        </View>
      ) : null}

      {match != null && match > 0 ? (
        <T variant="meta" color="ink2" style={{ marginTop: 16 }}>
          {askiCopy.giveSheet.match(match)}
        </T>
      ) : null}

      <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: t.line }}>
        <SwitchRow
          checked={showName}
          onCheckedChange={(v) => {
            setShowName(v);
            setError(null);
          }}
          label={askiCopy.giveSheet.nameSwitch}
          hint={askiCopy.giveSheet.nameHint}
        />
      </View>
    </SheetFrame>
  );
}
