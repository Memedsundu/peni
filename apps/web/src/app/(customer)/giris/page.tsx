"use client";

import { PeniApiError } from "@peni/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { peni } from "@/lib/client";

const DEMO = [
  { id: "cus_ayse", name: "Ayşe", note: "Moda'nın müdavimi, bolca peni biriktirmiş" },
  { id: "cus_mehmet", name: "Mehmet", note: "Ayşe'nin komşusu" },
  { id: "cus_deniz", name: "Deniz", note: "Üç gün önce katıldı, henüz peni yok" },
];

export default function SignIn() {
  const router = useRouter();
  const [phone, setPhone] = useState("+90");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof PeniApiError ? e.message : "Bir şeyler ters gitti.");
    } finally {
      setBusy(false);
    }
  }

  const demoSignIn = (customerId: string) =>
    run(async () => {
      const res = await fetch("/api/v1/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) throw new Error();
      router.push("/k/moda");
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-serif text-3xl font-semibold">Giriş</h1>

      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (step === "phone") {
              const r = await peni.auth.requestCode({ phone: phone.replace(/\s/g, "") });
              setStep("code");
              setHint(r.devCode ? `Demo modu: kod ${r.devCode}` : "Kodu SMS ile gönderdik.");
            } else {
              await peni.auth.verifyCode({ phone: phone.replace(/\s/g, ""), code, displayName: name || undefined });
              router.push("/");
              router.refresh();
            }
          });
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Telefon numaran</span>
          <input
            className="input"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={step === "code"}
          />
        </label>
        {step === "code" && (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">SMS kodu</span>
              <input
                className="input tracking-[0.4em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Adın (ilk girişte)</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </>
        )}
        {hint && <p className="text-sm text-leaf">{hint}</p>}
        {error && <p className="text-sm text-berry">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {step === "phone" ? "Kod gönder" : "Giriş yap"}
        </button>
      </form>

      <div className="card space-y-3 p-5">
        <p className="text-sm font-semibold">Deneme hesaplarıyla tek dokunuşla gir.</p>
        {DEMO.map((d) => (
          <button key={d.id} className="btn btn-ghost w-full justify-between" disabled={busy} onClick={() => demoSignIn(d.id)}>
            <span>{d.name}</span>
            <span className="text-xs font-normal text-ink-2">{d.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
