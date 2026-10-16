"use client";

import type { MeDTO } from "@peni/api";
import { PeniApiError } from "@peni/api";
import { actionCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { formatPhone } from "@peni/brand/format";
import { Check, LogOut, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { signInHref } from "@/components/auth/return-to";
import { usePeniKodu } from "@/components/chrome/peni-kodu";
import { Button, Card, cx, Field, focusRingInset, Input, Row, RowGroup, Switch, tappable, toast } from "@/components/ui";
import { peni, signOut } from "@/lib/client";
import { ThemeChoice } from "./theme-choice";

/**
 * Profil (design-system.md §9.8): one raised card of rows — "Adın" + "Kaydet" and "Profilim
 * görünsün" [G18], "Peni kodum" (the shared dialog), "Görünüm", "Masa kuralları", the café
 * panel for staff only [G19], and "Çıkış yap". Signed out: an invitation to sign in, and the
 * two rows that need no account.
 */
export function ProfileView({ me }: { me: MeDTO | null }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 md:pt-2">
      <header>
        <h1 className="font-display text-h2 text-ink">Profil</h1>
        {me && <p className="mt-1 text-meta text-ink-2 tabular-nums">{formatPhone(me.customer.phone)}</p>}
      </header>
      {me ? <SignedIn me={me} /> : <SignedOut />}
    </div>
  );
}

function SignedIn({ me }: { me: MeDTO }) {
  const kodu = usePeniKodu();
  return (
    <RowGroup>
      <li className="px-4 pt-4 pb-5">
        <NameForm initial={me.customer.displayName} />
      </li>
      <li className="px-4">
        <VisibilitySwitch initial={me.customer.profileVisible} />
      </li>
      {kodu.available && (
        <Row
          onClick={() => kodu.show()}
          title={peniCopy.peniCode}
          end={<QrCode aria-hidden size={20} strokeWidth={1.75} className="size-5 text-ink-2" />}
        />
      )}
      <AppearanceRow />
      <Row href="/masa-kurallari" title="Masa kuralları" />
      {me.staffCafes.map((cafe) => (
        <Row
          key={cafe.slug}
          href={`/kafe/${cafe.slug}`}
          title="Kafe paneline geç"
          meta={cafe.name}
        />
      ))}
      <li className="flex">
        <SignOutRow />
      </li>
    </RowGroup>
  );
}

function SignedOut() {
  return (
    <>
      {/* p-4 at every width: the sentence lines up with the rows' 16px inset below. */}
      <Card padding="none" className="flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-lg text-ink">Adını ve görünürlüğünü ayarlamak için giriş yap.</p>
        <Button href={signInHref("/profil")} className="max-sm:w-full">
          {actionCopy.signIn}
        </Button>
      </Card>
      <RowGroup>
        <AppearanceRow />
        <Row href="/masa-kurallari" title="Masa kuralları" />
      </RowGroup>
    </>
  );
}

/* ------------------------------------------------------------------ Adın + Kaydet [G18] */

function NameForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "saving") return;
    const name = value.trim();
    if (!name) {
      setError("Adını yazar mısın?");
      return;
    }
    if (name === saved) {
      setValue(name);
      setStatus("saved");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const me = await peni.me.updateProfile({ displayName: name });
      setSaved(me.customer.displayName);
      setValue(me.customer.displayName);
      setStatus("saved");
      router.refresh(); // the avatar initials in the top bar
    } catch (e) {
      setStatus("idle");
      setError(e instanceof PeniApiError ? e.message : errorCopy.change);
    }
  };

  return (
    <form noValidate onSubmit={submit}>
      <Field
        label="Adın"
        error={error}
        hint={
          status === "saved" ? (
            <span className="inline-flex items-center gap-1.5 text-success-ink">
              <Check aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="size-4" />
              Kaydedildi.
            </span>
          ) : (
            "Siparişin hazır olunca bu adla çağrılırsın."
          )
        }
      >
        <div className="flex items-start gap-2">
          <Input
            name="given-name"
            autoComplete="name"
            maxLength={40}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (status === "saved") setStatus("idle");
              if (error) setError(null);
            }}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" loading={status === "saving"} loadingLabel="Kaydediliyor…">
            {actionCopy.save}
          </Button>
        </div>
      </Field>
    </form>
  );
}

/* ------------------------------------------------------------- Profilim görünsün [G18] */

function VisibilitySwitch({ initial }: { initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <Switch
      checked={checked}
      onCheckedChange={async (next) => {
        if (pending) return;
        setChecked(next); // optimistic; put back if the server says no
        setPending(true);
        try {
          const me = await peni.me.updateProfile({ profileVisible: next });
          setChecked(me.customer.profileVisible);
        } catch (e) {
          setChecked(!next);
          toast.error(e instanceof PeniApiError && e.code === "NETWORK" ? errorCopy.network : errorCopy.change);
        } finally {
          setPending(false);
        }
      }}
      label="Profilim görünsün"
      hint="Açıkken Peni masasında baş harflerin, cevaplarda adın görünür."
      className="py-3"
    />
  );
}

/* ------------------------------------------------------------------------- Görünüm */

function AppearanceRow() {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span aria-hidden className="text-body text-ink">
        Görünüm
      </span>
      <ThemeChoice className="sm:w-[300px]" />
    </li>
  );
}

/* ------------------------------------------------------------------------ Çıkış yap */

function SignOutRow() {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() =>
        startTransition(async () => {
          try {
            await signOut();
          } catch {
            toast.error(errorCopy.generic);
            return;
          }
          router.replace("/");
          router.refresh();
        })
      }
      className={cx(
        "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-button text-danger",
        tappable,
        focusRingInset,
        "transition-colors duration-150 ease-out-strong hover:bg-danger-soft/40 active:bg-danger-soft motion-reduce:transition-none",
        busy && "cursor-progress",
      )}
    >
      <LogOut aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
      {busy ? "Çıkış yapılıyor…" : actionCopy.signOut}
    </button>
  );
}
