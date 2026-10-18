"use client";

import type { StaffCafeAccessDTO } from "@peni/api";
import { useState } from "react";
import { api } from "./api";
import { errorText, type Lang, type T } from "./text";
import { Button, Notice } from "./ui";

const field = "min-h-12 w-full rounded-xl border border-line bg-paper px-4 text-base text-ink outline-none focus:border-ink";

/**
 * Turns this computer into a till: the owner signs in once with their password, picks the
 * café, and the computer keeps a device cookie. Their own session ends right after, so the
 * till starts at the names.
 */
export function Setup({ t, lang, onDone }: { t: T; lang: Lang; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState<string>(t("deviceNameDefault"));
  const [cafes, setCafes] = useState<StaffCafeAccessDTO[] | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await api.staff.signIn({ email, password });
      const owned = session.cafes.filter((c) => c.permissions.includes("devices.manage"));
      if (owned.length === 0) {
        await api.staff.signOut().catch(() => undefined);
        setError(t("notOwner"));
      } else {
        setCafes(owned);
        setSlug(owned[0]!.slug);
      }
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      await api.staff.registerDevice(slug, name.trim() || t("deviceNameDefault"));
      await api.staff.signOut().catch(() => undefined);
      onDone();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-6">
      <form
        className="flex w-full max-w-md flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void (cafes ? register() : signIn());
        }}
      >
        <h1 className="font-serif text-4xl font-normal leading-tight">{t("setupTitle")}</h1>
        <p className="text-muted">{t("setupBody")}</p>
        {!cafes ? (
          <>
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("email")}
              <input className={field} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("password")}
              <input className={field} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <>
            {cafes.length > 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm text-muted">{t("whichCafe")}</legend>
                {cafes.map((c) => (
                  <label key={c.slug} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 has-[:checked]:border-ink">
                    <input type="radio" name="cafe" checked={slug === c.slug} onChange={() => setSlug(c.slug)} />
                    {c.name}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("deviceName")}
              <input className={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </label>
          </>
        )}
        {error && <Notice tone="red">{error}</Notice>}
        <Button kind="primary" size="lg" type="submit" disabled={busy}>
          {cafes ? t("makeTill") : t("signIn")}
        </Button>
      </form>
    </div>
  );
}
