"use client";

import type { UploadsDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { CameraIcon, MyUploads, Repeats, ScanInput, useScan } from "../panel/scan";
import { fill, text as panelText } from "../panel/text";
import { api } from "./api";
import type { TillProps } from "./till";
import { Notice } from "./ui";

/**
 * "Fatura" at the till (plan piece 25): the barista photographs a delivery's bill or
 * receipt and sends it; the assistant reads it and a manager confirms it in Taslaklar.
 * Below, what they sent today and what became of each.
 */
export function TillScan({ t, slug, onError, lang }: TillProps) {
  const words = panelText(lang);
  const [data, setData] = useState<UploadsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api.staff.drafts.mine(slug).then(
        (d) => {
          setData(d);
          setError(null);
        },
        (e: unknown) => setError(onError(e)),
      ),
    [slug, onError],
  );
  useEffect(() => void load(), [load]);
  const scan = useScan(slug, lang, words, () => void load());

  // While something is being read, look again every few seconds.
  const reading = data?.uploads.some((u) => u.state === "reading") ?? false;
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [reading, load]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
        <section className="flex flex-col gap-2">
          <h1 className="font-serif text-5xl leading-none">{t("scanTitle")}</h1>
          <p className="leading-normal text-muted">{words("scanHelp")}</p>
        </section>
        {error && <Notice tone="red">{error}</Notice>}
        {data?.ai === "off" ? (
          <Notice>{words("scanOff")}</Notice>
        ) : (
          <div className="flex flex-col gap-3">
            <ScanInput
              busy={scan.busy}
              onFiles={(f) => void scan.send(f)}
              className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl bg-ink px-6 py-8 text-center text-paper has-disabled:opacity-60"
            >
              <CameraIcon size={36} />
              <span className="text-2xl font-semibold">{scan.busy ? words("scanSending") : words("scan")}</span>
            </ScanInput>
            {scan.error && <Notice tone="red">{scan.error}</Notice>}
            {scan.sent > 0 && !scan.busy && (
              <p role="status" className="rounded-2xl bg-panel px-4 py-3 text-sm">
                {fill(words("scanSent"), { n: scan.sent })} {words("scanSentOthers")}
              </p>
            )}
            <Repeats t={words} lang={lang} slug={slug} scan={scan} links={{ drafts: false, bills: false }} />
          </div>
        )}
        {data && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm text-muted">{words("scanMine")}</h2>
            <MyUploads t={words} lang={lang} data={data} />
          </section>
        )}
      </div>
    </div>
  );
}
