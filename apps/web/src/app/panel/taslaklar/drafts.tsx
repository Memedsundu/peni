"use client";

import { PeniApiError, type AiLogDTO, type DraftDTO, type DraftsDTO, type InboxDTO, type ReadingDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { Field, Segmented } from "../controls";
import { billHref, BillForm } from "../faturalar/bills";
import { Repeats, ScanInput, useScan } from "../scan";
import { outcomeText, Samples, StatementCheck, ZCheck } from "./checks";
import { Emails, InboxCard } from "./inbox";
import { PanelShell, when, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

type Tab = "waiting" | "history" | "emails" | "log";

/**
 * Taslaklar (plan piece 24): a bill or receipt goes in, the assistant reads it, and the
 * draft waits here to be checked beside its document and confirmed (D21). Confirmed and
 * dismissed drafts stay in Geçmiş; Kayıt lists everything the assistant did.
 */
export function Drafts({ cafeSlug, draftId }: { cafeSlug: string | null; draftId: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="taslaklar" wide>
      {(p) => <DraftsPage key={p.cafe.slug} {...p} initialId={draftId} />}
    </PanelShell>
  );
}

function DraftsPage({ cafe, t, lang, signedOut, initialId }: PanelProps & { initialId: string | null }) {
  const [data, setData] = useState<DraftsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("waiting");
  const [openId, setOpenId] = useState<string | null>(initialId);
  const [done, setDone] = useState<DraftDTO | null>(null);
  const [inbox, setInbox] = useState<InboxDTO | null>(null);

  const load = useCallback(
    () =>
      api.staff.drafts.list(cafe.slug).then(
        (d) => {
          setData(d);
          setError(null);
        },
        (e: unknown) => {
          if (e instanceof PeniApiError && e.status === 401) signedOut();
          else setError(errorText(e, lang));
        },
      ),
    [cafe.slug, lang],
  );
  // The address for bills (piece 26); Taslaklar works without it.
  const loadInbox = useCallback(() => api.staff.inbox.get(cafe.slug).then(setInbox, () => undefined), [cafe.slug]);
  useEffect(() => void load(), [load]);
  useEffect(() => void loadInbox(), [loadInbox]);

  // While something is being read, look again every few seconds.
  const reading = data?.reading.some((r) => r.state === "reading") ?? false;
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => {
      void load();
      void loadInbox();
    }, 3000);
    return () => clearInterval(timer);
  }, [reading, load, loadInbox]);

  const open = (id: string | null) => {
    setOpenId(id);
    setDone(null);
    window.history.replaceState(null, "", `?kafe=${encodeURIComponent(cafe.slug)}${id ? `&taslak=${encodeURIComponent(id)}` : ""}`);
    window.scrollTo({ top: 0 });
  };
  const decided = (d: DraftDTO) => {
    open(null);
    setDone(d);
    void load();
  };

  const draft = data && openId ? (data.open.find((d) => d.id === openId) ?? null) : null;

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("drTitle")}</h1>
        <p className="leading-normal text-muted">{t("drHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && draft ? (
        <Check t={t} lang={lang} slug={cafe.slug} data={data} draft={draft} onBack={() => open(null)} onDecided={decided} onRefresh={() => void load()} />
      ) : (
        data && (
          <>
            {data.ai === "demo" && <Notice>{t("drDemo")}</Notice>}
            {data.ai === "off" && <Notice>{t("drOff")}</Notice>}
            {done && <Decided t={t} slug={cafe.slug} draft={done} />}
            {data.canUpload && <Upload t={t} lang={lang} slug={cafe.slug} demo={data.ai === "demo"} onUploaded={() => void load()} />}
            {data.ai !== "off" && inbox && (
              <InboxCard
                t={t}
                lang={lang}
                slug={cafe.slug}
                inbox={inbox}
                onChange={(i) => {
                  setInbox(i);
                  void load();
                }}
              />
            )}
            <Segmented
              label={t("drShow")}
              value={tab}
              onChange={setTab}
              options={[
                { value: "waiting", label: `${t("drWaiting")}${data.open.length ? ` (${data.open.length})` : ""}` },
                { value: "history", label: t("drHistory") },
                { value: "emails", label: t("drEmails") },
                { value: "log", label: t("drLog") },
              ]}
            />
            {tab === "waiting" && <Waiting t={t} lang={lang} data={data} onOpen={open} />}
            {tab === "history" && <History t={t} lang={lang} slug={cafe.slug} data={data} />}
            {tab === "emails" && <Emails t={t} lang={lang} slug={cafe.slug} inbox={inbox} />}
            {tab === "log" && <Log t={t} lang={lang} slug={cafe.slug} />}
          </>
        )
      )}
    </>
  );
}

