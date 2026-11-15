"use client";

import { type CafePlanKey, type StaffCafeAccessDTO, type StaffMeDTO } from "@peni/api";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { AskButton, AssistantProvider } from "./assistant";
import { errorText, fill, text, type Lang, type T, type TextKey } from "./text";

export const field = "w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-ink";

const PLAN_ORDER: readonly CafePlanKey[] = ["topluluk", "penny", "isletme"];

/** The menu's groups, in order. The first has no heading: it's where the day starts. */
const GROUPS = [
  { key: "day", label: null },
  { key: "insights", label: "navGroupInsights" },
  { key: "money", label: "navGroupMoney" },
  { key: "products", label: "navGroupProducts" },
  { key: "team", label: "navGroupTeam" },
  { key: "cafe", label: "navGroupCafe" },
  // Last and without a heading: what's yours, not the café's.
  { key: "me", label: null },
] as const satisfies readonly { key: string; label: TextKey | null }[];

type Group = (typeof GROUPS)[number]["key"];

/** The panel's pages, in the order the menu shows them: its group, the lowest plan that has each (N11), and who may open each. */
const PAGES = [
  // Everyone has a Bugün: alerts as far as their role sees, and today's tasks.
  { key: "bugun", group: "day", href: "/panel/bugun", label: "navToday", plan: "topluluk", can: () => true },
  { key: "taslaklar", group: "day", href: "/panel/taslaklar", label: "navDrafts", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "assistant.use") },
  { key: "raporlar", group: "insights", href: "/panel/raporlar", label: "navReports", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "mektup", group: "insights", href: "/panel/mektup", label: "navLetter", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "gozcu", group: "insights", href: "/panel/gozcu", label: "navWatch", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "mudavimler", group: "insights", href: "/panel/mudavimler", label: "navRegulars", plan: "penny", can: (c: StaffCafeAccessDTO) => has(c, "regulars.view") },
  { key: "faturalar", group: "money", href: "/panel/faturalar", label: "bills", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "bills.view") },
  { key: "borclar", group: "money", href: "/panel/borclar", label: "debts", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "debts.view") },
  { key: "nakit", group: "money", href: "/panel/nakit", label: "money", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "cash.manage") },
  { key: "kapanis", group: "money", href: "/panel/kapanis", label: "months", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "cash.manage") },
  { key: "tedarikciler", group: "money", href: "/panel/tedarikciler", label: "suppliers", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "suppliers.view") },
  { key: "menu", group: "products", href: "/panel/menu", label: "menu", plan: "penny", can: (c: StaffCafeAccessDTO) => has(c, "menu.edit") || has(c, "menu.recipes") },
  { key: "stok", group: "products", href: "/panel/stok", label: "stock", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "stock.view") },
  { key: "vardiyalar", group: "team", href: "/panel/vardiyalar", label: "shifts", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "shifts.view") },
  // Everyone sees their own hours and pay; some see everyone's.
  { key: "puantaj", group: "team", href: "/panel/puantaj", label: "pay", plan: "isletme", can: () => true },
  { key: "gorevler", group: "team", href: "/panel/gorevler", label: "navTasks", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "tasks.view") },
  { key: "topluluk", group: "cafe", href: "/panel/topluluk", label: "community", plan: "topluluk", can: (c: StaffCafeAccessDTO) => has(c, "posts.write") || has(c, "posts.moderate") },
  { key: "penny", group: "cafe", href: "/panel/penny", label: "navPenny", plan: "penny", can: (c: StaffCafeAccessDTO) => has(c, "peni.till") },
  { key: "cihazlar", group: "cafe", href: "/panel/cihazlar", label: "navDevices", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "devices.manage") },
  { key: "plan", group: "cafe", href: "/panel/plan", label: "navPlan", plan: "topluluk", can: (c: StaffCafeAccessDTO) => c.role === "owner" },
  // Everyone has one: their till PIN and their password.
  { key: "hesap", group: "me", href: "/panel/hesap", label: "navAccount", plan: "topluluk", can: () => true },
] as const satisfies readonly { key: string; group: Group; href: string; label: TextKey; plan: CafePlanKey; can: (c: StaffCafeAccessDTO) => boolean }[];

