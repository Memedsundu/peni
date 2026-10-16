"use client";

import { newIdempotencyKey, PeniApiError, type WalletDTO } from "@peni/api";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useChromeSession } from "@/components/chrome/session";
import { peni } from "@/lib/client";
import { formatPeni, timeAgo } from "@/lib/format";

export default function WalletPage() {
  const signedIn = useChromeSession() !== null;
  const [wallet, setWallet] = useState<WalletDTO | null>(null);
  const [needsLogin, setNeedsLogin] = useState(!signedIn);
  const [cafeSlug, setCafeSlug] = useState("");
  const [toPhone, setToPhone] = useState("+90");
  const [amount, setAmount] = useState(30);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!signedIn) return setNeedsLogin(true);
    try {
      const w = await peni.wallet.get();
      setWallet(w);
      setNeedsLogin(false);
      setCafeSlug((s) => s || w.cafes[0]?.cafeSlug || "");
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) setNeedsLogin(true);
    }
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  if (needsLogin)
    return (
      <div className="card mx-auto max-w-md space-y-3 p-6 text-center">
        <p>Cüzdanını görmek için giriş yap.</p>
        <Link href="/giris" className="btn btn-primary">
          Giriş yap
        </Link>
      </div>
    );
  if (!wallet) return <p className="text-ink-2">Yükleniyor…</p>;

  const pendingIn = wallet.gifts.filter((g) => g.direction === "in" && g.status === "pending");
  const others = wallet.gifts.filter((g) => !(g.direction === "in" && g.status === "pending"));

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      setStatus({ ok: true, text: ok });
      await load();
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <h1 className="font-serif text-3xl font-semibold">Cüzdan</h1>
        <p className="text-ink-2">Peni her kafede ayrı tutulur ve o kafede 1 peni = 1 TL değerindedir.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {wallet.cafes.map((c) => (
            <li key={c.membershipId} className="card p-5">
              <Link href={`/k/${c.cafeSlug}`} className="font-medium hover:text-copper">
                {c.cafeName}
              </Link>
              <p className="mt-1 font-serif text-3xl font-semibold">
                <span className="coin" aria-hidden /> {c.balancePeni}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {pendingIn.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-xl font-semibold">Sana ısmarlandı</h2>
          {pendingIn.map((g) => (
            <div key={g.id} className="card flex flex-wrap items-center gap-3 border-copper p-4">
              <div className="flex-1">
                <p>
                  <strong>{g.fromName}</strong> sana {formatPeni(g.peni)} ısmarladı · {g.cafeName}
                </p>
                {g.message && <p className="text-sm text-ink-2">&ldquo;{g.message}&rdquo;</p>}
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => peni.gifts.accept(g.id), "Cüzdanına eklendi.")}>
                Kabul et
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => peni.gifts.decline(g.id), "Geri gönderildi.")}>
                Geri çevir
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card space-y-3 p-5">
        <h2 className="font-serif text-xl font-semibold">Birine ısmarla</h2>
        <p className="text-sm text-ink-2">Arkadaşın aynı kafenin üyesi olmalı. 24 saat içinde kabul etmezse peni sana döner.</p>
        <select className="input" value={cafeSlug} onChange={(e) => setCafeSlug(e.target.value)}>
          {wallet.cafes.map((c) => (
            <option key={c.cafeSlug} value={c.cafeSlug}>
              {c.cafeName} ({formatPeni(c.balancePeni)})
            </option>
          ))}
        </select>
        <input className="input" inputMode="tel" placeholder="+90…" value={toPhone} onChange={(e) => setToPhone(e.target.value)} />
        <div className="flex gap-2">
          {[30, 60, 90].map((v) => (
            <button key={v} className={`btn ${amount === v ? "btn-primary" : "btn-ghost"}`} onClick={() => setAmount(v)}>
              {v}
            </button>
          ))}
        </div>
        <input className="input" placeholder="Bir not (isteğe bağlı)" maxLength={140} value={message} onChange={(e) => setMessage(e.target.value)} />
        <button
          className="btn btn-primary"
          disabled={busy || !cafeSlug}
          onClick={() =>
            act(
              () =>
                peni.gifts.send({
                  cafeSlug,
                  toPhone: toPhone.replace(/\s/g, ""),
                  peni: amount,
                  message: message || undefined,
                  idempotencyKey: newIdempotencyKey(),
                }),
              "Ismarladın! Kabul edince cüzdanına geçecek.",
            )
          }
        >
          {formatPeni(amount)} ısmarla
        </button>
        {status && <p className={`text-sm ${status.ok ? "text-leaf" : "text-berry"}`}>{status.text}</p>}
        <p className="text-meta text-ink-2">Deneme hesapları: Mehmet +905320000002, Deniz +905320000003</p>
      </section>

      {others.length > 0 && (
        <section>
          <h2 className="mb-2 font-serif text-xl font-semibold">Geçmiş</h2>
          <ul className="card divide-y divide-line text-sm">
            {others.map((g) => (
              <li key={g.id} className="flex justify-between gap-3 px-4 py-3">
                <span>
                  {g.direction === "out" ? <>Sen <ArrowRight size={16} absoluteStrokeWidth aria-hidden className="inline align-[-.15em]" /> {g.toName}</> : <>{g.fromName} <ArrowRight size={16} absoluteStrokeWidth aria-hidden className="inline align-[-.15em]" /> sen</>} · {formatPeni(g.peni)} ·{" "}
                  {{ pending: "bekliyor", accepted: "kabul edildi", declined: "geri çevrildi", expired: "süresi doldu" }[g.status]}
                </span>
                <span className="text-ink-2">{timeAgo(g.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        className="btn btn-ghost"
        onClick={async () => {
          await fetch("/api/v1/auth/logout", { method: "POST" });
          location.href = "/";
        }}
      >
        Çıkış yap
      </button>
    </div>
  );
}
