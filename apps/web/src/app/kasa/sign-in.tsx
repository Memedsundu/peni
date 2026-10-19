"use client";

import { initials } from "@peni/brand/format";
import type { StaffMeDTO, TillDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { errorText, type Lang, type T } from "./text";
import { Button, Keypad, Notice } from "./ui";

type Person = TillDTO["staff"][number];

/** Tap your name, type your PIN. The session lasts the shift, on this computer only. */
export function SignIn({ t, lang, till, onSignedIn }: { t: T; lang: Lang; till: TillDTO; onSignedIn: (me: StaffMeDTO) => void }) {
  const [person, setPerson] = useState<Person | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!person || pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.till.pinSignIn({ memberId: person.memberId, pin }));
    } catch (e) {
      setError(errorText(e, lang));
      setPin("");
      setBusy(false);
    }
  }, [person, pin, busy, lang, onSignedIn]);

  const press = useCallback(
    (k: string) => {
      setError(null);
      setPin((p) => (k === "back" ? p.slice(0, -1) : p.length < 6 ? p + k : p));
    },
    [],
  );

  // A keyboard works too.
  useEffect(() => {
    if (!person) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") void submit();
      else if (e.key === "Escape") setPerson(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [person, press, submit]);

  if (person) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <Avatar name={person.name} />
          <div className="text-center">
            <h1 className="font-serif text-4xl font-normal">{person.name}</h1>
            <p className="mt-1 text-muted">{t("typePin")}</p>
          </div>
          <div className="flex h-6 items-center gap-3" aria-label={`${pin.length}`}>
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <span key={i} className={`h-3.5 w-3.5 rounded-full border border-ink ${i < pin.length ? "bg-ink" : ""}`} />
            ))}
          </div>
          {error && <Notice tone="red">{error}</Notice>}
          <div className="w-full">
            <Keypad onKey={press} eraseLabel={t("erase")} okLabel={t("ok")} onOk={() => void submit()} okDisabled={pin.length < 4 || busy} />
          </div>
          <Button
            kind="bare"
            onClick={() => {
              setPerson(null);
              setPin("");
              setError(null);
            }}
          >
            {t("back")}
          </Button>
        </div>
      </div>
    );
  }

  const missingPins = till.staff.some((s) => !s.hasPin);
  return (
    <div className="flex flex-1 flex-col items-center overflow-auto p-6 pt-16">
      <div className="flex w-full max-w-4xl flex-col gap-8">
        <div>
          <h1 className="font-serif text-5xl font-normal">{t("whoIsHere")}</h1>
          <p className="mt-2 text-lg text-muted">{t("tapYourName")}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {till.staff.map((s) => {
            const locked = !!s.lockedUntilIso && new Date(s.lockedUntilIso) > new Date();
            return (
              <button
                key={s.memberId}
                type="button"
                disabled={!s.hasPin || locked}
                onClick={() => setPerson(s)}
                className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-line bg-paper p-6 text-center disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Avatar name={s.name} />
                <span className="text-lg font-medium">{s.name}</span>
                <span className="text-sm text-muted">{!s.hasPin ? t("noPinYet") : locked ? t("locked") : t(`role_${s.role}`)}</span>
              </button>
            );
          })}
        </div>
        {missingPins && <p className="text-sm text-muted">{t("noPinHelp")}</p>}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-tile font-serif text-2xl">
      {initials(name)}
    </span>
  );
}
