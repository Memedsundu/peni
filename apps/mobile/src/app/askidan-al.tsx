/**
 * `askidan-al` sheet (design-system.md §9.3 "Take sheet", §10.2, A9, D7, G3, §17):
 * formSheet, fitToContents. Opened with `?kafe=<slug>`.
 *
 * - Eligible: title "Askıdan bir ikram", the mini rail (md, 6 slots), "Hangisi?" chips for the
 *   café's askı items (the ones the pool can't cover are disabled: "Askıda yeterli peni yok"),
 *   "Siparişine eklenir, kasada ₺0 görünür. Adın kimseye görünmez." and "Siparişime ekle".
 *   On confirm the rightmost item lifts off its hook (A9, only here, only for the taker), then
 *   the item joins the cart as the ikram line (`useCart`) and the sheet closes. The real claim
 *   happens when the order is sent.
 * - Every other state [G3] replaces the chips and the primary with one sentence.
 *
 * Dignity: no question, no counter, no thanks. Nothing about the taker is shown to anyone.
 */
import { actionCopy, askiCopy, askiCaption, cartCopy } from "@peni/brand/copy";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarClock, Check, CirclePause, Info, Users } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { View } from "react-native";
import { AskiRail, askiRailProps, DeviceGlyph, HookGlyph, SimitGlyph } from "@/components/brand";
import {
  askiItems,
  itemPeni,
  orderingBlocked,
  referenceItem,
  takeState,
  takeStateText,
  type TakeState,
} from "@/components/cafe/aski-model";
import { loadCafe, useCafeEntry } from "@/components/cafe/cafe-store";
import { SheetFrame, StateNote } from "@/components/cafe/sheet";
import { Button, Chip, ChipGroup, Skeleton, T, type IconProp } from "@/components/ui";
import { useCart } from "@/lib/cart";
import { useSession } from "@/lib/session";
import { radius, useTokens, type Tokens } from "@/lib/theme";

const q = encodeURIComponent;

/** One quiet icon per take state, in `ink2` like the sentence's disc. */
function stateIcon(kind: Exclude<TakeState["kind"], "ok">, t: Tokens): IconProp {
  switch (kind) {
    case "non_member":
      return Users;
    case "blocked":
      return Info;
    case "claimed_today":
      return Check;
    case "too_new":
      return CalendarClock;
    case "empty":
      return <HookGlyph size={20} color={t.ink2} />;
    case "ordering_blocked":
      return CirclePause;
  }
}

/** The chip glyph matches the item: a tea glass, a simit, else a cup. */
function itemGlyph(name: string, color: string): ReactElement {
  const n = name.toLocaleLowerCase("tr");
  if (n.includes("simit")) return <SimitGlyph size={20} color={color} />;
  return <DeviceGlyph kind={n.includes("çay") ? "glass" : "fincan"} size={20} color={color} />;
}

