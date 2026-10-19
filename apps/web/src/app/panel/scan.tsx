"use client";

import { PeniApiError, type UploadDTO, type UploadsDTO } from "@peni/api";
import { useRef, useState, type LabelHTMLAttributes, type ReactNode } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { billHref } from "./faturalar/bills";
import { shrinkPhoto } from "./photos";
import { when } from "./shell";
import { errorText, fill, type Lang, type T, type TextKey } from "./text";

/** A bill photo keeps more than a feed photo, so its small print stays readable. */
const BILL_PHOTO_SIDE = 2400;
const MAX_BYTES = 10 * 1024 * 1024;
export const SCAN_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/*";

/** A file that was sent before (piece 25), kept so "Yine de oku" can send it again. */
export type Repeat = { body: Blob; name: string; duplicate: NonNullable<UploadDTO["duplicate"]> };

/**
 * Sending bills and receipts to the assistant, from Taslaklar, Faturalar and the till: a
 * photo is shrunk first, a PDF goes as it is, several go one after another. A file sent
 * before isn't read again unless asked.
 */
export function useScan(slug: string, lang: Lang, t: T, onSent: (n: number) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repeats, setRepeats] = useState<Repeat[]>([]);
  const [sent, setSent] = useState(0);

  const run = async (jobs: { body: Blob; name: string; again: boolean }[]) => {
    setBusy(true);
    setError(null);
    let n = 0;
    const seen: Repeat[] = [];
    for (const job of jobs) {
      try {
        const r = await api.staff.drafts.upload(slug, job.body, job.name, { again: job.again });
        if (r.duplicate) seen.push({ body: job.body, name: job.name, duplicate: r.duplicate });
        else n++;
      } catch (e) {
        setError(e instanceof PeniApiError ? errorText(e, lang) : t("drFailed"));
      }
    }
    setBusy(false);
    setSent(n);
    setRepeats((rs) => [...rs.filter((r) => !jobs.some((j) => j.body === r.body)), ...seen]);
    if (n) onSent(n);
  };

  const send = async (list: File[]) => {
    if (!list.length) return;
    const jobs: { body: Blob; name: string; again: boolean }[] = [];
    setError(null);
    for (const file of list) {
      const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      try {
        if (!pdf && !file.type.startsWith("image/")) throw new PeniApiError("DOCUMENT_TYPE", 415, "Not a photo or PDF");
        const body = pdf ? file : await shrinkPhoto(file, BILL_PHOTO_SIDE);
        if (body.size > MAX_BYTES) throw new PeniApiError("DOCUMENT_TOO_LARGE", 413, "Too large");
        jobs.push({ body, name: file.name, again: false });
      } catch (e) {
        setError(e instanceof PeniApiError ? errorText(e, lang) : t("drFailed"));
      }
    }
    if (jobs.length) await run(jobs);
  };

  const again = (r: Repeat) => run([{ body: r.body, name: r.name, again: true }]);
  const forget = (r: Repeat) => setRepeats((rs) => rs.filter((x) => x !== r));
  return { busy, error, repeats, sent, send, again, forget };
}

/** The hidden file input behind a button or a drop zone; several files at once. */
export function ScanInput({
  busy,
  onFiles,
  children,
  ...label
}: { busy: boolean; onFiles: (files: File[]) => void; children: ReactNode } & LabelHTMLAttributes<HTMLLabelElement>) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label {...label}>
      {children}
      <input
        ref={input}
        type="file"
        multiple
        accept={SCAN_ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          // Copied first: clearing the input empties its FileList.
          if (input.current) input.current.value = "";
        }}
      />
    </label>
  );
}

