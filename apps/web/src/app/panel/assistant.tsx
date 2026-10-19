"use client";

import { PeniApiError, type ChatDTO, type ChatMessageDTO, type ChatSubjectDTO, type StaffCafeAccessDTO } from "@peni/api";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { AskedReportView } from "./asked-report";
import { errorText, fill, type Lang, type T, type TextKey } from "./text";

/** Raporlar asks for a fresh list of saved reports when one is saved from the chat. */
export const SAVED_REPORTS_EVENT = "peni:saved-reports";

type Ask = { text?: string; subject?: ChatSubjectDTO };
type Assistant = { open: (ask?: Ask) => void };

const AssistantContext = createContext<Assistant | null>(null);

/** The assistant, when this person may use it at this café; null otherwise. */
export function useAssistant(): Assistant | null {
  return useContext(AssistantContext);
}

/** What a page a source links to is called. */
const PAGE_LABEL: Record<string, TextKey> = { raporlar: "navReports", faturalar: "bills", borclar: "debts", stok: "stock", nakit: "money" };

const key = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * The assistant (plan piece 29): opens from every panel page and slides in from the right.
 * Questions about the café's numbers, answered from its own records with links to them.
 * It only looks; it never changes anything (D21).
 */
export function AssistantProvider({
  cafe,
  t,
  lang,
  signedOut,
  children,
}: {
  cafe: StaffCafeAccessDTO | null;
  t: T;
  lang: Lang;
  signedOut: () => void;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const [pending, setPending] = useState<Ask | null>(null);
  const value = useRef<Assistant>({ open: () => undefined });
  value.current.open = (ask) => {
    setShown(true);
    setPending(ask ?? {});
  };
  // A new café (or none) starts closed.
  useEffect(() => setShown(false), [cafe?.slug]);
  return (
    <AssistantContext.Provider value={cafe ? value.current : null}>
      {children}
      {cafe && shown && (
        <Panel
          key={cafe.slug}
          cafe={cafe}
          t={t}
          lang={lang}
          signedOut={signedOut}
          ask={pending}
          asked={() => setPending(null)}
          onClose={() => setShown(false)}
        />
      )}
    </AssistantContext.Provider>
  );
}

/** The header's way in: a "Sor" box on wide screens, a button on a phone. */
export function AskButton({ t }: { t: T }) {
  const assistant = useAssistant();
  if (!assistant) return null;
  return (
    <button
      type="button"
      onClick={() => assistant.open()}
      aria-label={t("asOpen")}
      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm text-muted hover:border-ink hover:text-ink"
    >
      <Spark />
      <span className="font-semibold text-ink sm:hidden">{t("asAsk")}</span>
      <span className="hidden sm:inline">{t("asOpen")}…</span>
    </button>
  );
}

function Spark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
    </svg>
  );
}

