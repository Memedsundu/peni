/**
 * The Askı tab (design-system.md §9.10, §6.2, §10.10): the café's hook rail with its caption,
 * and the till.
 *
 * - The rail panel: `askiSoft`, the "ASKIDA KAHVE" legend with the hook glyph, `AskiRail
 *   size="md"` and `AskiCaption` (the weekly ikram count hides below 3, D8).
 * - The till card: h3 "Kasada askıya bırakılanlar", one stepper row per askı item ("Çay ·
 *   30 peni" [− n +]), and the 56pt primary "Askıya ekle · 2 çay (60 peni)", disabled at 0
 *   with its reason.
 * - Success: the new items hang on the rail (A8 — the staff till is one of the two places
 *   cup-hang plays — with its `success` haptic) and a toast "Askıya 2 çay eklendi." A failure
 *   stays inline under the button, with the counts kept. A retry reuses the idempotency key.
 *
 * Dignity (§17): nothing here names or counts anyone who takes.
 */
import { newIdempotencyKey, type AskidaDTO, type MenuItemDTO } from "@peni/api";
import { askiCopy, errorCopy } from "@peni/brand/copy";
import { formatPeni, SEP } from "@peni/brand/format";
import { askiItemFor } from "@peni/brand/shapes";
import { CircleAlert } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AskiCaption, AskiRail, HookGlyph, type HangSignal } from "@/components/brand";
import { Banner, Button, Card, Icon, Skeleton, Stepper, T, toast, withAlpha } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { space, useTokens } from "@/lib/theme";
import { applyTillDonation, messageOf } from "./board-store";
import { itemsFor, tillItems, tillSelection, tillSubmitLabel, tillToastText } from "./model";

const TILL_HINT = "Kasada askı için ödeme alınca buradan ekle.";
const PICK_FIRST = "Önce adet seç.";
const ADDING = "Ekleniyor…";
const NO_ITEMS = "Menüde askıya konabilen ürün yok.";