/** With this few pages the menu is one short list; headings would only add noise. */
const FLAT_MENU = 5;

/** Whether this person may open the page at this café: in its plan, and allowed for their role. */
function opens(page: (typeof PAGES)[number], cafe: StaffCafeAccessDTO): boolean {
  return inPlan(page, cafe) && page.can(cafe);
}

function inPlan(page: (typeof PAGES)[number], cafe: StaffCafeAccessDTO): boolean {
  return PLAN_ORDER.indexOf(cafe.plan.now) >= PLAN_ORDER.indexOf(page.plan);
}

export type PanelPage = (typeof PAGES)[number]["key"];

export function has(cafe: StaffCafeAccessDTO, permission: string): boolean {
  return cafe.permissions.includes(permission);
}

/** Whole days left in the café's trial, counting today; 0 when there's none running. */
export function trialDaysLeft(cafe: StaffCafeAccessDTO, now = new Date()): number {
  const end = cafe.plan.trialEndsAt ? new Date(cafe.plan.trialEndsAt).getTime() : 0;
  return end > now.getTime() ? Math.ceil((end - now.getTime()) / 86_400_000) : 0;
}

export function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>("tr");
  useEffect(() => {
    try {
      if (localStorage.getItem("peni.lang") === "en") setLang("en");
    } catch {}
  }, []);
  return [
    lang,
    () =>
      setLang((l) => {
        const next = l === "tr" ? "en" : "tr";
        try {
          localStorage.setItem("peni.lang", next);
        } catch {}
        return next;
      }),
  ];
}