function Panel({
  cafe,
  t,
  lang,
  signedOut,
  ask,
  asked,
  onClose,
}: {
  cafe: StaffCafeAccessDTO;
  t: T;
  lang: Lang;
  signedOut: () => void;
  ask: Ask | null;
  asked: () => void;
  onClose: () => void;
}) {
  const [chat, setChat] = useState<ChatDTO | null>(null);
  const [draft, setDraft] = useState("");
  /** The question on its way, shown before the answer comes. */
  const [waiting, setWaiting] = useState<ChatMessageDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const busy = waiting !== null;

  const failed = (e: unknown) => {
    if (e instanceof PeniApiError && e.status === 401) signedOut();
    else setError(errorText(e, lang));
  };

  useEffect(() => {
    api.staff.chat.get(cafe.slug).then(setChat, failed);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cafe.slug]);

  const send = (text: string, subject: ChatSubjectDTO | null = null) => {
    const q = text.trim();
    if (!q || busy || !chat) return;
    setError(null);
    setWaiting({ id: "waiting", role: "user", text: q, at: new Date().toISOString(), subject, sources: [], report: null, failed: false });
    setDraft("");
    api.staff.chat.ask(cafe.slug, { key: key(), text: q, chatId: chat.chatId, subject }).then(
      (c) => {
        setChat(c);
        setWaiting(null);
      },
      (e: unknown) => {
        setWaiting(null);
        setDraft(q);
        failed(e);
      },
    );
  };

  // "Açıkla" sends at once; "Rapor iste" starts the sentence and leaves it to finish.
  useEffect(() => {
    if (!ask || !chat) return;
    if (ask.subject && ask.text) send(ask.text, ask.subject);
    else if (ask.text) setDraft(ask.text);
    asked();
    input.current?.focus();
  }, [ask, chat !== null]);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [chat?.messages.length, waiting]);

  const fresh = () => {
    setError(null);
    api.staff.chat.fresh(cafe.slug).then(setChat, failed);
  };

  const messages = chat ? [...chat.messages, ...(waiting ? [waiting] : [])] : [];
  const off = chat?.ai === "off";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("asTitle")}
        className="relative flex h-full w-full flex-col border-l border-line bg-paper shadow-xl sm:max-w-md"
        style={{ animation: "peni-slide-in 180ms ease-out" }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 font-serif text-3xl">
            <Spark />
            {t("asTitle")}
          </h2>
          <span className="flex items-center gap-1">
            {chat && chat.messages.length > 0 && (
              <Button kind="bare" size="sm" onClick={fresh} disabled={busy}>
                {t("asNew")}
              </Button>
            )}
            <Button kind="bare" size="sm" onClick={onClose} aria-label={t("close")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Button>
          </span>
        </header>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5" aria-live="polite">
          {!chat && !error && <p className="text-muted">{t("loading")}</p>}
          {chat && messages.length === 0 && (
            <div className="flex flex-col gap-4">
              <p className="leading-normal text-muted">{t("asHelp")}</p>
              {!off && (
                <>
                  <p className="text-sm font-semibold">{t("asTry")}</p>
                  <ul className="flex flex-col gap-2">
                    {(["asEx1", "asEx2", "asEx3"] as const).map((k) => (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => send(t(k))}
                          className="w-full cursor-pointer rounded-2xl border border-line px-4 py-3 text-left leading-snug hover:border-ink"
                        >
                          {t(k)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <p key={m.id} className="max-w-[85%] self-end rounded-3xl rounded-br-lg bg-tile px-4 py-2.5 leading-snug whitespace-pre-wrap">
                <span className="sr-only">{t("asYou")}: </span>
                {m.text}
              </p>
            ) : (
              <Answer
                key={m.id}
                m={m}
                t={t}
                lang={lang}
                slug={cafe.slug}
                canSave={chat!.canSaveReports}
                retry={() => {
                  const q = messages[i - 1];
                  if (q?.role === "user") send(q.text, q.subject);
                }}
                busy={busy}
              />
            ),
          )}
          {waiting && (
            <p className="flex items-center gap-2 text-muted" role="status">
              <span className="inline-block size-2 animate-pulse rounded-full bg-green" />
              {t("asThinking")}
            </p>
          )}
          <div ref={end} />
        </div>

        <form
          className="flex flex-col gap-2 border-t border-line px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          {error && <Notice tone="red">{error}</Notice>}
          {off && <Notice>{t("asOff")}</Notice>}
          {chat?.ai === "demo" && <p className="text-xs leading-normal text-muted">{t("asDemo")}</p>}
          {chat && !off && chat.left < 10 && <p className="text-xs text-muted">{fill(t("asLeft"), { n: chat.left })}</p>}
          <div className="flex items-end gap-2">
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={2}
              maxLength={500}
              placeholder={t("asPlaceholder")}
              aria-label={t("asPlaceholder")}
              disabled={off || !chat}
              className="min-h-12 w-full flex-1 resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-ink"
            />
            <Button kind="primary" type="submit" disabled={busy || off || !chat || !draft.trim() || chat.left === 0}>
              {t("asSend")}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function Answer({
  m,
  t,
  lang,
  slug,
  canSave,
  retry,
  busy,
}: {
  m: ChatMessageDTO;
  t: T;
  lang: Lang;
  slug: string;
  canSave: boolean;
  retry: () => void;
  busy: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!m.report) return;
    setSaving(true);
    setError(null);
    api.staff.reports
      // Saving the same answer twice keeps it once.
      .save(slug, { key: m.id, spec: m.report.spec })
      .then(
        () => {
          setSaved(true);
          window.dispatchEvent(new Event(SAVED_REPORTS_EVENT));
        },
        (e: unknown) => setError(errorText(e, lang)),
      )
      .finally(() => setSaving(false));
  };
  return (
    <div className="flex flex-col gap-3">
      <p className={`leading-normal whitespace-pre-wrap ${m.failed ? "text-muted" : ""}`}>{m.text}</p>
      {m.failed && (
        <Button size="sm" className="self-start" onClick={retry} disabled={busy}>
          {t("asRetry")}
        </Button>
      )}
      {m.report && (
        <div className="flex flex-col gap-3 rounded-3xl border border-line p-4">
          <AskedReportView t={t} lang={lang} spec={m.report.spec} result={m.report.result} compact />
          {canSave &&
            (saved ? (
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                {t("asSaved")}
                <a href={`/panel/raporlar?kafe=${encodeURIComponent(slug)}#kayitli`} className="font-semibold text-ink underline underline-offset-4">
                  {t("asSeeReports")}
                </a>
              </p>
            ) : (
              <Button size="sm" className="self-start" onClick={save} disabled={saving}>
                {t("asSave")}
              </Button>
            ))}
          {error && <Notice tone="red">{error}</Notice>}
        </div>
      )}
      {m.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{t("asSources")}</span>
          {m.sources.map((s) => (
            <a key={s.href} href={s.href} className="rounded-full border border-line px-3 py-1 font-semibold hover:border-ink">
              {s.kind === "page" && PAGE_LABEL[s.label] ? t(PAGE_LABEL[s.label]!) : s.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