export default function AskidanAlSheet() {
  const t = useTokens();
  const { kafe } = useLocalSearchParams<{ kafe?: string }>();
  const slug = kafe ?? "";
  const { api, signedIn } = useSession();
  const { cafe } = useCafeEntry(slug);
  const cart = useCart(slug);

  // A fresh read on open (the pool, eligibility, pause); what's in memory shows meanwhile.
  useEffect(() => {
    if (slug) void loadCafe(api, slug);
  }, [api, slug]);

  const items = cafe ? askiItems(cafe) : [];
  const reference = cafe ? referenceItem(cafe) : null;
  const pool = cafe?.askida.balancePeni ?? 0;
  const covers = (item: (typeof items)[number]) => item.available && itemPeni(item) <= pool;
  const coverable = items.filter(covers);
  const state: TakeState | null = cafe
    ? takeState({ askida: cafe.askida, member: !!cafe.membership, blocked: orderingBlocked(cafe), coverable: coverable.length })
    : null;

  /* The chosen item: the one already in the cart, else the reference, else the first that fits. */
  const pick = () =>
    coverable.find((i) => i.productId === cart.ikramProductId)?.productId ??
    (reference && covers(reference) ? reference.productId : null) ??
    coverable[0]?.productId ??
    null;
  const [selected, setSelected] = useState<string | null>(null);
  const chosenId = selected ?? pick();
  const chosen = coverable.find((i) => i.productId === chosenId) ?? null;

  /* A9: lift, then hand the item to the cart and close. */
  const [takeSignal, setTakeSignal] = useState(0);
  const pending = useRef<string | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (fallback.current && clearTimeout(fallback.current)), []);

  const deliver = () => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    const id = pending.current;
    pending.current = null;
    if (!id) return;
    // Switching the ikram to another item: the unit that was the ikram leaves with it, so the
    // paid quantity of the old item stays what it was.
    const previous = cart.ikramProductId;
    if (previous && previous !== id) cart.add(previous, -1);
    cart.setIkram(id);
    if (router.canGoBack()) router.back();
  };

  const confirm = () => {
    if (!chosen || pending.current) return;
    pending.current = chosen.productId;
    setTakeSignal((n) => n + 1);
    // The rail calls back when the cup has gone; never later than this.
    fallback.current = setTimeout(deliver, 600);
  };

  const taking = pending.current != null;

  if (!cafe || !state) {
    return (
      <SheetFrame title={askiCopy.takeSheet.title}>
        <Skeleton height={96} radius={14} />
        <Skeleton width="60%" line="button" style={{ marginTop: 16 }} />
        <Skeleton height={44} radius={10} style={{ marginTop: 8 }} />
      </SheetFrame>
    );
  }

  const caption = askiCaption(cafe.askida);
  const rail = askiRailProps(cafe.askida);

  const footer =
    state.kind === "ok" ? (
      <View style={{ gap: 8 }}>
        <Button variant="aski" size="lg" fullWidth title={askiCopy.takeSheet.confirm} disabled={!chosen} onPress={confirm} />
        <Button variant="quiet" fullWidth title={askiCopy.takeSheet.cancel} onPress={() => !taking && router.back()} />
      </View>
    ) : state.kind === "non_member" ? (
      <View style={{ gap: 8 }}>
        <Button
          size="lg"
          fullWidth
          title={signedIn ? askiCopy.takeStates.nonMemberAction : actionCopy.signInAndJoin}
          onPress={() => router.replace(`/katil?kafe=${q(slug)}&sonra=al`)}
        />
        <Button variant="quiet" fullWidth title={actionCopy.cancel} onPress={() => router.back()} />
      </View>
    ) : (
      <Button variant="secondary" size="lg" fullWidth title={actionCopy.ok} onPress={() => router.back()} />
    );

  return (
    <SheetFrame title={askiCopy.takeSheet.title} footer={footer} closeDisabled={taking}>
      {/* The mini rail: what's waiting, drawn as whole items (D9). Its caption is the text for it. */}
      <View style={{ alignItems: "center", gap: 8, borderRadius: radius.card, backgroundColor: t.askiSoft, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
        <AskiRail
          count={rail.count}
          item={rail.item}
          size="md"
          maxSlots={6}
          width={6 * 28}
          style={{ alignSelf: "center" }}
          takeSignal={takeSignal}
          onTakeComplete={deliver}
        />
        {/* Empty: the sentence below says it once. */}
        {state.kind !== "empty" ? (
          <T variant="meta" color="askiInk" align="center">
            {caption.line1}
          </T>
        ) : null}
      </View>

      {state.kind === "ok" ? (
        <View style={{ marginTop: 20, gap: 10 }}>
          <T variant="button" aria-hidden>
            {askiCopy.takeSheet.which}
          </T>
          <ChipGroup label={askiCopy.takeSheet.which}>
            {items.map((item) => {
              const reason = !item.available ? cartCopy.soldOut : covers(item) ? undefined : askiCopy.takeSheet.notEnough;
              return (
                <Chip
                  key={item.productId}
                  kind="choice"
                  icon={itemGlyph(item.name, reason ? t.ink2 : t.ink)}
                  selected={item.productId === chosenId}
                  disabledReason={reason}
                  onPress={() => !taking && setSelected(item.productId)}
                  style={{ flexGrow: 1 }}
                >
                  {item.name}
                </Chip>
              );
            })}
          </ChipGroup>
          <T variant="body" color="ink2" style={{ marginTop: 10 }}>
            {askiCopy.takeSheet.body}
          </T>
        </View>
      ) : (
        <StateNote icon={stateIcon(state.kind, t)} text={takeStateText(state)} style={{ marginTop: 20 }} />
      )}
    </SheetFrame>
  );
}
