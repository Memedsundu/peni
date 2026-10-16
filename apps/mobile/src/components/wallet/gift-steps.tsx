/**
 * The ismarla sheet's frame and steps (design-system.md §9.6 GiftSheet, §10.5, D14, [G6]).
 * The route (`app/ismarla.tsx`) holds the state; these draw it.
 *
 * Frame: a top line with "‹" (back, when there is a step to go back to), the step counter
 * "ADIM 2/3" in `legend`, and a 44pt "Kapat" at the right; then the step title in `h3` (the
 * sheet's own title: Android has no native header in a sheet), a line under it, the body, and
 * the footer — all in one ScrollView, so nothing is pinned under a detent the user can't see.
 */
import type { RecentRecipientDTO, RefItemDTO, WalletCafeDTO } from "@peni/api";
import { actionCopy } from "@peni/brand/copy";
import { formatPeni, SEP } from "@peni/brand/format";
import { Check, ChevronLeft, X } from "lucide-react-native";
import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Coin, type CoinCafe } from "@/components/brand";
import { Banner, Chip, ChipGroup, Field, Icon, IconButton, Row, RowGroup, Stepper, T } from "@/components/ui";
import { durations } from "@/lib/motion";
import { fonts, radius, space, useTokens } from "@/lib/theme";
import { Avatar, Envelope } from "./parts";
import {
  capReason,
  formatPhoneDigits,
  giftCopy,
  itemChipLabel,
  itemPeni,
  NOTE_MAX,
  shortName,
  type GiftCaps,
} from "./wallet-model";

/* ========================================================================================== */
/* Frame                                                                                      */
/* ========================================================================================== */

export interface GiftFrameProps {
  /** "ADIM 2/3"; none on the done screen. */
  eyebrow?: string | null;
  title: string;
  description?: ReactNode;
  onBack?: (() => void) | null;
  onClose: () => void;
  /** Re-keys the body: a 200ms fade in on each step (instant under Reduce Motion). */
  stepKey: string;
  footer?: ReactNode;
  children?: ReactNode;
}

const stepIn = FadeIn.duration(durations.ui).reduceMotion(ReduceMotion.System);

export function GiftFrame({ eyebrow, title, description, onBack, onClose, stepKey, footer, children }: GiftFrameProps) {
  const insets = useSafeAreaInsets();
  // The control that moved us on has left the screen: say where we are now.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(eyebrow ? `${eyebrow}. ${title}` : title);
    // Only on a new step; the title is read with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);
  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        <View style={styles.top}>
          {onBack ? (
            <IconButton label={actionCopy.back} icon={ChevronLeft} iconSize={24} onPress={onBack} style={styles.back} />
          ) : null}
          <View style={styles.eyebrow}>
            {eyebrow ? (
              <T variant="legend" color="ink2">
                {eyebrow}
              </T>
            ) : null}
          </View>
          <IconButton label={actionCopy.close} icon={X} iconSize={24} onPress={onClose} style={styles.close} />
        </View>
        <T variant="h3" accessibilityRole="header" style={styles.title}>
          {title}
        </T>
        {description != null ? (
          <View style={styles.description}>
            {typeof description === "string" ? (
              <T variant="body" color="ink2">
                {description}
              </T>
            ) : (
              description
            )}
          </View>
        ) : null}
        <Animated.View key={stepKey} entering={stepIn} style={styles.body}>
          {children}
          {footer != null ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </ScrollView>
  );
}

/** "(coin) Moda Kahvesi · 90 peni": the café line under a step title. */
export function CafeLine({ cafe, coin, balance }: { cafe: WalletCafeDTO; coin: CoinCafe; balance: number }) {
  return (
    <View style={styles.cafeLine} accessible accessibilityLabel={`${cafe.cafeName}, ${formatPeni(balance)}`}>
      <Coin size={16} cafe={coin} />
      <T variant="body" color="ink2" style={styles.flex}>
        {`${cafe.cafeName}${SEP}`}
        <T variant="strong" color="peniInk" tabular>
          {formatPeni(balance).replace(" ", " ")}
        </T>
      </T>
    </View>
  );
}

