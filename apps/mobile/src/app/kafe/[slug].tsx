/**
 * Kafe detail (design-system.md §10.2, with §9.3 for anatomy and copy), a root-stack push with
 * no tab bar, so the cart bar is the one floating layer (D10).
 *
 * - A transparent header (cream tint, light status bar) over a full-bleed `CafeCover` hero with
 *   the 96pt scrim; the cover is the iOS zoom target (`Link.AppleZoomTarget`). Once the cover
 *   has scrolled under it, the header turns to paper with an ink tint, and the café name
 *   appears as its title once the masthead's own name has gone.
 * - The hero's colourway [G9] is the café's own, and links can hand it over before the detail
 *   arrives (`?hue=lacivert`), so the zoom lands on the real plate. With no hue known yet the
 *   loading hero is a plain `surface2` plate (never a guessed colourway) that the plate fades
 *   into once the café is read.
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
import { cafeHues, plateText, type CafeHue } from "@peni/brand/tokens";
import { Link, router, Stack, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
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
import Animated, { FadeIn, LayoutAnimationConfig } from "react-native-reanimated";
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
import { summarizeCart, useCart, type CartLine } from "@/lib/cart";
import { haptic } from "@/lib/haptics";
import { durations, useMotionReduced } from "@/lib/motion";
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

/** Section top padding: Menü sits close under the bar; Askı and Masa get the phone section gap (§5: 32). */
const PAD: Record<SectionId, number> = { menu: 24, aski: 32, masa: 32 };

/**
 * The header's height until the stack has measured it (the stack's own defaults: the iOS
 * Dynamic Island arithmetic, Android's 56dp, the web header's 64).
 */
function defaultHeaderHeight(top: number): number {
  if (Platform.OS === "ios") {
    // On Dynamic Island phones the status bar is a little shorter than the top inset.
    const status = top > 50 ? top - (5 + 1 / PixelRatio.get()) : top;
    return status + 44;
  }
  return top + (Platform.OS === "android" ? 56 : 64);
}

/** `?hue=` from a link that already knows the café's colourway (Kafeler, Siparişler, Cüzdan). */
function hueParam(raw: string | string[] | undefined): CafeHue | null {
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(cafeHues, raw) ? (raw as CafeHue) : null;
}

/* react-native-web only: onLayout there misses position-only changes and reports zeros while a
 * sheet hides the screen (`display: none`), so tap and scroll positions are read from the DOM. */

type ViewNode = ComponentRef<typeof View>;

type WebNode = { getBoundingClientRect: () => { top: number }; clientHeight: number; scrollTop: number; scrollHeight: number };

function scrollNodeOf(ref: RefObject<ComponentRef<typeof ScrollView> | null>): WebNode | null {
  if (!WEB) return null;
  const node = (ref.current as unknown as { getScrollableNode?: () => WebNode | null } | null)?.getScrollableNode?.();
  return node ?? null;
}

