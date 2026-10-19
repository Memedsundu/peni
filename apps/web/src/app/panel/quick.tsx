"use client";

import { newIdempotencyKey } from "@peni/api";
import { AUDIO_SECONDS_MAX, QUICK_TEXT_MAX } from "@peni/core";
import { useEffect, useRef, useState } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { field } from "./shell";
import { errorText, fill, type Lang, type T } from "./text";

/** What the browser records in: Chrome and Firefox make WebM or Ogg, Safari MP4. */
const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

/**
 * Quick entry (plan piece 28): "Tesisatçıya 450 lira nakit ödedim", typed, or said and
 * shown back as text to fix before it's sent. The assistant drafts the expense; someone
 * who checks drafts confirms it on Taslaklar.
 */
export function QuickEntry({
  t,
  lang,
  slug,
  canSpeak,
  onSent,
  checkHere,
  big = false,
}: {
  t: T;
  lang: Lang;
  slug: string;
  canSpeak: boolean;
  onSent: () => void;
  /** Whether the draft can be checked on this page (Taslaklar), or a manager checks it (the till). */
  checkHere: boolean;
  /** The till's larger, touch-first look. */
  big?: boolean;
}) {
  const [text, setText] = useState("");
  const [said, setSaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const key = useRef(newIdempotencyKey());
  const mic = useRecorder(slug, lang, t, (heard) => {
    setText((v) => (v.trim() ? `${v.trim()} ${heard}` : heard).slice(0, QUICK_TEXT_MAX));
    setSaid(true);
    setSent(false);
  });
  const supported = canSpeak && mic.supported;

  const send = () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    api.staff.drafts.quick(slug, { key: key.current, text: text.trim(), voice: said }).then(
      () => {
        key.current = newIdempotencyKey();
        setText("");
        setSaid(false);
        setBusy(false);
        setSent(true);
        onSent();
      },
      (e: unknown) => {
        setError(errorText(e, lang));
        setBusy(false);
      },
    );
  };

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line p-5" aria-label={t("qeTitle")}>
      <div className="flex flex-col gap-1">
        <h2 className={big ? "text-xl font-semibold" : "font-semibold"}>{t("qeTitle")}</h2>
        <p className="text-sm leading-normal text-muted">{t(supported ? "qeHelpVoice" : "qeHelp")}</p>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          className={`${field} min-h-12 flex-1 resize-none leading-normal ${big ? "text-lg" : ""}`}
          rows={2}
          value={text}
          maxLength={QUICK_TEXT_MAX}
          placeholder={t("qePlaceholder")}
          aria-label={t("qeTitle")}
          disabled={mic.state !== "idle"}
          onChange={(e) => {
            setText(e.target.value);
            setSent(false);
            if (!e.target.value.trim()) setSaid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        {supported && (
          <Button
            kind={mic.state === "recording" ? "danger" : "quiet"}
            size={big ? "lg" : "md"}
            aria-label={mic.state === "recording" ? t("qeStop") : t("qeSpeak")}
            disabled={mic.state === "hearing" || busy}
            onClick={mic.state === "recording" ? mic.stop : mic.start}
            className="shrink-0"
          >
            <MicIcon />
          </Button>
        )}
        <Button kind="primary" size={big ? "lg" : "md"} className="shrink-0" disabled={!text.trim() || busy || mic.state !== "idle"} onClick={send}>
          {busy ? t("qeSending") : t("qeSend")}
        </Button>
      </div>
      {mic.state === "recording" && (
        <p role="status" className="flex items-center gap-2 text-sm text-red">
          <span className="size-3 animate-pulse rounded-full bg-red" aria-hidden="true" />
          {fill(t("qeListening"), { s: mic.seconds, max: AUDIO_SECONDS_MAX })}
        </p>
      )}
      {mic.state === "hearing" && (
        <p role="status" className="text-sm text-muted">
          {t("qeHearing")}
        </p>
      )}
      {said && mic.state === "idle" && text && <p className="text-sm text-muted">{t("qeCheckHeard")}</p>}
      {(error || mic.error) && <Notice tone="red">{error ?? mic.error}</Notice>}
      {sent && (
        <p role="status" className="rounded-2xl bg-panel px-4 py-3 text-sm">
          {t("qeSent")} {t(checkHere ? "qeSentHere" : "scanSentOthers")}
        </p>
      )}
    </section>
  );
}

/**
 * The microphone: records up to AUDIO_SECONDS_MAX, then sends the recording to be turned
 * into text. The recording is dropped as soon as the text comes back.
 */
function useRecorder(slug: string, lang: Lang, t: T, onHeard: (text: string) => void) {
  const [state, setState] = useState<"idle" | "recording" | "hearing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const supported = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (state !== "recording") return;
    const started = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= AUDIO_SECONDS_MAX) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [state]);
  // Leaving the page stops the microphone.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((track) => track.stop()), []);

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t("qeNoMic"));
      return;
    }
    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      const clip = new Blob(chunks, { type: r.mimeType || "audio/webm" });
      if (!clip.size) {
        setState("idle");
        return;
      }
      setState("hearing");
      api.staff.drafts.hear(slug, clip, lang).then(
        (h) => {
          setState("idle");
          onHeard(h.text);
        },
        (e: unknown) => {
          setState("idle");
          setError(errorText(e, lang));
        },
      );
    };
    recorder.current = r;
    setSeconds(0);
    r.start();
    setState("recording");
  };

  return { state, seconds, error, supported, start: () => void start(), stop: () => recorder.current?.stop() };
}

function MicIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