export function when(iso: string, lang: Lang) {
  return new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export type PanelProps = {
  cafe: StaffCafeAccessDTO;
  t: T;
  lang: Lang;
  /** A call came back 401: show the sign-in again. */
  signedOut: () => void;
};

/**
 * The café panel's frame: staff sign-in, which café (`?kafe=`), the menu of pages this person
 * may open there (at the side on a computer, behind one button on a phone), and the language
 * switch. Each page fills in the rest.
 */
export function PanelShell({ cafeSlug, page, wide = false, children }: { cafeSlug: string | null; page: PanelPage; wide?: boolean; children: (p: PanelProps) => ReactNode }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [me, setMe] = useState<StaffMeDTO | null | "signed-out">(null);
  const [slug, setSlug] = useState<string | null>(cafeSlug);

  useEffect(() => {
    api.staff.me().then(setMe, () => setMe("signed-out"));
  }, []);
  const here = PAGES.find((p) => p.key === page)!;
  const cafes = me && me !== "signed-out" ? me.cafes.filter((c) => opens(here, c)) : [];
  // The page isn't in the plan of the café asked for (or of the only cafés there are): say so (N11).
  const asked = me && me !== "signed-out" && slug ? me.cafes.find((c) => c.slug === slug) : undefined;
  const locked =
    asked && !inPlan(here, asked) ? asked : !cafes.length && me && me !== "signed-out" ? me.cafes.find((c) => !inPlan(here, c)) : undefined;
  useEffect(() => {
    if (cafes.length === 1 && !slug) setSlug(cafes[0]!.slug);
  }, [cafes, slug]);
  const cafe = cafes.find((c) => c.slug === slug) ?? null;

  const signOut = async () => {
    await api.staff.signOut().catch(() => undefined);
    setMe("signed-out");
  };

  let body;
  if (me === null) body = <p className="text-muted">{t("loading")}</p>;
  else if (me === "signed-out") body = <SignIn t={t} lang={lang} onDone={setMe} />;
  else if (locked || cafes.length === 0) {
    body = locked ? (
      <section className="flex flex-col gap-4">
        <Notice>{t("planLockedPage")}</Notice>
        {locked.role === "owner" && (
          <a href={`/panel/plan?kafe=${encodeURIComponent(locked.slug)}`} className="inline-flex min-h-12 items-center self-start rounded-full border border-line px-5 font-semibold">
            {t("planSee")}
          </a>
        )}
      </section>
    ) : (
      <Notice>{t(page === "topluluk" ? "noAccess" : "noAccessPage")}</Notice>
    );
  }
  else if (!cafe) {
    body = (
      <section className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl">{t("whichCafe")}</h1>
        {cafes.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => {
              setSlug(c.slug);
              // A reload stays on this café.
              window.history.replaceState(null, "", `?kafe=${encodeURIComponent(c.slug)}`);
            }}
            className="flex min-h-16 cursor-pointer items-center rounded-2xl border border-line bg-paper px-5 text-left text-lg"
          >
            {c.name}
          </button>
        ))}
      </section>
    );
  } else body = children({ cafe, t, lang, signedOut: () => setMe("signed-out") });

  const pages = cafe ? PAGES.filter((p) => opens(p, cafe)) : [];
  // The menu is there once there's more than one place to go.
  const menu: PanelMenu | null =
    cafe && pages.length > 1
      ? { cafe, pages, till: has(cafe, "devices.manage"), switchHref: me && me !== "signed-out" && me.cafes.length > 1 ? here.href : null }
      : null;
  const [pagesOpen, setPagesOpen] = useState(false);
  const closePages = useCallback(() => setPagesOpen(false), []);
  // The side menu scrolls by itself on a short screen; keep this page's link in view.
  useEffect(() => {
    document.querySelector<HTMLElement>('aside nav a[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pages.length]);
  // The assistant opens from every page, for those who may use it here (piece 29).
  const assistantCafe = cafe && has(cafe, "assistant.use") ? cafe : null;
  const width = wide ? "max-w-4xl" : "max-w-2xl";
  const account = (
    <>
      {me && me !== "signed-out" && (
        <Button kind="bare" size="sm" onClick={() => void signOut()}>
          {t("signOut")}
        </Button>
      )}
      <Button kind="bare" size="sm" onClick={toggleLang} aria-label={lang === "tr" ? "English" : "Türkçe"}>
        {lang === "tr" ? "EN" : "TR"}
      </Button>
    </>
  );
  return (
    <AssistantProvider cafe={assistantCafe} t={t} lang={lang} signedOut={() => setMe("signed-out")}>
      <div className="lg:flex">
        {menu && (
          // On a computer the pages stay at the side, in their groups.
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line-soft bg-panel lg:flex">
            <div className="px-5 pt-6 pb-4">
              <Brand menu={menu} t={t} />
            </div>
            <div className="px-3 pb-3 empty:hidden">
              <AskButton t={t} full />
            </div>
            <nav aria-label={t("panel")} className="flex-1 overflow-y-auto px-3 pb-4">
              <MenuLinks menu={menu} page={page} t={t} />
            </nav>
            <div className="flex items-center justify-between border-t border-line-soft px-2 py-1.5">{account}</div>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          {/* On a phone: where you are, the assistant, and one button for the pages. */}
          <header className={`mx-auto flex w-full items-center justify-between gap-3 px-4 pt-4 sm:px-6 ${width} ${menu ? "lg:hidden" : ""}`}>
            {menu ? (
              <Brand menu={menu} t={t} />
            ) : (
              <span className="flex min-w-0 items-baseline gap-3">
                <a href="/" className="font-serif text-2xl">
                  penny
                </a>
                <span className="truncate text-sm text-muted">{cafe ? cafe.name : t("panel")}</span>
              </span>
            )}
            <span className="flex shrink-0 items-center gap-1">
              <AskButton t={t} />
              {menu ? (
                <Button kind="quiet" size="sm" aria-haspopup="dialog" onClick={() => setPagesOpen(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                  {t("navPages")}
                </Button>
              ) : (
                account
              )}
            </span>
          </header>
          <main className={`mx-auto flex w-full flex-col gap-8 px-4 pt-6 pb-16 sm:px-6 lg:pt-10 ${width}`}>
            {cafe && cafe.role === "owner" && page !== "plan" && <TrialLine cafe={cafe} t={t} />}
            {body}
          </main>
        </div>
      </div>
      {menu && pagesOpen && (
        <PagesSheet menu={menu} page={page} t={t} onClose={closePages}>
          {account}
        </PagesSheet>
      )}
    </AssistantProvider>
  );
}

/** What the menu shows for this person at this café. */
type PanelMenu = {
  cafe: StaffCafeAccessDTO;
  pages: (typeof PAGES)[number][];
  /** The till runs at /kasa, on a computer set up as one; owners reach it from here. */
  till: boolean;
  /** Where the "which café?" list is, for someone at more than one. */
  switchHref: string | null;
};

/** The wordmark with the café under it, so every page says where you are. */
function Brand({ menu, t }: { menu: PanelMenu; t: T }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <a href="/" className="font-serif text-2xl leading-none">
        penny
      </a>
      <span className="truncate text-sm leading-tight text-muted">{menu.cafe.name}</span>
      {menu.switchHref && (
        <a href={menu.switchHref} className="hidden self-start text-xs font-semibold underline underline-offset-4 lg:inline">
          {t("navSwitchCafe")}
        </a>
      )}
    </span>
  );
}

/** Which groups someone left open in the side menu, kept in this browser. */
const OPEN_GROUPS = "peni.menu.open";

/**
 * The pages this person may open, in their groups. At the side of a computer screen the groups
 * fold, so the menu is a handful of lines with the group you're in open; on a phone (`tiles`)
 * it's one screen with everything, in two columns of big targets.
 */
function MenuLinks({ menu, page, t, tiles = false }: { menu: PanelMenu; page: PanelPage; t: T; tiles?: boolean }) {
  const current = PAGES.find((p) => p.key === page)!.group;
  const [open, setOpen] = useState<readonly string[]>(() => {
    try {
      const kept: unknown = JSON.parse(localStorage.getItem(OPEN_GROUPS) ?? "[]");
      return Array.isArray(kept) ? [...new Set([...kept.filter((k) => typeof k === "string"), current])] : [current];
    } catch {
      return [current];
    }
  });
  const toggle = (group: string) =>
    setOpen((was) => {
      const next = was.includes(group) ? was.filter((g) => g !== group) : [...was, group];
      try {
        localStorage.setItem(OPEN_GROUPS, JSON.stringify(next));
      } catch {}
      return next;
    });

  const shape = tiles ? "min-h-12 rounded-2xl px-4" : "min-h-9 rounded-xl px-3 text-[15px]";
  const rest = tiles ? "bg-panel active:bg-tile" : "hover:bg-tile";
  const link = (p: (typeof PAGES)[number]) => (
    <li key={p.key}>
      <a
        href={`${p.href}?kafe=${encodeURIComponent(menu.cafe.slug)}`}
        aria-current={p.key === page ? "page" : undefined}
        className={`flex items-center ${shape} ${p.key === page ? "bg-ink font-semibold text-paper" : rest}`}
      >
        {t(p.label)}
      </a>
    </li>
  );
  // A new tab, because setting a till up signs that browser out of the panel.
  const till = menu.till && (
    <li key="till">
      <a href="/kasa" target="_blank" rel="noopener" className={`flex items-center gap-1 ${shape} ${rest}`}>
        {t("navTill")}
        <span aria-hidden="true">↗</span>
        <span className="sr-only">{t("newTab")}</span>
      </a>
    </li>
  );
  const list = tiles ? "grid grid-cols-2 gap-2" : "flex flex-col gap-px";
  if (menu.pages.length <= FLAT_MENU)
    return (
      <ul className={list}>
        {menu.pages.map(link)}
        {till}
      </ul>
    );
  return (
    <div className={`flex flex-col ${tiles ? "gap-5" : "gap-px"}`}>
      {GROUPS.map((g) => {
        const here = menu.pages.filter((p) => p.group === g.key);
        const withTill = g.key === "cafe" && till;
        if (!here.length && !withTill) return null;
        const id = `${tiles ? "sheet" : "side"}-${g.key}`;
        if (!g.label)
          return (
            // The last group ("Hesabım") sits a little apart from the café's pages.
            <ul key={g.key} className={`${list} ${g.key === "me" && !tiles ? "mt-3 border-t border-line-soft pt-3" : ""}`}>
              {here.map(link)}
            </ul>
          );
        if (tiles)
          return (
            <div key={g.key} className="flex flex-col gap-1.5">
              <p id={id} className="px-1 text-xs font-semibold text-muted">
                {t(g.label)}
              </p>
              <ul className={list} aria-labelledby={id}>
                {here.map(link)}
                {withTill}
              </ul>
            </div>
          );
        const shown = open.includes(g.key);
        return (
          <div key={g.key} className="flex flex-col gap-px">
            <button
              type="button"
              id={id}
              aria-expanded={shown}
              aria-controls={`${id}-pages`}
              onClick={() => toggle(g.key)}
              // Folded with this page inside it: the group's name says where you are.
              className={`flex cursor-pointer items-center justify-between text-left ${shape} ${rest} ${!shown && g.key === current ? "font-semibold" : ""}`}
            >
              {t(g.label)}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-muted transition-transform ${shown ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {shown && (
              <ul id={`${id}-pages`} aria-labelledby={id} className={`${list} mb-1 ml-3 border-l border-line pl-2`}>
                {here.map(link)}
                {withTill}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** On a phone: every page on one screen, opened from the "Sayfalar" button. Escape closes it. */
function PagesSheet({ menu, page, t, onClose, children }: { menu: PanelMenu; page: PanelPage; t: T; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Turned or widened into the computer layout: the side menu takes over.
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => wide.matches && onClose();
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = before;
    };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={t("navPages")} className="fixed inset-0 z-40 overflow-y-auto bg-paper lg:hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-8 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Brand menu={menu} t={t} />
          <Button kind="quiet" size="sm" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            {t("close")}
          </Button>
        </div>
        <nav aria-label={t("panel")}>
          <MenuLinks menu={menu} page={page} t={t} tiles />
        </nav>
        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-3">
          {menu.switchHref ? (
            <a href={menu.switchHref} className="inline-flex min-h-11 items-center px-1 text-sm font-semibold underline underline-offset-4">
              {t("navSwitchCafe")}
            </a>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-1">{children}</span>
        </div>
      </div>
    </div>
  );
}

/** The owner's reminder while a trial runs, and once it has ended without a paid plan. */
function TrialLine({ cafe, t }: { cafe: StaffCafeAccessDTO; t: T }) {
  const left = trialDaysLeft(cafe);
  const ended = !left && !!cafe.plan.trialEndsAt && cafe.plan.paid === "topluluk";
  if (!left && !ended) return null;
  const words = ended ? t("planTrialOver") : left === 1 ? t("planTrialLastDay") : fill(t("planTrialLeft"), { n: left });
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 rounded-2xl bg-panel px-4 py-2.5 text-sm">
      <span>{words}</span>
      <a href={`/panel/plan?kafe=${encodeURIComponent(cafe.slug)}`} className="font-semibold underline underline-offset-4">
        {t("planSee")}
      </a>
    </p>
  );
}

function SignIn({ t, lang, onDone }: { t: T; lang: Lang; onDone: (me: StaffMeDTO) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        api.staff
          .signIn({ email, password })
          .then(onDone, (err: unknown) => setError(errorText(err, lang)))
          .finally(() => setBusy(false));
      }}
    >
      <h1 className="font-serif text-4xl">{t("signInTitle")}</h1>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("email")}
        <input className={`${field} min-h-12`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("password")}
        <input className={`${field} min-h-12`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <Notice tone="red">{error}</Notice>}
      <Button kind="primary" size="lg" type="submit" disabled={busy}>
        {t("signIn")}
      </Button>
    </form>
  );
}