export function TillPanel({ slug, askida }: { slug: string; askida: AskidaDTO }) {
  const t = useTokens();
  const { api } = useSession();
  const [menu, setMenu] = useState<MenuItemDTO[] | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hang, setHang] = useState<HangSignal>({ n: 0 });
  const idemKey = useRef<string | null>(null);

  const loadMenu = useCallback(async () => {
    setMenuError(null);
    try {
      const cafe = await api.cafes.get(slug);
      setMenu(cafe.menu);
    } catch (e) {
      setMenuError(messageOf(e));
    }
  }, [api, slug]);

  useEffect(() => {
    setMenu(null);
    setCounts({});
    void loadMenu();
  }, [loadMenu]);

  const items = useMemo(() => (menu ? tillItems(menu) : []), [menu]);
  const selection = tillSelection(items, counts);
  const referencePeni = useMemo(() => {
    const ref = askida.referenceItemName ? menu?.find((m) => m.name === askida.referenceItemName) : undefined;
    return ref ? Math.ceil(ref.priceKurus / 100) : null;
  }, [askida.referenceItemName, menu]);

  const setCount = (productId: string, n: number) => {
    setCounts((c) => ({ ...c, [productId]: n }));
    setError(null);
    idemKey.current = null; // a different selection is a different donation
  };

  const submit = async () => {
    if (busy || selection.count === 0) return;
    setBusy(true);
    setError(null);
    idemKey.current ??= newIdempotencyKey();
    try {
      const res = await api.staff.tillDonation(slug, { peni: selection.peni, idempotencyKey: idemKey.current });
      const before = askida.itemsAvailable;
      const after = itemsFor(res.balancePeni, referencePeni) ?? before;
      // The pool and the hang signal change in the same render, so only the new items drop in.
      applyTillDonation({ balancePeni: res.balancePeni, itemsAvailable: after, donatedPeni: selection.peni });
      const hung = Math.max(0, after - before);
      setHang((h) => ({ n: (typeof h === "number" ? h : h.n) + 1, count: hung }));
      // The rail plays `success` with the hang; with no whole new item to hang, play it here.
      if (hung === 0) haptic("success");
      toast(tillToastText(selection), { tone: "success" });
      setCounts({});
      idemKey.current = null;
    } catch (e) {
      haptic("error");
      setError(errorCopy.save(messageOf(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Card tone="aski" style={styles.railCard}>
        <RailLegend />
        <AskiRail count={askida.itemsAvailable} item={askiItemFor(askida.referenceItemName)} size="md" hangSignal={hang} />
        <AskiCaption askida={askida} />
      </Card>

      <Card padding="none" accessibilityState={menu == null && !menuError ? { busy: true } : undefined}>
        <TillHead />

        {menuError ? (
          <View style={styles.pad}>
            <Banner
              tone="danger"
              title={menuError}
              action={
                <Button
                  title={errorCopy.retry}
                  variant="secondary"
                  size="sm"
                  loading={retrying}
                  loadingLabel={errorCopy.retry}
                  onPress={async () => {
                    setRetrying(true);
                    await loadMenu();
                    setRetrying(false);
                  }}
                />
              }
            />
          </View>
        ) : (
          <>
            <View style={[styles.rows, { borderColor: t.line }]}>
              {menu == null ? (
                <TillRowsSkeleton />
              ) : items.length === 0 ? (
                <View style={styles.row}>
                  <T variant="body" color="ink2">
                    {NO_ITEMS}
                  </T>
                </View>
              ) : (
                items.map((it, i) => (
                  <View key={it.productId} style={[styles.row, i ? { borderTopWidth: 1, borderTopColor: t.line } : null]}>
                    <T variant="body" style={styles.rowText}>
                      <T variant="strong">{it.name}</T>
                      <T color="ink2">
                        {SEP}
                        {formatPeni(it.peni)}
                      </T>
                    </T>
                    <Stepper
                      value={counts[it.productId] ?? 0}
                      onChange={(n) => setCount(it.productId, n)}
                      itemName={it.name}
                      collapsible={false}
                      max={20}
                      disabled={busy}
                    />
                  </View>
                ))
              )}
            </View>
            <View style={styles.pad}>
              <Button
                title={tillSubmitLabel(selection)}
                size="lg"
                fullWidth
                loading={busy}
                loadingLabel={ADDING}
                disabled={selection.count === 0}
                disabledReason={selection.count === 0 && menu != null && items.length > 0 ? PICK_FIRST : undefined}
                onPress={() => void submit()}
              />
              {error ? (
                <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
                  <View style={styles.errorIcon}>
                    <Icon icon={CircleAlert} size={16} color={t.danger} />
                  </View>
                  <T variant="meta" color="danger" style={styles.errorText}>
                    {error}
                  </T>
                </View>
              ) : null}
            </View>
          </>
        )}
      </Card>
    </View>
  );
}

function RailLegend() {
  const t = useTokens();
  return (
    <View style={styles.legend}>
      <HookGlyph size={20} color={t.askiInk} />
      <T variant="legend" color="askiInk" accessibilityRole="header">
        {askiCopy.legend}
      </T>
    </View>
  );
}

function TillHead() {
  return (
    <View style={styles.tillHead}>
      <T variant="h3" accessibilityRole="header">
        {askiCopy.till.title}
      </T>
      <T variant="body" color="ink2">
        {TILL_HINT}
      </T>
    </View>
  );
}

function TillRowsSkeleton() {
  const t = useTokens();
  return (
    <>
      {[112, 96, 140].map((w, i) => (
        <View key={i} aria-hidden style={[styles.row, i ? { borderTopWidth: 1, borderTopColor: t.line } : null]}>
          <Skeleton width={w} line="body" />
          <Skeleton width={116} height={44} radius="full" />
        </View>
      ))}
    </>
  );
}

/**
 * Loading stand-in with the real geometry and every word that doesn't depend on the data: the
 * legend, the till's title and hint. The rail's placeholders are tinted with the panel's own ink,
 * so the askı panel reads as itself while it loads (no empty hooks: that would say "boş").
 */
export function TillPanelSkeleton() {
  const t = useTokens();
  const tint = { backgroundColor: withAlpha(t.askiInk, 0.12) };
  return (
    <View style={styles.wrap} accessibilityState={{ busy: true }}>
      <Card tone="aski" style={styles.railCard}>
        <RailLegend />
        <Skeleton height={40} radius={4} style={tint} />
        <View style={styles.captionSkeleton}>
          <Skeleton width="62%" line="item" style={tint} />
          <Skeleton width="48%" line="meta" style={tint} />
          <Skeleton width="74%" line="meta" style={tint} />
        </View>
      </Card>
      <Card padding="none">
        <TillHead />
        <View style={[styles.rows, { borderColor: t.line }]}>
          <TillRowsSkeleton />
        </View>
        <View style={styles.pad}>
          <Skeleton height={56} radius={10} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 24 },
  railCard: { gap: 12 },
  legend: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: 8 },
  tillHead: { paddingHorizontal: space.card, paddingTop: space.card, paddingBottom: 12, gap: 4 },
  rows: { borderTopWidth: 1, borderBottomWidth: 1 },
  captionSkeleton: { gap: 2 },
  row: {
    minHeight: 64,
    paddingVertical: 8,
    paddingHorizontal: space.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowText: { flexShrink: 1, minWidth: 0 },
  pad: { padding: space.card },
  error: { marginTop: 8, flexDirection: "row", alignItems: "flex-start", gap: 6 },
  errorIcon: { paddingTop: 1 },
  errorText: { flex: 1, minWidth: 0 },
});