/** A node's top inside the scroll content; null while the screen is hidden. */
function domTop(root: WebNode | null, node: unknown): number | null {
  const el = node as Partial<WebNode> | null | undefined;
  if (!root || root.clientHeight === 0 || typeof el?.getBoundingClientRect !== "function") return null;
  return el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
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
  const params = useLocalSearchParams<{ slug: string; sepet?: string; hue?: string }>();
  const slug = params.slug ?? "";
  const linkHue = hueParam(params.hue);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const focused = useIsFocused();
  const { api, signedIn, customer } = useSession();
  const entry = useCafeEntry(slug);
  const cafe = entry.cafe;
  const cart = useCart(slug);
  const [now] = useState(() => new Date());
  /** The plain loading plate was on screen, so the real plate fades in over it. */
  const showedNeutral = useRef(false);

  // The stack's measured header (56dp + inset on Android, not a guess). Keep the last real value:
  // the web header reports 0 while a sheet hides the screen.
  const measuredHeader = useContext(HeaderHeightContext);
  const lastHeader = useRef(0);
  if (measuredHeader != null && measuredHeader > 0) lastHeader.current = measuredHeader;
  const headerH = lastHeader.current || defaultHeaderHeight(insets.top);
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

  // "Her zamanki" / "Yeniden sipariş ver": `?sepet=latte:1,simit:1`, once. The cart becomes
  // exactly that order (nothing stale stays from before); sold-out items are named in a banner.
  // If nothing of it can be ordered now, the cart is left as it was.
  const [dropped, setDropped] = useState<string[]>([]);
  const sepetHandled = useRef(false);
  useEffect(() => {
    if (sepetHandled.current || !params.sepet || !cafe) return;
    sepetHandled.current = true;
    if (!cafe.membership || blocked) return;
    const byId = new Map(cafe.menu.map((m) => [m.productId, m]));
    const lines: CartLine[] = [];
    const gone: string[] = [];
    for (const [productId, quantity] of parseSepet(params.sepet)) {
      const item = byId.get(productId);
      if (!item) continue;
      if (item.available) lines.push({ productId, quantity });
      else gone.push(item.name);
    }
    if (lines.length > 0) cart.replaceLines(lines);
    setDropped(gone);
    router.setParams({ sepet: undefined });
  }, [cafe, params.sepet, blocked, cart]);

  /* ----------------------------------------------------------------- header and scroll */

  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [solid, setSolid] = useState(false);
  const [titled, setTitled] = useState(false);
  /** Section tops in the scroll content, from onLayout (native). */
  const sectionY = useRef<Partial<Record<SectionId, number>>>({});
  /** The section views themselves (react-native-web reads their tops from the DOM). */
  const sectionNode = useRef<Partial<Record<SectionId, ViewNode | null>>>({});
  /** Masa cards: their offset in the feed (native) and their views (web). */
  const postY = useRef(new Map<string, number>());
  const postNode = useRef(new Map<string, ViewNode>());
  const viewH = useRef(0);
  const contentH = useRef(0);
  const [active, setActive] = useState<SectionId>("menu");
  const spyLock = useRef(0);

  const sectionIds: SectionId[] = cafe?.askida.enabled === false ? ["menu", "masa"] : ["menu", "aski", "masa"];

  const sectionTop = (id: SectionId): number | null =>
    domTop(scrollNodeOf(scroller), sectionNode.current[id]) ?? sectionY.current[id] ?? null;

  /** Where a section lands: LAND pt under the stuck segmented bar. */
  const landing = (id: SectionId) => {
    const y = sectionTop(id);
    return y == null ? null : Math.max(0, y + PAD[id] - LAND - headerH - SEG_H);
  };

  /** The scroll position and sizes the spy works from; null while a sheet hides the screen (web). */
  const metrics = (y: number) => {
    const root = scrollNodeOf(scroller);
    if (root) return root.clientHeight > 0 ? { y: root.scrollTop, view: root.clientHeight, content: root.scrollHeight } : null;
    return { y, view: viewH.current, content: contentH.current };
  };

  const spy = (y: number) => {
    if (Date.now() < spyLock.current) return;
    const m = metrics(y);
    if (!m) return;
    let next: SectionId = sectionIds[0]!;
    for (const id of sectionIds) {
      const at = landing(id);
      if (at != null && at <= m.y + 8) next = id;
    }
    if (m.view > 0 && m.content > m.view && m.y + m.view >= m.content - 8) next = sectionIds[sectionIds.length - 1]!;
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
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    // A hidden screen (web, under a sheet) reports a scroll to 0 with no size: not a real scroll.
    if (layoutMeasurement.height === 0) return;
    viewH.current = layoutMeasurement.height;
    contentH.current = contentSize.height;
    syncHeader(contentOffset.y);
    spy(contentOffset.y);
  };

  // react-native-web hides a covered screen with `display: none` and gives it back with its
  // offset restored but no scroll event: once it is visible again (two frames, then once more
  // after late layouts), re-read the offset for the header and the spy.
  const syncRef = useRef<() => void>(() => {});
  syncRef.current = () => {
    const root = scrollNodeOf(scroller);
    if (!root || root.clientHeight === 0) return;
    syncHeader(root.scrollTop);
    spy(root.scrollTop);
  };
  useFocusEffect(
    useCallback(() => {
      if (!WEB) return;
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => syncRef.current());
      });
      const late = setTimeout(() => syncRef.current(), 350);
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
        clearTimeout(late);
      };
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
    setActive("masa");
    const web = domTop(scrollNodeOf(scroller), postNode.current.get(post.id));
    const masa = sectionY.current.masa;
    const inFeed = postY.current.get(post.id);
    const top = web ?? (masa != null && inFeed != null ? masa + PAD.masa + inFeed : null);
    if (top == null) return goSection("masa");
    scrollTo(Math.max(0, top - 16 - headerH - SEG_H));
  };

  // Zero-height layouts come from a hidden screen (web), never from a real section.
  const measure = (id: SectionId) => (e: LayoutChangeEvent) => {
    if (e.nativeEvent.layout.height > 0) sectionY.current[id] = e.nativeEvent.layout.y;
  };
  const sectionRef = (id: SectionId) => (node: ViewNode | null) => {
    sectionNode.current[id] = node;
  };
  const postRef = (id: string, node: ViewNode | null) => {
    if (node) postNode.current.set(id, node);
    else postNode.current.delete(id);
  };

  /* ------------------------------------------------------------------------------ render */

  const firstName = customer?.displayName.trim().split(/\s+/)[0] || null;
  const failed = !cafe && (entry.status === "not_found" || entry.status === "error");
  /** The header floats over the hero. */
  const overCover = !failed && !solid;
  /** No colourway known yet: the hero is the plain loading plate. */
  const neutralPlate = !cafe && !linkHue;
  /** Over a colourway plate (or photo) the chrome is cream; over the plain plate it stays ink. */
  const onPlate = overCover && !neutralPlate;
  const dark = isDark(t);

  const header = (
    <Stack.Screen
      options={{
        headerTransparent: !failed,
        headerStyle: { backgroundColor: overCover ? "transparent" : t.bg },
        headerTintColor: onPlate ? plateText : t.ink,
        headerTitleStyle: { color: t.ink },
        headerShadowVisible: false,
        headerUserInterfaceStyle: onPlate || dark ? "dark" : "light",
        title: titled && cafe ? cafe.name : "",
      }}
    />
  );
  const statusBar = focused ? <StatusBar style={onPlate ? "light" : "auto"} /> : null;

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

  // The hero: the café's plate in its own colourway (the link's `?hue=` until the detail is in),
  // or, with no colourway known, a plain plate that the real one fades into once it is read
  // (200ms; 150ms under reduced motion, a fade either way).
  if (neutralPlate) showedNeutral.current = true;
  const plate = neutralPlate ? (
    <View aria-hidden style={{ height: coverH, backgroundColor: t.surface2 }} />
  ) : (
    <CafeCover
      cafe={{ slug, name: cafe?.name ?? "", coverImageUrl: cafe?.coverImageUrl ?? null, hue: cafe ? cafe.hue : linkHue }}
      size="hero"
      height={coverH}
      bleed
      scrim
    />
  );
  const coverEl =
    cafe && showedNeutral.current ? (
      <View style={{ height: coverH, backgroundColor: t.surface2 }}>
        <Animated.View entering={FadeIn.duration(reduced ? durations.reduced : durations.ui)}>{plate}</Animated.View>
      </View>
    ) : (
      plate
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
          <View ref={sectionRef("menu")} onLayout={measure("menu")} style={{ paddingHorizontal: space.gutter, paddingTop: PAD.menu }}>
            <MenuSection menu={cafe.menu} cart={cart} member={member} blocked={blocked} dropped={dropped} onJoinAdd={joinAdd} />
          </View>

          {/* 4 */}
          {cafe.askida.enabled ? (
            <View ref={sectionRef("aski")} onLayout={measure("aski")} style={{ paddingHorizontal: space.gutter, paddingTop: PAD.aski }}>
              <AskiPanel donation={donation} ikramProductId={member ? cart.ikramProductId : null} />
            </View>
          ) : null}

          {/* 5 */}
          <View ref={sectionRef("masa")} onLayout={measure("masa")} style={{ paddingHorizontal: space.gutter, paddingTop: PAD.masa }}>
            <MasaFeed onPostY={(id, y) => postY.current.set(id, y)} onPostNode={postRef} />
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