/* ========================================================================================== */
/* 1. Hangi kafede?                                                                           */
/* ========================================================================================== */

export function CafeStep({
  cafes,
  cities,
  onPick,
}: {
  cafes: readonly WalletCafeDTO[];
  cities: Readonly<Record<string, string | null>>;
  onPick: (slug: string) => void;
}) {
  return (
    <View style={styles.bleed}>
      <RowGroup flat>
        {cafes.map((c) => (
          <Row
            key={c.cafeSlug}
            onPress={() => onPick(c.cafeSlug)}
            arrow
            accessibilityLabel={`${c.cafeName}, ${formatPeni(c.balancePeni)}`}
            start={
              <Coin
                size={28}
                cafe={{ name: c.cafeName, district: c.district, city: cities[c.cafeSlug] ?? null, slug: c.cafeSlug }}
              />
            }
            title={
              <T variant="body">
                {`${c.cafeName}${SEP}`}
                <T variant="strong" color="peniInk" tabular>
                  {formatPeni(c.balancePeni).replace(" ", " ")}
                </T>
              </T>
            }
          />
        ))}
      </RowGroup>
    </View>
  );
}

/* ========================================================================================== */
/* 2. Kime ısmarlıyorsun?                                                                     */
/* ========================================================================================== */

export interface Recipient {
  phone: string;
  first: string;
  label: string;
  initials: string;
}

