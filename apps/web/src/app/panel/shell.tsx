"use client";

import { type CafePlanKey, type StaffCafeAccessDTO, type StaffMeDTO } from "@peni/api";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { AskButton, AssistantProvider } from "./assistant";
import { errorText, fill, text, type Lang, type T, type TextKey } from "./text";

export const field = "w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-ink";

const PLAN_ORDER: readonly CafePlanKey[] = ["topluluk", "penny", "isletme"];

/** The panel's pages, in the order the nav shows them, the lowest plan that has each (N11), and who may open each. */
const PAGES = [
  // Everyone has a Bugün: alerts as far as their role sees, and today's tasks.
  { key: "bugun", href: "/panel/bugun", label: "navToday", plan: "topluluk", can: () => true },
  { key: "taslaklar", href: "/panel/taslaklar", label: "navDrafts", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "assistant.use") },
  { key: "raporlar", href: "/panel/raporlar", label: "navReports", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "mektup", href: "/panel/mektup", label: "navLetter", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "gozcu", href: "/panel/gozcu", label: "navWatch", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "mudavimler", href: "/panel/mudavimler", label: "navRegulars", plan: "penny", can: (c: StaffCafeAccessDTO) => has(c, "regulars.view") },
  { key: "menu", href: "/panel/menu", label: "menu", plan: "penny", can: (c: StaffCafeAccessDTO) => has(c, "menu.edit") || has(c, "menu.recipes") },
  { key: "faturalar", href: "/panel/faturalar", label: "bills", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "bills.view") },
  { key: "borclar", href: "/panel/borclar", label: "debts", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "debts.view") },
  { key: "nakit", href: "/panel/nakit", label: "money", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "cash.manage") },
  { key: "kapanis", href: "/panel/kapanis", label: "months", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "cash.manage") },
  { key: "tedarikciler", href: "/panel/tedarikciler", label: "suppliers", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "suppliers.view") },
  { key: "stok", href: "/panel/stok", label: "stock", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "stock.view") },
  { key: "vardiyalar", href: "/panel/vardiyalar", label: "shifts", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "shifts.view") },
  // Everyone sees their own hours and pay; some see everyone's.
  { key: "puantaj", href: "/panel/puantaj", label: "pay", plan: "isletme", can: () => true },
  { key: "gorevler", href: "/panel/gorevler", label: "navTasks", plan: "isletme", can: (c: StaffCafeAccessDTO) => has(c, "tasks.view") },
  { key: "topluluk", href: "/panel/topluluk", label: "community", plan: "topluluk", can: (c: StaffCafeAccessDTO) => has(c, "posts.write") || has(c, "posts.moderate") },
  { key: "plan", href: "/panel/plan", label: "navPlan", plan: "topluluk", can: (c: StaffCafeAccessDTO) => c.role === "owner" },
] as const satisfies readonly { key: string; href: string; label: TextKey; plan: CafePlanKey; can: (c: StaffCafeAccessDTO) => boolean }[];

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
 * The café panel's frame: staff sign-in, which café (`?kafe=`), the header with the pages
 * this person may open there, and the language switch. Each page fills in the rest.
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

  const nav = cafe ? PAGES.filter((p) => opens(p, cafe)) : [];
  // On a phone the nav scrolls; keep this page's tab in view.
  useEffect(() => {
    document.querySelector<HTMLElement>('nav a[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [nav.length]);
  // The assistant opens from every page, for those who may use it here (piece 29).
  const assistantCafe = cafe && has(cafe, "assistant.use") ? cafe : null;
  return (
    <AssistantProvider cafe={assistantCafe} t={t} lang={lang} signedOut={() => setMe("signed-out")}>
      <main className={`mx-auto flex min-h-dvh w-full flex-col gap-8 px-4 pt-5 pb-16 sm:px-6 ${wide ? "max-w-4xl" : "max-w-2xl"}`}>
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-baseline gap-3">
              <a href="/" className="font-serif text-2xl">
                penny
              </a>
              <span className="text-sm text-muted">{t("panel")}</span>
            </span>
            <span className="flex items-center gap-1">
              <AskButton t={t} />
              {me && me !== "signed-out" && (
                <Button kind="bare" size="sm" onClick={() => void signOut()}>
                  {t("signOut")}
                </Button>
              )}
              <Button kind="bare" size="sm" onClick={toggleLang} aria-label={lang === "tr" ? "English" : "Türkçe"}>
                {lang === "tr" ? "EN" : "TR"}
              </Button>
            </span>
          </div>
          {cafe && cafe.role === "owner" && page !== "plan" && <TrialLine cafe={cafe} t={t} />}
          {nav.length > 1 && (
            // relative: the till link's hidden label scrolls with the nav instead of widening the page.
            <nav aria-label={t("panel")} className="relative -mx-1 flex gap-1 overflow-x-auto">
              {nav.map((p) => (
                <a
                  key={p.key}
                  href={`${p.href}?kafe=${encodeURIComponent(cafe!.slug)}`}
                  aria-current={p.key === page ? "page" : undefined}
                  className={`flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap ${p.key === page ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                >
                  {t(p.label)}
                </a>
              ))}
              {/* The till runs at /kasa, on a computer set up as one; owners reach it from here. A new tab, because setting a till up signs that browser out of the panel. */}
              {has(cafe!, "devices.manage") && (
                <a
                  href="/kasa"
                  target="_blank"
                  rel="noopener"
                  className="flex min-h-11 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-semibold whitespace-nowrap text-muted hover:text-ink"
                >
                  {t("navTill")}
                  <span aria-hidden="true">↗</span>
                  <span className="sr-only">{t("newTab")}</span>
                </a>
              )}
            </nav>
          )}
        </header>
        {body}
      </main>
    </AssistantProvider>
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
