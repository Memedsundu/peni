"use client";

import { type StaffCafeAccessDTO, type StaffMeDTO } from "@peni/api";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { AskButton, AssistantProvider } from "./assistant";
import { errorText, text, type Lang, type T, type TextKey } from "./text";

export const field = "w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-ink";

/** The panel's pages, in the order the nav shows them, and who may open each. */
const PAGES = [
  // Everyone has a Bugün: alerts as far as their role sees, and today's tasks.
  { key: "bugun", href: "/panel/bugun", label: "navToday", can: () => true },
  { key: "taslaklar", href: "/panel/taslaklar", label: "navDrafts", can: (c: StaffCafeAccessDTO) => has(c, "assistant.use") },
  { key: "raporlar", href: "/panel/raporlar", label: "navReports", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "mektup", href: "/panel/mektup", label: "navLetter", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "gozcu", href: "/panel/gozcu", label: "navWatch", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "mudavimler", href: "/panel/mudavimler", label: "navRegulars", can: (c: StaffCafeAccessDTO) => has(c, "reports.view") },
  { key: "menu", href: "/panel/menu", label: "menu", can: (c: StaffCafeAccessDTO) => has(c, "menu.edit") || has(c, "menu.recipes") },
  { key: "faturalar", href: "/panel/faturalar", label: "bills", can: (c: StaffCafeAccessDTO) => has(c, "bills.view") },
  { key: "borclar", href: "/panel/borclar", label: "debts", can: (c: StaffCafeAccessDTO) => has(c, "debts.view") },
  { key: "nakit", href: "/panel/nakit", label: "money", can: (c: StaffCafeAccessDTO) => has(c, "cash.manage") },
  { key: "kapanis", href: "/panel/kapanis", label: "months", can: (c: StaffCafeAccessDTO) => has(c, "cash.manage") },
  { key: "tedarikciler", href: "/panel/tedarikciler", label: "suppliers", can: (c: StaffCafeAccessDTO) => has(c, "suppliers.view") },
  { key: "stok", href: "/panel/stok", label: "stock", can: (c: StaffCafeAccessDTO) => has(c, "stock.view") },
  { key: "vardiyalar", href: "/panel/vardiyalar", label: "shifts", can: (c: StaffCafeAccessDTO) => has(c, "shifts.view") },
  // Everyone sees their own hours and pay; some see everyone's.
  { key: "puantaj", href: "/panel/puantaj", label: "pay", can: () => true },
  { key: "gorevler", href: "/panel/gorevler", label: "navTasks", can: (c: StaffCafeAccessDTO) => has(c, "tasks.view") },
  { key: "topluluk", href: "/panel/topluluk", label: "community", can: (c: StaffCafeAccessDTO) => has(c, "posts.write") || has(c, "posts.moderate") },
] as const satisfies readonly { key: string; href: string; label: TextKey; can: (c: StaffCafeAccessDTO) => boolean }[];

export type PanelPage = (typeof PAGES)[number]["key"];

export function has(cafe: StaffCafeAccessDTO, permission: string): boolean {
  return cafe.permissions.includes(permission);
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
  const can = PAGES.find((p) => p.key === page)!.can;
  const cafes = me && me !== "signed-out" ? me.cafes.filter(can) : [];
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
  else if (cafes.length === 0) body = <Notice>{t(page === "topluluk" ? "noAccess" : "noAccessPage")}</Notice>;
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

  const nav = cafe ? PAGES.filter((p) => p.can(cafe)) : [];
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
          {nav.length > 1 && (
            <nav aria-label={t("panel")} className="-mx-1 flex gap-1 overflow-x-auto">
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
            </nav>
          )}
        </header>
        {body}
      </main>
    </AssistantProvider>
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