export function WhoStep({
  recents,
  digits,
  onDigits,
  phoneError,
  looking,
  found,
  onPickRecent,
  onSubmit,
}: {
  recents: readonly RecentRecipientDTO[];
  digits: string;
  onDigits: (text: string) => void;
  phoneError: string | null;
  looking: boolean;
  found: Recipient | null;
  onPickRecent: (r: RecentRecipientDTO) => void;
  onSubmit: () => void;
}) {
  const t = useTokens();
  return (
    <View style={styles.stack24}>
      {recents.length > 0 ? (
        <View>
          <T variant="legend" color="ink2" accessibilityRole="header" style={styles.legend}>
            {giftCopy.recents}
          </T>
          <View style={styles.bleed}>
            <RowGroup flat>
              {recents.map((r) => (
                <Row
                  key={r.phone}
                  onPress={() => onPickRecent(r)}
                  arrow
                  start={<Avatar initials={r.initials} />}
                  title={shortName(r.firstName, r.lastInitial)}
                />
              ))}
            </RowGroup>
          </View>
        </View>
      ) : null}

      <View style={styles.stack12}>
        <Field
          label={giftCopy.phoneLabel}
          labelVariant="legend"
          accessibilityLabel={giftCopy.phoneLabel}
          aria-label={giftCopy.phoneLabel}
          hint={giftCopy.phoneHint}
          error={phoneError}
          prefix="+90"
          value={formatPhoneDigits(digits)}
          onChangeText={onDigits}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          maxLength={16}
        />
        {looking ? (
          <T variant="meta" color="ink2" accessibilityLiveRegion="polite">
            {giftCopy.lookingUp}
          </T>
        ) : null}
        {found ? (
          <View accessibilityLiveRegion="polite" style={[styles.found, { backgroundColor: t.successSoft }]}>
            <Avatar initials={found.initials} tone="success" />
            <T variant="body" color="successInk" style={styles.flex}>
              <T variant="strong" color="successInk">
                {found.label}
              </T>
              {giftCopy.memberSuffix}
            </T>
            <Icon icon={Check} size={20} color={t.successInk} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ========================================================================================== */
/* 3. Ne ısmarlıyorsun?                                                                       */
/* ========================================================================================== */

export const OTHER = "other" as const;
export type Choice = number | typeof OTHER | null;

export function WhatStep({
  refItems,
  caps,
  choice,
  onChoice,
  isOther,
  customPeni,
  onCustom,
  coin,
  to,
  note,
  onNote,
}: {
  refItems: readonly RefItemDTO[];
  caps: GiftCaps;
  choice: Choice;
  onChoice: (c: Choice) => void;
  isOther: boolean;
  customPeni: number;
  onCustom: (next: number) => void;
  coin: CoinCafe;
  to: string;
  note: string;
  onNote: (text: string) => void;
}) {
  const t = useTokens();
  return (
    <View style={styles.stack20}>
      {caps.dailyLeft < 1 ? <Banner tone="warning" title={giftCopy.dailyReached} /> : null}

      <View style={styles.stack12}>
        <ChipGroup label={giftCopy.whatTitle}>
          {refItems.map((it, i) => {
            const why = capReason(itemPeni(it), caps);
            return (
              <Chip
                key={`${it.name}-${i}`}
                kind="choice"
                selected={choice === i && why == null}
                disabledReason={why ?? undefined}
                onPress={() => onChoice(i)}
                style={styles.grow}
              >
                {itemChipLabel(it)}
              </Chip>
            );
          })}
          <Chip
            kind="choice"
            selected={isOther}
            disabledReason={caps.max >= 1 ? undefined : (capReason(1, caps) ?? undefined)}
            onPress={() => onChoice(OTHER)}
            style={styles.grow}
          >
            {giftCopy.other}
          </Chip>
        </ChipGroup>

        {isOther ? (
          <View style={[styles.stepperPanel, { backgroundColor: t.surface2 }]}>
            <T variant="body" aria-hidden>
              {giftCopy.stepperLabel}
            </T>
            <Stepper
              value={customPeni}
              onChange={onCustom}
              min={1}
              max={caps.max}
              step={5}
              collapsible={false}
              itemName={giftCopy.stepperLabel}
              maxReason={capReason(caps.max + 1, caps) ?? undefined}
            />
          </View>
        ) : null}
      </View>

      <Envelope cafe={coin} to={to}>
        <Field
          label={giftCopy.noteLabel}
          aria-label={giftCopy.noteLabel}
          value={note}
          onChangeText={onNote}
          maxLength={NOTE_MAX}
          counter
          rows={3}
          placeholder={giftCopy.notePlaceholder}
        />
      </Envelope>

      <View style={styles.stack4}>
        <T variant="meta" color="ink2">
          {giftCopy.dailyRule}
        </T>
        {caps.binding === "daily" && caps.dailyLeft > 0 ? (
          <T variant="meta" color="ink2">
            {giftCopy.dailyLeft(caps.dailyLeft)}
          </T>
        ) : null}
        <T variant="meta" color="ink2">
          {giftCopy.returnRule}
        </T>
      </View>
    </View>
  );
}

/* ========================================================================================== */
/* Done                                                                                       */
/* ========================================================================================== */

export function DoneStep({
  coin,
  to,
  what,
  peni,
  message,
  returnNote,
}: {
  coin: CoinCafe;
  to: string;
  what: string;
  peni: number;
  message: string | null;
  returnNote: string;
}) {
  return (
    <View style={styles.stack16}>
      <Envelope cafe={coin} to={to}>
        <T variant="item" tabular>
          {what.endsWith("peni") ? null : `${what}${SEP}`}
          <T variant="item" color="peniInk">
            {formatPeni(peni).replace(" ", " ")}
          </T>
        </T>
        {message ? (
          <T variant="question" style={styles.note}>
            {`“${message}”`}
          </T>
        ) : null}
      </Envelope>
      <T variant="body" color="ink2">
        {returnNote}
      </T>
    </View>
  );
}

/* ========================================================================================== */

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: 8 },
  column: { width: "100%", maxWidth: 560, alignSelf: "center" },
  top: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 4 },
  back: { marginLeft: -10 },
  eyebrow: { flex: 1, minWidth: 0 },
  close: { marginRight: -10 },
  title: { marginTop: 4 },
  description: { marginTop: 6 },
  body: { marginTop: 20 },
  footer: { marginTop: 24, gap: 12 },
  cafeLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  /** Rows run edge to edge in the sheet, like a list on a sheet. */
  bleed: { marginHorizontal: -space.gutter },
  legend: { marginBottom: 8 },
  stack4: { gap: 4 },
  stack12: { gap: 12 },
  stack16: { gap: 16 },
  stack20: { gap: 20 },
  stack24: { gap: 24 },
  grow: { flexGrow: 1, alignSelf: "stretch" },
  found: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepperPanel: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderRadius: radius.control,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 6,
  },
  note: { marginTop: 8, fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 24 },
});
