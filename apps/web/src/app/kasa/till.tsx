"use client";

import { PeniApiError, type CashStateDTO, type StaffMeDTO, type TaskDayDTO, type TillDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Cash } from "./cash";
import { Sales } from "./sales";
import { Sell } from "./sell";
import { Setup } from "./setup";
import { TillScan } from "./scan";
import { TillTasks } from "./tasks";
import { SignIn } from "./sign-in";
import { errorText, text, type Lang, type T } from "./text";
import { Button } from "./ui";

type Stage =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  /** This computer isn't a till yet. */
  | { kind: "setup" }
  /** Names to tap, then a PIN. */
  | { kind: "signIn"; till: TillDTO }
  | { kind: "open"; till: TillDTO; me: StaffMeDTO };

/** Ends in "signed out" when a call says the shift's PIN session is over. */
export function isSignedOut(error: unknown): boolean {
  return error instanceof PeniApiError && (error.status === 401 || error.code === "NOT_STAFF");
}

export function Till() {
  const [lang, setLang] = useState<Lang>("tr");
  const [dark, setDark] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [view, setView] = useState<"sell" | "sales" | "cash" | "tasks" | "scan">("sell");
  /** The drawer, for the "closed" note on the till and the Kasa view. */
  const [cash, setCash] = useState<CashStateDTO | null>(null);
  const t = text(lang);

  useEffect(() => {
    try {
      if (localStorage.getItem("peni.lang") === "en") setLang("en");
      setDark(document.documentElement.dataset.theme === "dark");
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setStage({ kind: "loading" });
    let till: TillDTO;
    try {
      till = await api.till.get();
    } catch (error) {
      if (error instanceof PeniApiError && error.code === "DEVICE_UNKNOWN") return setStage({ kind: "setup" });
      return setStage({ kind: "failed", message: errorText(error, lang) });
    }
    const me = await api.staff.me().catch(() => null);
    // Only a PIN session made on this till opens it; anything else starts at the names.
    if (me?.signedInWith === "pin" && me.cafes[0]?.slug === till.cafe.slug) setStage({ kind: "open", till, me });
    else setStage({ kind: "signIn", till });
  }, [lang]);

  useEffect(() => {
    void load();
    // Load once; a language switch doesn't reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lock = useCallback(async () => {
    await api.till.lock().catch(() => undefined);
    setView("sell");
    await load();
  }, [load]);

  const onError = useCallback(
    (error: unknown): string | null => {
      if (isSignedOut(error)) {
        void lock();
        return null;
      }
      return errorText(error, lang);
    },
    [lang, lock],
  );

  const switchLang = () => {
    const next = lang === "tr" ? "en" : "tr";
    setLang(next);
    try {
      localStorage.setItem("peni.lang", next);
    } catch {}
  };
  const switchTheme = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("peni.theme", next ? "dark" : "light");
    } catch {}
  };

  const cafeName = stage.kind === "signIn" || stage.kind === "open" ? stage.till.cafe.name : null;
  const access = stage.kind === "open" ? stage.me.cafes[0] : undefined;
  const slug = stage.kind === "open" ? stage.till.cafe.slug : null;
  const canDrawer = !!access?.permissions.includes("cash.drawer");

  const loadCash = useCallback(async () => {
    if (!slug || !canDrawer) return setCash(null);
    try {
      setCash(await api.staff.cash.get(slug));
    } catch {
      // The till still sells; the note about the drawer just doesn't show.
    }
  }, [slug, canDrawer]);
  useEffect(() => {
    void loadCash();
  }, [loadCash]);

  /** How many of today's tasks are left, for the header button. */
  const canTasks = !!access?.permissions.includes("tasks.view");
  const [tasksLeft, setTasksLeft] = useState<number | null>(null);
  const countTasks = useCallback((d: TaskDayDTO) => setTasksLeft(d.lists.reduce((s, l) => s + l.total - l.done, 0)), []);
  useEffect(() => {
    if (!slug || !canTasks) return setTasksLeft(null);
    api.staff.tasks.day(slug).then(countTasks, () => setTasksLeft(null));
  }, [slug, canTasks, countTasks]);

  /** "Fatura" shows when the barista adds bills and the assistant is on. */
  const canBills = !!access?.permissions.includes("bills.add");
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    if (!slug || !canBills) return setCanScan(false);
    api.staff.drafts.mine(slug).then(
      (d) => setCanScan(d.ai !== "off"),
      () => setCanScan(false),
    );
  }, [slug, canBills]);

  const title =
    stage.kind !== "open"
      ? t("title")
      : view === "sales"
        ? t("sales")
        : view === "cash"
          ? t("drawer")
          : view === "tasks"
            ? t("tasks")
            : view === "scan"
              ? t("scanTitle")
              : t("title");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-serif text-[26px] leading-none">penny</span>
          <span className="truncate text-[15px] text-muted">
            {cafeName ? `${cafeName} · ` : ""}
            {title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted">
          {stage.kind === "open" && access && (
            <>
              <span className="mr-2 hidden sm:inline">
                {t(`role_${access.role}`)}: <span className="text-ink">{stage.me.account.name.split(" ")[0]}</span>
              </span>
              <Button size="sm" onClick={() => window.open("/kasa/ekran", "peni-customer-screen", "popup=yes,width=1024,height=600")}>
                {t("openScreen")}
              </Button>
              {view !== "sell" && (
                <Button size="sm" onClick={() => setView("sell")}>
                  {t("backToTill")}
                </Button>
              )}
              {view !== "sales" && access.permissions.includes("till.history") && (
                <Button size="sm" onClick={() => setView("sales")}>
                  {t("sales")}
                </Button>
              )}
              {view !== "tasks" && canTasks && (
                <Button size="sm" onClick={() => setView("tasks")}>
                  {t("tasks")}
                  {tasksLeft !== null && tasksLeft > 0 && <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-paper tabular">{tasksLeft}</span>}
                </Button>
              )}
              {view !== "scan" && canScan && (
                <Button size="sm" onClick={() => setView("scan")}>
                  {t("scanTitle")}
                </Button>
              )}
              {view !== "cash" && canDrawer && (
                <Button size="sm" onClick={() => setView("cash")}>
                  {t("drawer")}
                </Button>
              )}
              <Button size="sm" onClick={() => void lock()}>
                {t("signOut")}
              </Button>
            </>
          )}
          <Button size="sm" kind="bare" onClick={switchLang} aria-label={lang === "tr" ? "English" : "Türkçe"}>
            {lang === "tr" ? "EN" : "TR"}
          </Button>
          <Button size="sm" kind="bare" onClick={switchTheme} aria-label={dark ? t("darkOff") : t("darkOn")}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {dark ? (
                <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />
              ) : (
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
              )}
            </svg>
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        {stage.kind === "loading" && <Centered>{t("loading")}</Centered>}
        {stage.kind === "failed" && (
          <Centered>
            <p>{stage.message}</p>
            <Button kind="primary" onClick={() => void load()}>
              {t("retry")}
            </Button>
          </Centered>
        )}
        {stage.kind === "setup" && <Setup t={t} lang={lang} onDone={() => void load()} />}
        {stage.kind === "signIn" && <SignIn t={t} lang={lang} till={stage.till} onSignedIn={(me) => setStage({ kind: "open", till: stage.till, me })} />}
        {/* Kept mounted behind the other views, so the order on screen survives a look at Kasa or Satışlar. */}
        {stage.kind === "open" && (
          <div className={view === "sell" ? "contents" : "hidden"}>
            <Sell
              t={t}
              slug={stage.till.cafe.slug}
              onError={onError}
              lang={lang}
              deviceId={stage.till.device.id}
              drawerClosed={cash !== null && cash.open === null}
              onOpenDrawer={() => setView("cash")}
              onDrawerChanged={() => void loadCash()}
            />
          </div>
        )}
        {stage.kind === "open" && view === "sales" && <Sales t={t} slug={stage.till.cafe.slug} onError={onError} lang={lang} />}
        {stage.kind === "open" && view === "tasks" && <TillTasks t={t} slug={stage.till.cafe.slug} onError={onError} lang={lang} onChanged={countTasks} />}
        {stage.kind === "open" && view === "scan" && <TillScan t={t} slug={stage.till.cafe.slug} onError={onError} lang={lang} />}
        {stage.kind === "open" && view === "cash" && <Cash t={t} slug={stage.till.cafe.slug} onError={onError} lang={lang} state={cash} onChanged={setCash} />}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center text-muted">{children}</div>;
}

export type TillProps = { t: T; lang: Lang; slug: string; onError: (error: unknown) => string | null };
