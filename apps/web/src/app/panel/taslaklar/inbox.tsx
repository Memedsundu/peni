"use client";

import type { InboundEmailDTO, InboxDTO } from "@peni/api";
import { useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { draftHref } from "../scan";
import { when } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

/**
 * The café's address for bills (plan piece 26): to give suppliers, or to forward bills
 * to from the owner's own mailbox. Those who manage bills can turn it off or take a new
 * address, which retires the old one at once.
 */
export function InboxCard({ t, lang, slug, inbox, onChange }: { t: T; lang: Lang; slug: string; inbox: InboxDTO; onChange: (i: InboxDTO) => void }) {
  const [copied, setCopied] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!inbox.ready || !inbox.address) return null;

  const run = (fn: () => Promise<InboxDTO>) => {
    setBusy(true);
    setError(null);
    fn().then(
      (i) => {
        onChange(i);
        setRenewing(false);
        setBusy(false);
      },
      (e: unknown) => {
        setError(errorText(e, lang));
        setBusy(false);
      },
    );
  };
  const copy = () => {
    void navigator.clipboard?.writeText(inbox.address!).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5" aria-label={t("ibTitle")}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-semibold">
          <MailIcon />
          {t("ibTitle")}
        </h2>
        <p className="text-sm leading-normal text-muted">{t("ibHelp")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className={`min-w-0 rounded-2xl border border-line bg-paper px-4 py-3 text-sm break-all ${inbox.enabled ? "" : "text-muted line-through"}`}>
          {inbox.address}
        </code>
        {inbox.enabled && (
          <Button kind="quiet" size="sm" onClick={copy}>
            {copied ? t("ibCopied") : t("ibCopy")}
          </Button>
        )}
      </div>
      {!inbox.enabled && <p className="text-sm text-red">{t("ibOff")}</p>}
      {inbox.canSendSample && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span>{t("ibDemo")}</span>
          <Button kind="secondary" size="sm" disabled={busy} onClick={() => run(() => api.staff.inbox.sample(slug))}>
            {t("ibSample")}
          </Button>
        </p>
      )}
      {inbox.canManage &&
        (renewing ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
            <p className="text-sm leading-normal">{t("ibNewHelp")}</p>
            <div className="flex flex-wrap gap-2">
              <Button kind="danger" size="sm" disabled={busy} onClick={() => run(() => api.staff.inbox.update(slug, { newAddress: true }))}>
                {t("ibNewDo")}
              </Button>
              <Button kind="bare" size="sm" onClick={() => setRenewing(false)}>
                {t("close")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button kind="bare" size="sm" onClick={() => setRenewing(true)}>
              {t("ibNew")}
            </Button>
            <Button kind="bare" size="sm" disabled={busy} onClick={() => run(() => api.staff.inbox.update(slug, { enabled: !inbox.enabled }))}>
              {inbox.enabled ? t("ibTurnOff") : t("ibTurnOn")}
            </Button>
          </div>
        ))}
      {error && <Notice tone="red">{error}</Notice>}
    </section>
  );
}

/** "E-postalar": what reached the address, and what became of each file. */
export function Emails({ t, lang, slug, inbox }: { t: T; lang: Lang; slug: string; inbox: InboxDTO | null }) {
  if (!inbox) return null;
  if (!inbox.emails.length) return <p className="text-muted">{t(inbox.ready ? "ibNoEmails" : "ibNotReady")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {inbox.emails.map((e) => (
        <EmailRow key={e.id} t={t} lang={lang} slug={slug} email={e} />
      ))}
    </ul>
  );
}

function EmailRow({ t, lang, slug, email }: { t: T; lang: Lang; slug: string; email: InboundEmailDTO }) {
  return (
    <li className="flex flex-col gap-2 py-4">
      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 truncate text-lg font-medium">{email.subject || t("ibNoSubject")}</span>
        <span className="text-sm text-muted tabular">{when(email.at, lang)}</span>
      </span>
      <span className="text-sm text-muted">{email.sender}</span>
      {email.documents.length === 0 && email.skipped.length === 0 && <span className="text-sm text-muted">{t("ibNoFiles")}</span>}
      {(email.documents.length > 0 || email.skipped.length > 0) && (
        <ul className="flex flex-col gap-1 text-sm">
          {email.documents.map((d) => (
            <li key={d.documentId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <FileIcon />
              <span className="min-w-0 truncate">{d.name}</span>
              <span className={d.state === "failed" || d.state === "notBill" ? "text-red" : d.state === "saved" ? "text-green" : "text-muted"}>
                {t(`up_${d.state}` as TextKey)}
              </span>
              {d.draftId && (
                <a href={draftHref(slug, d.draftId)} className="font-semibold underline underline-offset-4">
                  {t("drCheck")}
                </a>
              )}
            </li>
          ))}
          {email.skipped.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              <FileIcon />
              <span className="min-w-0 truncate line-through">{s.name}</span>
              <span>{fill(t("ibSkipped"), { why: t(`skip_${s.why}`) })}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function MailIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
