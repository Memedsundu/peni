"use client";

import { PeniApiError, type LetterDTO, type LetterLinkDTO, type LettersDTO } from "@peni/api";
import { useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Notice } from "../../kasa/ui";
import { rangeLabel } from "../amounts";
import { PAGE_LABEL } from "../assistant";
import { PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T } from "../text";

/** While last week's letter is being written, look again this often. */
const POLL_MS = 2500;

/**
 * The weekly letter (plan piece 30, B10): what changed last week, probably why, and one
 * thing to do, each point with links to the records behind it. Earlier letters below.
 */
export function Letters({ cafeSlug, week }: { cafeSlug: string | null; week: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="mektup">
      {(p) => <LettersPage key={p.cafe.slug} {...p} initial={week} />}
    </PanelShell>
  );
}

function LettersPage({ cafe, t, lang, signedOut, initial }: PanelProps & { initial: string | null }) {
  const [week, setWeek] = useState<string | null>(initial);
  const [data, setData] = useState<LettersDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api.staff.letters(cafe.slug, week ?? undefined).then(
        (d) => {
          if (gone) return;
          setData(d);
          setError(null);
          if (d.state === "writing") timer = setTimeout(load, POLL_MS);
        },
        (e: unknown) => {
          if (gone) return;
          if (e instanceof PeniApiError && e.status === 401) signedOut();
          else setError(errorText(e, lang));
        },
      );
    void load();
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [cafe.slug, week]);

  const open = (w: string) => {
    setWeek(w);
    window.history.replaceState(null, "", `?kafe=${encodeURIComponent(cafe.slug)}&hafta=${w}`);
    window.scrollTo({ top: 0 });
  };
  const status: Record<Exclude<LettersDTO["state"], "ready">, string> = {
    writing: t("ltWriting"),
    failed: t("ltFailed"),
    quiet: t("ltQuiet"),
    off: t("ltOff"),
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("ltTitle")}</h1>
        <p className="leading-normal text-muted">{t("ltHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && data.state !== "ready" && !week && (
        <p className={`flex items-center gap-2 rounded-3xl bg-panel px-5 py-4 ${data.state === "failed" ? "text-red" : "text-muted"}`} role="status">
          {data.state === "writing" && <span className="inline-block size-2 animate-pulse rounded-full bg-green" />}
          {status[data.state]}
        </p>
      )}
      {data?.letter && <Letter letter={data.letter} t={t} lang={lang} />}
      {data && !data.letter && data.state !== "writing" && <p className="text-muted">{t("ltNone")}</p>}
      {data && data.weeks.length > 1 && (
        <section className="flex flex-col gap-3 border-t border-line pt-8">
          <h2 className="text-sm text-muted">{t("ltEarlier")}</h2>
          <ul className="flex flex-col">
            {data.weeks.map((w) => (
              <li key={w.weekStart}>
                <button
                  type="button"
                  onClick={() => open(w.weekStart)}
                  aria-current={data.letter?.weekStart === w.weekStart ? "true" : undefined}
                  className="flex w-full cursor-pointer flex-col gap-0.5 border-b border-line-soft py-3 text-left aria-[current]:font-semibold"
                >
                  <span className="text-sm text-muted">{rangeLabel({ from: w.weekStart, through: w.weekEnd }, lang)}</span>
                  <span className="leading-snug">{w.headline}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Letter({ letter, t, lang }: { letter: LetterDTO; t: T; lang: Lang }) {
  return (
    <article className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted">{fill(t("ltWeek"), { week: rangeLabel({ from: letter.weekStart, through: letter.weekEnd }, lang) })}</p>
        <h2 className="font-serif text-4xl leading-tight">{letter.headline}</h2>
      </header>
      <ol className="flex flex-col gap-6">
        {letter.points.map((p, i) => (
          <li key={i} className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">{p.title}</h3>
            <p className="leading-relaxed">{p.text}</p>
            <Links links={p.links} t={t} />
          </li>
        ))}
      </ol>
      <section className="flex flex-col gap-2 rounded-3xl bg-green-soft p-5 text-green">
        <h3 className="text-sm font-semibold">{t("ltTodo")}</h3>
        <p className="text-lg leading-snug text-ink">{letter.todo.text}</p>
        <Links links={letter.todo.links} t={t} />
      </section>
      <p className="text-xs leading-normal text-muted">
        {letter.demo ? `${t("ltDemo")} ` : ""}
        {t("ltEmail")}
      </p>
    </article>
  );
}

function Links({ links, t }: { links: LetterLinkDTO[]; t: T }) {
  if (!links.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{t("ltSee")}</span>
      {links.map((l) => (
        <a key={l.href} href={l.href} className="rounded-full border border-line bg-paper px-3 py-1 font-semibold text-ink hover:border-ink">
          {l.kind === "page" && PAGE_LABEL[l.label] ? t(PAGE_LABEL[l.label]!) : l.label}
        </a>
      ))}
    </p>
  );
}
