"use client";

import { newIdempotencyKey, type AskidaDTO } from "@peni/api";
import { useState } from "react";
import { peni } from "@/lib/client";
import { formatPeni, timeAgo } from "@/lib/format";

export function AskidaCard({
  slug,
  askida,
  items,
  balancePeni,
  canDonate,
  onChange,
}: {
  slug: string;
  askida: AskidaDTO;
  /** Menu items that can be taken from the askı. */
  items: { name: string; priceKurus: number }[];
  balancePeni: number;
  canDonate: boolean;
  onChange: () => void;
}) {
  const [amount, setAmount] = useState(30);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!askida.enabled) return null;

  const covers = items
    .map((i) => ({ name: i.name.toLocaleLowerCase("tr"), count: Math.floor(askida.balancePeni / Math.ceil(i.priceKurus / 100)) }))
    .filter((c) => c.count > 0)
    .map((c) => `${c.count} ${c.name}`);

  async function donate() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await peni.askida.donate({ cafeSlug: slug, peni: amount, showName, idempotencyKey: newIdempotencyKey() });
      setMessage({
        ok: true,
        text:
          r.matchedPeni > 0
            ? `Teşekkürler! Kafe de ${formatPeni(r.matchedPeni)} ekledi.`
            : "Teşekkürler! Askıya bıraktın.",
      });
      onChange();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="bg-copper-soft p-5">
        <p className="text-sm font-semibold tracking-wide text-copper uppercase">Askıda kahve</p>
        <p className="mt-1 font-serif text-3xl font-semibold">
          {askida.itemsAvailable > 0 ? <>Askıda {formatPeni(askida.balancePeni)}</> : "Askı şu an boş"}
        </p>
        {askida.itemsAvailable > 0 && covers.length > 0 && (
          <p className="mt-1">{joinOr(covers)} için yeter.</p>
        )}
        <p className="mt-2 text-sm text-ink-2">
          {askida.claimedLast7Days >= 3 && <>Son 7 günde {askida.claimedLast7Days} kişi askıdan aldı. </>}
          Menüde <strong>Askıdan al</strong>&apos;ı seç; günde {askida.claimsPerDay} kez alabilirsin ve adın kimseye görünmez.
        </p>
      </div>

      {canDonate && balancePeni < 30 && (
        <p className="border-b border-line p-5 text-sm text-ink-2">
          Penin biriktikçe sen de askıya bırakabilirsin. Kasada nakit olarak da askıya kahve bırakılabilir.
        </p>
      )}
      {canDonate && balancePeni >= 30 && (
        <div className="space-y-3 border-b border-line p-5">
          <p className="text-sm font-medium">Askıya bırak</p>
          <div className="flex flex-wrap gap-2">
            {[30, 60, 90, 150].map((v) => (
              <button
                key={v}
                className={`btn ${amount === v ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setAmount(v)}
                disabled={v > balancePeni}
              >
                {v}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
            Adım askı duvarında görünsün
          </label>
          <button className="btn btn-primary" disabled={busy || amount > balancePeni} onClick={donate}>
            {formatPeni(amount)} bırak
          </button>
          {message && <p className={`text-sm ${message.ok ? "text-leaf" : "text-berry"}`}>{message.text}</p>}
        </div>
      )}

      {askida.wall.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {askida.wall.map((e, i) => (
            <li key={i} className="flex justify-between gap-3 px-5 py-2.5">
              <span>
                {e.type === "donation" && <>{e.donorName ?? "Bir komşu"} askıya {formatPeni(e.peni)} bıraktı</>}
                {e.type === "till_donation" && <>Kasada bir misafir askıya {formatPeni(e.peni)} bıraktı</>}
                {e.type === "cafe_match" && <>Kafe {formatPeni(e.peni)} ekledi</>}
                {e.type === "claim" && <>Biri askıdan bir {e.itemName.toLocaleLowerCase("tr")} aldı</>}
              </span>
              <span className="shrink-0 text-ink-2">{timeAgo(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function joinOr(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} ya da ${parts.at(-1)}`;
}
