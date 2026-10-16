"use client";

import { PeniApiError } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { formatPhone } from "@peni/brand/format";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Coin } from "@/components/brand";
import { Button, Card, CodeInput, Field, Input, isPhoneComplete, PhoneInput, phoneE164 } from "@/components/ui";
import { peni } from "@/lib/client";
import { DemoBox, type DemoPersonaId } from "./demo-box";

type Step = "phone" | "code" | "name";

/** "Kodu tekrar gönder" waits this long after each code (§9.2). */
const RESEND_SECONDS = 60;

/**
 * Sign-in (design-system.md §9.2): a centred raised card, max 400px, with the generic coin
 * and "Hoş geldin", then three steps in place:
 *
 * 1. Phone: "+90" fixed outside the field, mask `5xx xxx xx xx`, "Kod gönder".
 * 2. Code: six boxes (paste and SMS autofill fill them all and submit), "Kodu tekrar gönder
 *    (0:42)" counting down 60s, and "Numarayı değiştir".
 * 3. Name, only for a new customer [G8]: "Adın ne?" → POST /me/profile [G18].
 *
 * Then `router.replace(returnTo ?? "/")` (returnTo is already checked to be a same-origin
 * path). Errors stay inline under their field; nothing is wiped.
 */
export function SignIn({ returnTo, demo }: { returnTo: string | null; demo: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [demoBusy, setDemoBusy] = useState<DemoPersonaId | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const verifying = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const remaining = useCountdown(resendAt);

  const finish = () => {
    router.replace(returnTo ?? "/");
    router.refresh();
  };

  /* ---------------- 1. phone ---------------- */

  const sendCode = async (opts: { resend?: boolean } = {}) => {
    if (!isPhoneComplete(digits)) {
      setError(errorCopy.phone);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await peni.auth.requestCode({ phone: phoneE164(digits) });
      setDevCode(res.devCode ?? null);
      setCode("");
      setResent(Boolean(opts.resend));
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setStep("code");
    } catch (e) {
      setError(messageFor(e, "phone"));
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- 2. code ---------------- */

  const verify = async (value: string) => {
    if (verifying.current) return;
    if (!/^\d{6}$/.test(value)) {
      setError("Kodun altı hanesini gir.");
      return;
    }
    verifying.current = true;
    setBusy(true);
    setError(null);
    try {
      const session = await peni.auth.verifyCode({ phone: phoneE164(digits), code: value });
      if (session.isNew) {
        setStep("name");
        setBusy(false);
      } else {
        finish();
      }
    } catch (e) {
      const locked = e instanceof PeniApiError && e.code === "RATE_LIMITED";
      setError(messageFor(e, "code"));
      setCode("");
      // Too many tries: the server dropped the code, so a new one can be asked for at once.
      if (locked) setResendAt(0);
      setBusy(false);
      // Back to the first box, ready for the next try.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("[role=group] input")?.focus());
    } finally {
      verifying.current = false;
    }
  };

  const changeNumber = () => {
    setStep("phone");
    setCode("");
    setError(null);
    setDevCode(null);
  };

  /* ---------------- 3. name [G8] ---------------- */

  const saveName = async () => {
    const value = name.trim();
    if (!value) {
      setError("Adını yazar mısın?");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await peni.me.updateProfile({ displayName: value });
      finish();
    } catch (e) {
      setError(messageFor(e, "name"));
      setBusy(false);
    }
  };

  /* ---------------- demo personas ---------------- */

  const demoSignIn = async (customerId: DemoPersonaId) => {
    setDemoBusy(customerId);
    setDemoError(null);
    try {
      const res = await fetch("/api/v1/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      finish();
    } catch (e) {
      setDemoError(e instanceof TypeError ? errorCopy.network : errorCopy.generic);
      setDemoBusy(null);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (step === "phone") void sendCode();
    else if (step === "code") void verify(code);
    else void saveName();
  };

  const phoneShown = formatPhone(phoneE164(digits));

  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col gap-8 md:pt-6">
      <Card padding="none" className="px-5 pt-8 pb-6 sm:px-7">
        <header className="flex flex-col items-center text-center">
          <Coin size={96} />
          <h1 className="mt-5 font-display text-h2 text-ink">Hoş geldin</h1>
          <div aria-live="polite" className="mt-2">
            {step === "phone" && (
              <p className="text-body text-ink-2">Telefon numaranla giriş yap. Şifre yok; SMS ile 6{" "}haneli bir kod gelir.</p>
            )}
            {step === "code" && (
              <p className="text-body text-ink-2">
                <span className="whitespace-nowrap text-ink tabular-nums">{phoneShown}</span>{" "}
                {resent ? "numarasına yeni bir kod gönderdik." : "numarasına bir kod gönderdik."}
              </p>
            )}
          </div>
        </header>

        <form ref={formRef} noValidate onSubmit={onSubmit} className="mt-6 flex flex-col">
          {step === "phone" && (
            <>
              <Field label="Telefon numaran" error={error}>
                <PhoneInput
                  autoFocus
                  name="tel"
                  value={digits}
                  onValueChange={(d) => {
                    setDigits(d);
                    if (error) setError(null);
                  }}
                />
              </Field>
              <Button type="submit" fullWidth loading={busy} className="mt-5">
                Kod gönder
              </Button>
            </>
          )}

          {step === "code" && (
            <>
              <Field label="SMS ile gelen kod" error={error}>
                <CodeInput
                  autoFocus
                  name="code"
                  value={code}
                  onValueChange={(v) => {
                    setCode(v);
                    if (error) setError(null);
                  }}
                  onComplete={(v) => void verify(v)}
                />
              </Field>
              <Button type="submit" fullWidth loading={busy} loadingLabel="Kontrol ediliyor…" className="mt-5">
                {actionCopy.signIn}
              </Button>
              <div className="mt-3 flex flex-col items-center gap-1">
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={remaining > 0 || busy}
                  onClick={() => void sendCode({ resend: true })}
                >
                  {remaining > 0 ? (
                    <>
                      Kodu tekrar gönder <span className="tabular-nums">({clock(remaining)})</span>
                    </>
                  ) : (
                    "Kodu tekrar gönder"
                  )}
                </Button>
                <Button variant="quiet" size="sm" onClick={changeNumber}>
                  Numarayı değiştir
                </Button>
              </div>
            </>
          )}

          {step === "name" && (
            <>
              <h2 className="font-display text-h3 text-ink">Adın ne?</h2>
              <Field label="Adın" hint="Siparişin hazır olunca bu adla çağrılırsın." error={error} className="mt-4">
                <Input
                  autoFocus
                  name="given-name"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  maxLength={40}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError(null);
                  }}
                />
              </Field>
              <Button type="submit" fullWidth loading={busy} className="mt-5">
                {actionCopy.continue}
              </Button>
            </>
          )}
        </form>
      </Card>

      {demo && step !== "name" && (
        <div className="flex flex-col gap-2">
          <DemoBox busyId={demoBusy} disabled={demoBusy !== null || busy} devCode={step === "code" ? devCode : null} onPick={demoSignIn} />
          {demoError && (
            <p role="alert" className="text-meta text-danger">
              {demoError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Seconds left until `until` (ms), ticking once a second; 0 when past. */
function useCountdown(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (until <= Date.now()) {
      setNow(Date.now());
      return;
    }
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [until]);
  return left;
}

/** 42 → "0:42". */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The §9.2 sentence for each failure; the API's own Turkish message otherwise. */
function messageFor(error: unknown, step: Step): string {
  if (!(error instanceof PeniApiError)) return errorCopy.generic;
  switch (error.code) {
    case "NETWORK":
      return errorCopy.network;
    case "CODE_INVALID":
      return errorCopy.code;
    case "RATE_LIMITED":
      return errorCopy.codeLocked;
    case "VALIDATION":
      return step === "phone" ? errorCopy.phone : step === "code" ? errorCopy.code : error.message;
    default:
      return error.message;
  }
}
