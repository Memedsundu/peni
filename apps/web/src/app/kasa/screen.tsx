"use client";

import type { CafeDetailDTO, TillDTO } from "@peni/api";
import { formatLongDate, formatTL, formatTime } from "@peni/brand/format";
import { useEffect, useState } from "react";
import { api } from "./api";
import { displayLink, type DisplayLine, type DisplayState } from "./display";
import { Qr } from "./qr";
import { errorText, text, type Lang, type T } from "./text";
import { Photo } from "./ui";

const SLIDE_MS = 8_000;

const earnText = (lang: Lang, peni: number) =>
  lang === "tr" ? `Bu siparişten ${peni} penny kazanırsın.` : `You earn ${peni} pennies with this order.`;

/**
 * Müşteri ekranı: the order as the barista enters it, then thanks and the peni QR and
 * code once it's paid. When nothing is happening it slowly shows the café, its posts
 * and events, and how to get Peni (DS24).
 */
export function CustomerScreen() {
  const [lang, setLang] = useState<Lang>("tr");
  const [till, setTill] = useState<TillDTO | null>(null);
  const [cafe, setCafe] = useState<CafeDetailDTO | null>(null);
  const [state, setState] = useState<DisplayState>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const t = text(lang);

  useEffect(() => {
    const readLang = () => {
      try {
        setLang(localStorage.getItem("peni.lang") === "en" ? "en" : "tr");
      } catch {}
    };
    readLang();
    // The till's language and theme switches reach this window too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "peni.lang") readLang();
      if (e.key === "peni.theme") {
        if (e.newValue === "dark") document.documentElement.dataset.theme = "dark";
        else delete document.documentElement.dataset.theme;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    api.till
      .get()
      .then((tl) => {
        setTill(tl);
        return api.cafes.get(tl.cafe.slug).then(setCafe, () => undefined);
      })
      .catch((e) => setProblem(errorText(e, lang)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!till) return;
    const link = displayLink(till.device.id, { state: setState });
    link.send({ type: "hello" });
    return () => link.close();
  }, [till]);

  if (problem) {
    return <div className="flex h-dvh items-center justify-center p-10 text-center text-xl text-muted">{problem}</div>;
  }
  const name = till?.cafe.name ?? "";

  return (
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      {state.kind === "idle" && <Idle t={t} lang={lang} name={name} cafe={cafe} />}
      {state.kind === "order" && (
        <>
          <Lines t={t} heading={t("yourOrder")} name={name} lines={state.lines} discountKurus={state.discountKurus} totalKurus={state.totalKurus} />
          <section className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
            {state.peni || state.askidaKurus ? (
              <>
                {state.askidaKurus ? <span className="text-xl text-green">{t("askidaUsed").replace("{tl}", formatTL(state.askidaKurus))}</span> : null}
                {state.peni ? <span className="text-xl text-green">{t("peniUsed").replace("{n}", String(state.peni))}</span> : null}
                <span className="text-xl text-muted">{t("left")}</span>
                <span className="tabular font-serif text-[120px] leading-none">{formatTL(state.dueKurus ?? state.totalKurus)}</span>
              </>
            ) : (
              <>
                <span className="text-xl text-muted">{t("total")}</span>
                <span className="tabular font-serif text-[120px] leading-none">{formatTL(state.totalKurus)}</span>
              </>
            )}
          </section>
        </>
      )}
      {state.kind === "paid" && (
        <>
          <Lines
            t={t}
            heading={t("thanks")}
            name={name}
            lines={state.lines}
            discountKurus={state.discountKurus}
            totalKurus={state.totalKurus}
            footer={
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-base font-medium text-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  {state.method === "cash"
                    ? t("paidByCash")
                    : state.method === "peni"
                      ? t("paidByPeni")
                      : state.method === "askida"
                        ? t("paidByAskida")
                        : t("paidByCard")}
                </span>
                {state.peni && state.method !== "peni" ? <span className="text-base text-muted">{t("peniUsed").replace("{n}", String(state.peni))}</span> : null}
                {state.askidaKurus && state.method !== "askida" ? (
                  <span className="text-base text-muted">{t("askidaUsed").replace("{tl}", formatTL(state.askidaKurus))}</span>
                ) : null}
                {state.changeKurus !== null && state.changeKurus > 0 && (
                  <span className="tabular text-base text-muted">
                    {t("change")}: {formatTL(state.changeKurus)}
                  </span>
                )}
              </div>
            }
          />
          {state.claim ? (
            <section aria-label={t("takePeni")} className="fade-in flex flex-1 items-center gap-10 px-12 py-10">
              <Qr value={`${window.location.origin}/p/${state.claim.token}`} size={240} label={t("peniQr")} />
              <div className="flex flex-col gap-4">
                <h2 className="font-serif text-[44px] font-normal leading-[1.05]">{t("takePeni")}</h2>
                <p className="text-lg leading-normal text-muted">
                  {t("scanHelp")} <span className="font-medium text-ink">{window.location.host}/p</span>
                </p>
                <div aria-label={state.claim.code.split("").join(" ")} className="tabular text-[56px] font-semibold tracking-[0.2em]">
                  {state.claim.code}
                </div>
                <p className="text-base font-medium text-green">{earnText(lang, state.claim.peni)}</p>
              </div>
            </section>
          ) : (
            <section className="fade-in flex flex-1 items-center gap-10 px-12 py-10">
              <GetPeni t={t} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Lines({
  t,
  heading,
  name,
  lines,
  discountKurus,
  totalKurus,
  footer,
}: {
  t: T;
  heading: string;
  name: string;
  lines: DisplayLine[];
  discountKurus: number;
  totalKurus: number;
  footer?: React.ReactNode;
}) {
  return (
    <section className="flex w-[440px] shrink-0 flex-col gap-5 border-r border-line bg-panel p-10">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] text-muted">{name}</span>
        <h1 className="font-serif text-[40px] font-normal leading-[1.05]">{heading}</h1>
      </div>
      <div className="flex min-h-0 flex-col overflow-hidden text-lg">
        {lines.map((l) => (
          <div key={l.name} className="flex justify-between gap-4 border-b border-line-soft py-3">
            <span>
              {l.name} × {l.quantity}
              {l.discountPercent > 0 && <span className="text-green"> · %{l.discountPercent}</span>}
            </span>
            <span className="tabular">{formatTL(l.totalKurus)}</span>
          </div>
        ))}
        {discountKurus > 0 && (
          <div className="flex justify-between gap-4 py-3 text-green">
            <span>{t("discount")}</span>
            <span className="tabular">{formatTL(-discountKurus)}</span>
          </div>
        )}
      </div>
      <div className="mt-auto flex items-baseline justify-between">
        <span className="text-lg font-semibold">{t("total")}</span>
        <span className="tabular font-serif text-5xl leading-none">{formatTL(totalKurus)}</span>
      </div>
      {footer}
    </section>
  );
}

function GetPeni({ t }: { t: T }) {
  return (
    <>
      <Qr value={`${window.location.origin}/`} size={220} label={t("appQr")} />
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-[48px] font-normal leading-[1.05]">{t("getPeni")}</h2>
        <p className="max-w-md text-xl leading-normal text-muted">{t("getPeniBody")}</p>
        <p className="text-base font-medium text-green">{t("scanWithPhone")}</p>
      </div>
    </>
  );
}

type Slide = { key: string; render: () => React.ReactNode };

/** The café, its latest posts and events, and how to get Peni, one after another. */
function Idle({ t, lang, name, cafe }: { t: T; lang: Lang; name: string; cafe: CafeDetailDTO | null }) {
  const [i, setI] = useState(0);
  const slides: Slide[] = [
    {
      key: "welcome",
      render: () => (
        <div className="flex h-full w-full">
          <Photo src={cafe?.coverImageUrl ?? null} alt="" label={t("photo")} className="h-full w-1/2" />
          <div className="flex flex-1 flex-col justify-center gap-3 p-12">
            <span className="text-xl text-muted">{t("welcome")}</span>
            <h1 className="font-serif text-[64px] font-normal leading-[1.02]">{name}</h1>
          </div>
        </div>
      ),
    },
    ...(cafe?.posts ?? [])
      .filter((p) => p.kind !== "question")
      .slice(0, 4)
      .map((p) => ({
        key: p.id,
        render: () => (
          <div className="flex h-full w-full flex-col justify-center gap-5 px-16">
            <span className="text-lg text-green">
              {p.kind === "event" && p.eventStartsAt
                ? `${t("event")} · ${formatLongDate(p.eventStartsAt)} ${formatTime(p.eventStartsAt)}`
                : `${t("fromTheCafe")} · ${name}`}
            </span>
            {p.title && <h2 className="font-serif text-[56px] font-normal leading-[1.05]">{p.title}</h2>}
            <p className={`max-w-3xl leading-snug ${p.title ? "text-2xl text-muted" : "font-serif text-[44px]"}`}>
              {p.body.length > 180 ? `${p.body.slice(0, 177)}…` : p.body}
            </p>
          </div>
        ),
      })),
    {
      key: "app",
      render: () => (
        <div className="flex h-full w-full items-center justify-center gap-12 px-16">
          <GetPeni t={t} />
        </div>
      ),
    },
  ];
  const count = slides.length;

  useEffect(() => {
    const timer = setInterval(() => setI((x) => x + 1), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  const slide = slides[i % count]!;
  return (
    <div key={`${slide.key}-${lang}`} className="fade-in flex flex-1">
      {slide.render()}
    </div>
  );
}