/** What became of each file sent before: its bill, its draft, or still reading; and "Yine de oku". */
export function Repeats({
  t,
  lang,
  slug,
  scan,
  links,
}: {
  t: T;
  lang: Lang;
  slug: string;
  scan: ReturnType<typeof useScan>;
  /** Whether the viewer can open drafts and bills from here (not at the till). */
  links: { drafts: boolean; bills: boolean };
}) {
  if (!scan.repeats.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {scan.repeats.map((r, i) => {
        const d = r.duplicate;
        const what = d.billId ? t("scanDupSaved") : d.draftId ? fill(t("scanDupWaiting"), { title: d.title ?? "" }) : t("scanDupReading");
        return (
          <li key={i} className="flex flex-col gap-3 rounded-2xl bg-panel px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="leading-normal">
              {fill(t("scanDuplicate"), { name: r.name || d.name || t("scanDupThisFile"), at: when(d.at, lang) })} {what}
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              {d.billId && links.bills && (
                <a href={billHref(slug, d.billId)} className="font-semibold underline underline-offset-4">
                  {t("drOpenBill")}
                </a>
              )}
              {!d.billId && d.draftId && links.drafts && (
                <a href={draftHref(slug, d.draftId)} className="font-semibold underline underline-offset-4">
                  {t("scanOpenDraft")}
                </a>
              )}
              <Button kind="quiet" size="sm" disabled={scan.busy} onClick={() => void scan.again(r)}>
                {t("scanAgain")}
              </Button>
              <Button kind="bare" size="sm" aria-label={t("close")} onClick={() => scan.forget(r)}>
                ×
              </Button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Fotoğrafla" on Faturalar: the button, and below the header what became of what was sent. */
export function useScanButton({ t, lang, slug, canSeeDrafts }: { t: T; lang: Lang; slug: string; canSeeDrafts: boolean }) {
  const scan = useScan(slug, lang, t, () => {});
  const button = (
    <ScanInput
      busy={scan.busy}
      onFiles={(f) => void scan.send(f)}
      className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-ink px-5 font-semibold has-disabled:opacity-60"
    >
      <CameraIcon />
      {scan.busy ? t("scanSending") : t("scan")}
    </ScanInput>
  );
  const notices = (
    <>
      {scan.error && <Notice tone="red">{scan.error}</Notice>}
      {scan.sent > 0 && !scan.busy && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-panel px-4 py-3 text-sm">
          <span>
            {fill(t("scanSent"), { n: scan.sent })} {t(canSeeDrafts ? "scanSentDrafts" : "scanSentOthers")}
          </span>
          {canSeeDrafts && (
            <a href={draftHref(slug, null)} className="font-semibold underline underline-offset-4">
              {t("scanGoDrafts")}
            </a>
          )}
        </p>
      )}
      <Repeats t={t} lang={lang} slug={slug} scan={scan} links={{ drafts: canSeeDrafts, bills: true }} />
    </>
  );
  return { button, notices };
}

/** What the viewer sent today and what became of each, newest first (the till's "Fatura"). */
export function MyUploads({ t, lang, data }: { t: T; lang: Lang; data: UploadsDTO }) {
  if (!data.uploads.length) return <p className="text-muted">{t("scanMineEmpty")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {data.uploads.map((u) => (
        <li key={u.jobId} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-lg font-medium">{u.title ?? (u.documentName || t("drDocument"))}</span>
            <span className="text-sm text-muted">
              {when(u.at, lang)}
              {u.title && u.documentName ? ` · ${u.documentName}` : ""}
            </span>
          </span>
          <span
            role={u.state === "reading" ? "status" : undefined}
            className={`flex items-center gap-2 text-sm ${u.state === "failed" || u.state === "notBill" ? "text-red" : u.state === "saved" ? "text-green" : "text-muted"}`}
          >
            {u.state === "reading" && <span className="size-3 animate-pulse rounded-full bg-green" aria-hidden="true" />}
            {t(`up_${u.state}` as TextKey)}
            {u.state === "failed" && u.error ? `: ${u.error}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CameraIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8h3l2-3h8l2 3h3v12H3z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

export const draftHref = (slug: string, draftId: string | null) =>
  `/panel/taslaklar?kafe=${encodeURIComponent(slug)}${draftId ? `&taslak=${encodeURIComponent(draftId)}` : ""}`;
