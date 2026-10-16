/**
 * Kafe detail (design-system.md §10.2, with §9.3 for anatomy and copy), a root-stack push with
 * no tab bar, so the cart bar is the one floating layer (D10).
 *
 * - A transparent header (cream tint, light status bar) over a full-bleed `CafeCover` hero with
 *   the 96pt scrim; the cover is the iOS zoom target (`Link.AppleZoomTarget`). Once the cover
 *   has scrolled under it, the header turns to paper with an ink tint, and the café name
 *   appears as its title once the masthead's own name has gone.
 * - Masthead, meta, membership row, "Bugün masada".
 * - "Menü · Askı · Masa", sticky through `stickyHeaderIndices` just under the header; tapping
 *   scrolls to the section (measured with `onLayout`), and scrolling moves the indicator.
 * - Menü, Askı, Masa; the cart bar opens `sepet`.
 * - Pull to refresh (`selection` haptic). Errors after the first load never replace the page.
 *
 * Sheets: `katil` (join, D11), `sepet`, `askidan-al`, `askiya-birak`. They share the café
 * through `components/cafe/cafe-store` and the cart through `lib/cart`.
 */
import type { MenuItemDTO, PostDTO } from "@peni/api";
import { greeting } from "@peni/brand/format";
import { plateText } from "@peni/brand/tokens";
import { Link, router, Stack, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import {
  PixelRatio,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { LayoutAnimationConfig } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CafeCover, Masthead } from "@/components/brand";
import { orderingBlocked } from "@/components/cafe/aski-model";
import { AskiPanel, type DonationEvent } from "@/components/cafe/aski-panel";
import { CafeContext, cafeSheets, type CafeCtx } from "@/components/cafe/cafe-context";
import { CafeMeta, memberGreeting, MembershipRow, TodayStrip } from "@/components/cafe/cafe-header";
import { CafeLoadError, CafeNotFound, CafeSkeleton } from "@/components/cafe/cafe-states";
import {
  getCafeEntry,
  hasDonation,
  loadCafe,
  messageOf,
  putCafe,
  takeDonation,
  takePendingJoin,
  useCafeEntry,
} from "@/components/cafe/cafe-store";
import { CartBar, useCartBarSpace } from "@/components/cafe/cart-bar";
import { MasaFeed } from "@/components/cafe/masa-feed";
import { MenuSection } from "@/components/cafe/menu-section";
import { Segmented, toast } from "@/components/ui";
import { summarizeCart, useCart } from "@/lib/cart";
import { haptic } from "@/lib/haptics";
import { useMotionReduced } from "@/lib/motion";
import { useSession } from "@/lib/session";
import { isDark, space, useTokens } from "@/lib/theme";

const WEB = Platform.OS === "web";

/** The visible hero below the status bar (§10.2: 200pt). */
const COVER = 200;
/** The segmented bar (`--seg-h`). */
const SEG_H = 48;
/** Air between the stuck segmented bar and a section's first line after a jump. */
const LAND = 24;

type SectionId = "menu" | "aski" | "masa";

/** Section top padding: Menü sits close under the bar; Askı and Masa get a section gap. */
const PAD: Record<SectionId, number> = { menu: 24, aski: 40, masa: 40 };

/** The native header's height (the same arithmetic the stack uses). */
function headerHeight(top: number): number {
  if (Platform.OS === "ios") {
    // On Dynamic Island phones the status bar is a little shorter than the top inset.
    const status = top > 50 ? top - (5 + 1 / PixelRatio.get()) : top;
    return status + 44;
  }
  return top + 64;
}

/** `?sepet=latte:1,simit:1` → [["latte", 1], ["simit", 1]]. */
function parseSepet(raw: string): [string, number][] {
  return raw
    .split(",")
    .map((part) => part.split(":"))
    .map(([id, n]) => [decodeURIComponent(id ?? "").trim(), Math.max(1, Math.min(20, Math.floor(Number(n ?? 1)) || 1))] as [string, number])
    .filter(([id]) => id.length > 0);
}

export default function CafeScreen() {
  const params = useLocalSearchParams<{ slug: string; sepet?: string }>();
  const slug = params.slug ?? "";
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const focused = useIsFocused();
  const { api, signedIn, customer } = useSession();
  const entry = useCafeEntry(slug);
  const cafe = entry.cafe;
  const cart = useCart(slug);
  const [now] = useState(() => new Date());

  const headerH = headerHeight(insets.top);
  const coverH = COVER + insets.top;
  const cartBarSpace = useCartBarSpace();

  /* ------------------------------------------------------------------ loading and refresh */

  // First read, and again whenever who is signed in changes (membership, balance, eligibility).
  useEffect(() => {
    if (slug) void loadCafe(api, slug);
  }, [api, slug]);

  const refresh = useCallback(async () => {
    await loadCafe(api, slug);
  }, [api, slug]);

  const [refreshing, setRefreshing] = useState(false);
  const onPull = useCallback(async () => {
    haptic("selection");
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  }, [refresh]);

  /* -------------------------------------------- back on the screen: refresh, join, donation */

  const [donation, setDonation] = useState<DonationEvent | null>(null);
  useFocusEffect(
    useCallback(() => {
      const e = getCafeEntry(slug);
      if (e.cafe && Date.now() - e.fetchedAt > 3000 && !hasDonation(slug)) void loadCafe(api, slug);

      // "Giriş yap ve katıl": back from the sign-in modal, signed in → finish the join.
      if (signedIn && takePendingJoin(slug)) {
        void (async () => {
          try {
            putCafe(slug, await api.cafes.join(slug));
          } catch (err) {
            haptic("error");
            toast(messageOf(err), { tone: "danger" });
          }
        })();
      }

      // One's own donation from the give sheet: A8 here once the sheet has gone (D7).
      let timer: ReturnType<typeof setTimeout> | null = null;
      if (hasDonation(slug)) {
        timer = setTimeout(() => {
          const d = takeDonation(slug);
          if (d) setDonation((prev) => ({ n: (prev?.n ?? 0) + 1, donation: d }));
          void loadCafe(api, slug);
        }, 380);
      }
      return () => {
        if (timer) clearTimeout(timer);
      };
    }, [api, slug, signedIn]),
  );

  /* ------------------------------------------------------------------------- the cart */

  const member = !!cafe?.membership;
  const blocked = cafe ? orderingBlocked(cafe) : null;
  const sum = useMemo(() => (cafe ? summarizeCart(cart, cafe) : null), [cafe, cart]);
  const showCart = member && !!sum && sum.count > 0;
  // A cart that was already there when the screen opened doesn't slide in again; once it has
  // emptied, the next first item slides the bar in as usual (A4).
  const [skipCartEnter, setSkipCartEnter] = useState(() => showCart);
  if (skipCartEnter && !showCart && cafe) setSkipCartEnter(false);

  // "Her zamanki" / "Yeniden sipariş ver": `?sepet=latte:1,simit:1`, once.
  const [dropped, setDropped] = useState<string[]>([]);
  const sepetHandled = useRef(false);
  useEffect(() => {
    if (sepetHandled.current || !params.sepet || !cafe) return;
    sepetHandled.current = true;
    if (!cafe.membership || blocked) return;
    const byId = new Map(cafe.menu.map((m) => [m.productId, m]));
    const wanted = parseSepet(params.sepet);
    const gone: string[] = [];
    for (const [id, qty] of wanted) {
      const item = byId.get(id);
      if (!item) continue;
      if (item.available) cart.setQuantity(id, qty);
      else gone.push(item.name);
    }
    setDropped(gone);
    router.setParams({ sepet: undefined });
  }, [cafe, params.sepet, blocked, cart]);

  /* ----------------------------------------------------------------- header and scroll */

  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [solid, setSolid] = useState(false);
  const [titled, setTitled] = useState(false);
  const sectionY = useRef<Partial<Record<SectionId, number>>>({});
  const postY = useRef(new Map<string, number>());
  const viewH = useRef(0);
  const contentH = useRef(0);
  const [active, setActive] = useState<SectionId>("menu");
  const spyLock = useRef(0);

  const sectionIds: SectionId[] = cafe?.askida.enabled === false ? ["menu", "masa"] : ["menu", "aski", "masa"];

  /** Where a section lands: LAND pt under the stuck segmented bar. */
  const landing = useCallback((id: SectionId) => {
    const y = sectionY.current[id];
    return y == null ? null : Math.max(0, y + PAD[id] - LAND - headerH - SEG_H);
  }, [headerH]);

  const spy = (y: number) => {
    if (Date.now() < spyLock.current) return;
    let next: SectionId = sectionIds[0]!;
    for (const id of sectionIds) {
      const at = landing(id);
      if (at != null && at <= y + 8) next = id;
    }
    if (viewH.current > 0 && y + viewH.current >= contentH.current - 8) next = sectionIds[sectionIds.length - 1]!;
    if (next !== active) setActive(next);
  };

  /** The header's look follows the scroll offset. */
  const syncHeader = (y: number) => {
    const pastCover = y > coverH - headerH - 4;
    if (pastCover !== solid) setSolid(pastCover);
    // The masthead's name (rule 6 + 12 + 38 under a 20pt gap) has gone under the header.
    const nameGone = y > coverH + 76 - headerH;
    if (nameGone !== titled) setTitled(nameGone);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    viewH.current = e.nativeEvent.layoutMeasurement.height;
    contentH.current = e.nativeEvent.contentSize.height;
    syncHeader(y);
    spy(y);
  };

  // react-native-web hides a covered screen with `display: none`, which can report a scroll to 0
  // on the way out and restore the offset silently on the way back: re-read it on focus.
  const syncRef = useRef<(y: number) => void>(() => {});
  syncRef.current = (y: number) => {
    syncHeader(y);
    spy(y);
  };
  useFocusEffect(
    useCallback(() => {
      if (!WEB) return;
      const raf = requestAnimationFrame(() => {
        const node = (scroller.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
        if (node) syncRef.current(node.scrollTop);
      });
      return () => cancelAnimationFrame(raf);
    }, []),
  );

  const scrollTo = (y: number) => {
    spyLock.current = Date.now() + (reduced ? 50 : 600);
    scroller.current?.scrollTo({ y, animated: !reduced });
  };

  const goSection = (id: string) => {
    const at = landing(id as SectionId);
    if (at == null) return;
    setActive(id as SectionId);
    scrollTo(at);
  };

  const goPost = (post: PostDTO) => {
    const masa = sectionY.current.masa;
    const y = postY.current.get(post.id);
    setActive("masa");
    if (masa == null || y == null) return goSection("masa");
    scrollTo(Math.max(0, masa + PAD.masa + y - 16 - headerH - SEG_H));
  };

  const measure = (id: SectionId) => (e: LayoutChangeEvent) => {
    sectionY.current[id] = e.nativeEvent.layout.y;
  };

  /* ------------------------------------------------------------------------------ render */

  const firstName = customer?.displayName.trim().split(/\s+/)[0] || null;
  const failed = !cafe && (entry.status === "not_found" || entry.status === "error");
  const overCover = !failed && !solid;
  const dark = isDark(t);

  const header = (
    <Stack.Screen
      options={{
        headerTransparent: !failed,
        headerStyle: { backgroundColor: overCover ? "transparent" : t.bg },
        headerTintColor: overCover ? plateText : t.ink,
        headerTitleStyle: { color: t.ink },
        headerShadowVisible: false,
        headerUserInterfaceStyle: overCover || dark ? "dark" : "light",
        title: titled && cafe ? cafe.name : "",
      }}
    />
  );
  const statusBar = focused ? <StatusBar style={overCover ? "light" : "auto"} /> : null;

  if (failed) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {header}
        {statusBar}
        {entry.status === "not_found" ? (
          <CafeNotFound />
        ) : (
          <CafeLoadError message={entry.error ?? ""} retrying={retrying} onRetry={() => void retry()} />
        )}
      </View>
    );
  }

  const coverEl = (
    <CafeCover
      cafe={{ slug, name: cafe?.name ?? "", coverImageUrl: cafe?.coverImageUrl ?? null, hue: cafe?.hue ?? null }}
      size="hero"
      height={coverH}
      bleed
      scrim
    />
  );
  const cover = Platform.OS === "ios" ? <Link.AppleZoomTarget>{coverEl}</Link.AppleZoomTarget> : coverEl;

  if (!cafe || !sum) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {header}
        {statusBar}
        <ScrollView scrollEnabled={false} contentInsetAdjustmentBehavior="never">
          {cover}
          <CafeSkeleton />
        </ScrollView>
      </View>
    );
  }

  const ctx: CafeCtx = { cafe, slug, signedIn, member, blocked, now, refresh };

  const joinAdd = (item: MenuItemDTO) => cafeSheets.join(slug, { add: item.productId });

  /*
   * The segmented bar sticks just under the header. Natively through `stickyHeaderIndices`: a
   * sticky child sticks at the scroll view's top edge (under the transparent header), so its
   * top `headerH` is a see-through band that hangs over the head above it, and the bar itself
   * stops just below the header. The ScrollView moves the child's style onto its own sticky
   * wrapper, so `pointerEvents` travels as a style and touches pass through the band to what
   * lies beneath. react-native-web keeps the child's style on the child and pins its wrapper at
   * `top: 0`, so the preview uses CSS sticky with the header's offset instead.
   */
  const stickyStyle: ViewStyle = WEB
    ? ({ position: "sticky", top: headerH, zIndex: 20 } as unknown as ViewStyle)
    : { marginTop: -headerH, paddingTop: headerH, pointerEvents: "box-none" };

  return (
    <CafeContext.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {header}
        {statusBar}
        <ScrollView
          ref={scroller}
          contentInsetAdjustmentBehavior="never"
          stickyHeaderIndices={WEB ? undefined : [2]}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => (contentH.current = h)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onPull()}
              tintColor={t.ink}
              colors={[t.ink]}
              progressBackgroundColor={t.surface}
              progressViewOffset={headerH}
            />
          }
          contentContainerStyle={{ paddingBottom: (showCart ? cartBarSpace : insets.bottom) + 32 }}
        >
          {/* 0 */}
          {cover}

          {/* 1: the paper's head */}
          <View style={{ paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: 24, gap: 16 }}>
            <Masthead cafe={cafe} date={now} greeting={memberGreeting(member, greeting(now), firstName)} />
            <View style={{ gap: 16, marginTop: 4 }}>
              <CafeMeta cafe={cafe} />
              <MembershipRow cafe={cafe} signedIn={signedIn} />
            </View>
            <TodayStrip cafe={cafe} now={now} onGo={goPost} />
          </View>

          {/* 2: sticky, just under the header (see `stickyStyle`). */}
          <View pointerEvents="box-none" style={stickyStyle}>
            <View style={{ backgroundColor: t.bg, paddingHorizontal: space.gutter }}>
              <Segmented
                id="kafe"
                label="Kafe bölümleri"
                items={sectionIds.map((id) => ({ id, label: id === "menu" ? "Menü" : id === "aski" ? "Askı" : "Masa" }))}
                value={active}
                onChange={goSection}
              />
            </View>
          </View>

          {/* 3 */}
          <View onLayout={measure("menu")} style={{ paddingHorizontal: space.gutter, paddingTop: PAD.menu }}>
            <MenuSection menu={cafe.menu} cart={cart} member={member} blocked={blocked} dropped={dropped} onJoinAdd={joinAdd} />
          </View>

          {/* 4 */}
          {cafe.askida.enabled ? (
            <View onLayout={measure("aski")} style={{ paddingHorizontal: space.gutter, paddingTop: PAD.aski }}>
              <AskiPanel donation={donation} ikramProductId={member ? cart.ikramProductId : null} />
            </View>
          ) : null}

          {/* 5 */}
          <View onLayout={measure("masa")} style={{ paddingHorizontal: space.gutter, paddingTop: PAD.masa }}>
            <MasaFeed onPostY={(id, y) => postY.current.set(id, y)} />
          </View>
        </ScrollView>

        {showCart ? (
          <LayoutAnimationConfig skipEntering={skipCartEnter}>
            <CartBar count={sum.count} dueKurus={sum.dueKurus} onPress={() => cafeSheets.cart(slug)} />
          </LayoutAnimationConfig>
        ) : null}
      </View>
    </CafeContext.Provider>
  );
}