/** The drop zone: several bills or statements at once; one sent before says what became of it. */
function Upload({ t, lang, slug, demo, onUploaded }: { t: T; lang: Lang; slug: string; demo: boolean; onUploaded: () => void }) {
  const scan = useScan(slug, lang, t, onUploaded);
  const [over, setOver] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <ScanInput
        busy={scan.busy}
        onFiles={(f) => void scan.send(f)}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-6 py-8 text-center transition-colors ${over ? "border-ink bg-tile" : "border-line"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void scan.send([...e.dataTransfer.files]);
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 2h9l5 5v15H6z" />
          <path d="M14 2v6h6M9 13h8M9 17h5" />
        </svg>
        <span className="text-lg font-medium">{scan.busy ? t("drUploading") : t("drUpload")}</span>
        <span className="text-sm text-muted">{t("drUploadHint")}</span>
      </ScanInput>
      {demo && <Samples t={t} lang={lang} slug={slug} onSent={onUploaded} />}
      {scan.error && <Notice tone="red">{scan.error}</Notice>}
      <Repeats t={t} lang={lang} slug={slug} scan={scan} links={{ drafts: true, bills: true }} />
    </div>
  );
}

function Waiting({ t, lang, data, onOpen }: { t: T; lang: Lang; data: DraftsDTO; onOpen: (id: string) => void }) {
  if (!data.open.length && !data.reading.length) return <p className="text-muted">{t("drNothing")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {data.reading.map((r) => (
        <ReadingRow key={r.jobId} t={t} lang={lang} r={r} />
      ))}
      {data.open.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-lg font-medium">{d.title}</span>
            <span className="text-sm text-muted">
              {when(d.createdAt, lang)}
              {d.document?.name ? ` · ${d.document.name}` : ""}
              {d.document?.sender ? ` · ${fill(t("drByEmail"), { sender: d.document.sender })}` : ""}
              {d.doubts.length > 0 && <span className="text-red"> · {fill(t("drNotes"), { n: d.doubts.length })}</span>}
              {d.duplicateOf && <span className="font-semibold text-red"> · {t(d.duplicateOf.kind === "bill" ? "dupBillShort" : "dupDraftShort")}</span>}
            </span>
          </span>
          <Button kind="primary" size="sm" onClick={() => onOpen(d.id)}>
            {t("drCheck")}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ReadingRow({ t, lang, r }: { t: T; lang: Lang; r: ReadingDTO }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-lg font-medium">{r.documentName || t("drDocument")}</span>
        <span className="text-sm text-muted">{when(r.at, lang)}</span>
      </span>
      {r.state === "reading" ? (
        <span className="flex items-center gap-2 text-sm text-muted" role="status">
          <span className="size-3 animate-pulse rounded-full bg-green" aria-hidden="true" />
          {t("drReading")}
        </span>
      ) : (
        <span className="text-sm text-red">{r.state === "notBill" ? t("drNotBill") : `${t("drFailed")}: ${r.error ?? ""}`}</span>
      )}
    </li>
  );
}

/** One draft beside its document: the notes, the bill or statement or Z report to check, and "Onayla" or "Bırak". */
function Check({
  t,
  lang,
  slug,
  data,
  draft,
  onBack,
  onDecided,
  onRefresh,
}: {
  t: T;
  lang: Lang;
  slug: string;
  data: DraftsDTO;
  draft: DraftDTO;
  onBack: () => void;
  onDecided: (d: DraftDTO) => void;
  onRefresh: () => void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismiss = () => {
    setBusy(true);
    api.staff.drafts.dismiss(slug, draft.id, { reason: reason.trim() || null }).then(onDecided, (e: unknown) => {
      setError(errorText(e, lang));
      setBusy(false);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button kind="bare" size="sm" onClick={onBack}>
          ← {t("drBack")}
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <DocumentView t={t} draft={draft} />
        <div className="flex flex-col gap-5">
          {draft.doubts.length > 0 && (
            <section className="flex flex-col gap-2 rounded-3xl bg-red-soft p-5 text-red" aria-label={t("drNotesTitle")}>
              <h2 className="text-sm font-semibold">{t("drNotesTitle")}</h2>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {draft.doubts.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </section>
          )}
          {draft.kind === "statement" ? (
            <StatementCheck t={t} lang={lang} slug={slug} draft={draft} canCheck={data.canCheck} onRefresh={onRefresh} onDecided={onDecided} />
          ) : draft.kind === "zreport" ? (
            <ZCheck t={t} lang={lang} slug={slug} draft={draft} canCheck={data.canCheck} onDecided={onDecided} />
          ) : data.canConfirm ? (
            <BillForm t={t} lang={lang} slug={slug} data={data.billForm} bill={null} draft={draft} onClose={onBack} onConfirmed={onDecided} />
          ) : (
            <Notice>{t("drCantConfirm")}</Notice>
          )}
          <div className="flex flex-col gap-3">
            {dismissing ? (
              <div className="flex flex-col gap-3 rounded-3xl border border-line p-5">
                <Field label={t("drDismissWhy")} value={reason} onChange={setReason} maxLength={200} autoFocus />
                <div className="flex gap-2">
                  <Button kind="secondary" size="sm" disabled={busy} onClick={dismiss}>
                    {t("drDismissDo")}
                  </Button>
                  <Button kind="bare" size="sm" onClick={() => setDismissing(false)}>
                    {t("close")}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button kind="bare" size="sm" onClick={() => setDismissing(true)}>
                  {t("drDismiss")}
                </Button>
              </div>
            )}
            {error && <Notice tone="red">{error}</Notice>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentView({ t, draft }: { t: T; draft: DraftDTO }) {
  const doc = draft.document;
  if (!doc) return <Notice>{t("drNoDocument")}</Notice>;
  const pdf = doc.contentType === "application/pdf";
  // An Excel or CSV statement isn't shown in the page; it downloads.
  if (!pdf && !doc.contentType.startsWith("image/"))
    return (
      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-tile p-6 lg:sticky lg:top-6 lg:self-start" aria-label={t("drDocument")}>
        <p className="truncate text-lg font-medium">{doc.name || t("drDocument")}</p>
        <p className="text-sm text-muted">{t("ckSheet")}</p>
        {doc.sender && <p className="text-sm text-muted">{fill(t("drByEmail"), { sender: doc.sender })}</p>}
        <a href={doc.url} download={doc.name || undefined} className="text-sm font-semibold underline underline-offset-4">
          {t("ckDownload")}
        </a>
      </section>
    );
  return (
    <section className="flex flex-col gap-2 lg:sticky lg:top-6 lg:self-start" aria-label={t("drDocument")}>
      <div className="overflow-hidden rounded-3xl border border-line bg-tile">
        {pdf ? (
          <iframe src={`${doc.url}#toolbar=0&view=FitH`} title={doc.name || t("drDocument")} className="h-[70vh] w-full bg-paper" />
        ) : (
          <img src={doc.url} alt={doc.name || t("drDocument")} className="max-h-[70vh] w-full object-contain" />
        )}
      </div>
      {doc.sender && <p className="text-sm text-muted">{fill(t("drByEmail"), { sender: doc.sender })}</p>}
      <a href={doc.url} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-4">
        {t("drOpenDocument")}
      </a>
    </section>
  );
}

function Decided({ t, slug, draft }: { t: T; slug: string; draft: DraftDTO }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-panel px-4 py-3 text-sm">
      <span>
        {draft.status === "dismissed"
          ? t("drDismissed")
          : draft.kind === "bill"
            ? t("drSaved")
            : `${t("ckSaved")} ${outcomeText(t, draft.kind, draft.outcome)}`}
      </span>
      {draft.resultId && (
        <a href={billHref(slug, draft.resultId)} className="font-semibold underline underline-offset-4">
          {t("drOpenBill")}
        </a>
      )}
    </p>
  );
}

function History({ t, lang, slug, data }: { t: T; lang: Lang; slug: string; data: DraftsDTO }) {
  if (!data.recent.length) return <p className="text-muted">{t("drNoHistory")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {data.recent.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-lg font-medium">{d.title}</span>
            <span className="text-sm text-muted">
              {fill(t(d.status === "dismissed" ? "drDismissedBy" : d.kind === "bill" ? "drConfirmedBy" : "ckCheckedBy"), {
                who: d.decidedBy ?? "",
                at: d.decidedAt ? when(d.decidedAt, lang) : "",
              })}
              {d.status === "confirmed" && d.kind !== "bill" && ` · ${outcomeText(t, d.kind, d.outcome)}`}
              {d.status === "confirmed" &&
                d.kind === "bill" &&
                ` · ${d.changed.length ? fill(t("drChanged"), { what: d.changed.map((c) => t(`chg_${c}` as TextKey)).join(", ") }) : t("drAsRead")}`}
              {d.dismissReason && ` · “${d.dismissReason}”`}
            </span>
          </span>
          {d.resultId && (
            <a href={billHref(slug, d.resultId)} className="text-sm font-semibold underline underline-offset-4">
              {t("drOpenBill")}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** What a confirmed bill's log line lists; a statement's or Z report's says its own outcome. */
const CHANGED = new Set(["supplier", "date", "number", "dueDate", "lines", "kdv"]);

const EVENT: Record<AiLogDTO["events"][number]["kind"], TextKey> = {
  "document.uploaded": "ev_document_uploaded",
  "email.received": "ev_email_received",
  "ai.call": "ev_ai_call",
  "draft.created": "ev_draft_created",
  "draft.confirmed": "ev_draft_confirmed",
  "draft.dismissed": "ev_draft_dismissed",
  "job.failed": "ev_job_failed",
};

/** Everything the assistant did, and what people did with it. */
function Log({ t, lang, slug }: { t: T; lang: Lang; slug: string }) {
  const [log, setLog] = useState<AiLogDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const more = (before?: string) =>
    api.staff.drafts.log(slug, before).then(
      (l) => setLog((prev) => (before && prev ? { ...l, events: [...prev.events, ...l.events] } : l)),
      (e: unknown) => setError(errorText(e, lang)),
    );
  useEffect(() => void more(), [slug]);
  const n = (v: number) => v.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB");

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!log) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{fill(t("drMonth"), { calls: n(log.month.calls), tokens: n(log.month.inputTokens + log.month.outputTokens) })}</p>
      {log.events.length === 0 ? (
        <p className="text-muted">{t("drLogEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {log.events.map((e) => (
            <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr_auto] sm:items-baseline sm:gap-4">
              <span className="text-sm text-muted tabular">{when(e.at, lang)}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={`font-medium ${e.ok ? "" : "text-red"}`}>
                  {t(e.kind === "ai.call" && !e.ok ? "ev_ai_call_failed" : EVENT[e.kind])}
                  <span className="font-normal text-muted"> · {e.who ?? t("drAssistant")}</span>
                </span>
                {e.detail && (
                  <span className="truncate text-sm text-muted">
                    {e.kind === "draft.confirmed" && e.detail.split(", ").every((c) => CHANGED.has(c))
                      ? fill(t("drChanged"), {
                          what: e.detail
                            .split(", ")
                            .map((c) => t(`chg_${c}` as TextKey))
                            .join(", "),
                        })
                      : e.detail}
                  </span>
                )}
              </span>
              {e.kind === "ai.call" && (
                <span className="text-sm text-muted tabular">
                  {[
                    e.model,
                    fill(t("drTokens"), { n: n(e.inputTokens + e.outputTokens) }),
                    e.ms !== null ? fill(t("drSeconds"), { n: (e.ms / 1000).toFixed(1) }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {log.next && (
        <div>
          <Button kind="quiet" size="sm" onClick={() => void more(log.next!)}>
            {t("drMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
