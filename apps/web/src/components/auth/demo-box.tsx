"use client";

import { initials } from "@peni/brand/format";
import { ArrowRight } from "lucide-react";
import { cx, focusRing, pressMotion, tappable } from "@/components/ui";

/** The seeded neighbours (apps/web/src/server/seed.ts). */
export const DEMO_PERSONAS = [
  { id: "cus_ayse", name: "Ayşe Yılmaz", note: "İki kafenin müdavimi." },
  { id: "cus_mehmet", name: "Mehmet Kaya", note: "Ayşe'nin komşusu, Moda'da üye." },
  { id: "cus_deniz", name: "Deniz Arslan", note: "Yeni katıldı, henüz peni yok." },
] as const;

export type DemoPersonaId = (typeof DEMO_PERSONAS)[number]["id"];

/**
 * Demo sign-in (design-system.md §9.2), ONLY when NEXT_PUBLIC_DEMO=1: a dashed 1.5px
 * `line-strong` box with a "DENEME" stamp, one sentence and the persona buttons (secondary).
 * Everything that says "this is a test environment" lives inside this fence, never in the
 * product copy around it.
 */
export function DemoBox({
  busyId,
  disabled,
  devCode,
  onPick,
}: {
  busyId: DemoPersonaId | null;
  disabled: boolean;
  /** The code the demo server "sent", shown while the code step is open. */
  devCode: string | null;
  onPick: (id: DemoPersonaId) => void;
}) {
  return (
    <section
      aria-labelledby="deneme-baslik"
      className="relative rounded-[14px] border-[1.5px] border-dashed border-line-strong px-4 pt-6 pb-4"
    >
      <span
        aria-hidden
        className="plate absolute -top-3.5 right-4 inline-block rotate-[-4deg] rounded-[6px] border-[3px] border-double border-current bg-bg px-2.5 py-1 text-[15px] leading-none text-ink-2"
      >
        DENEME
      </span>
      <h2 id="deneme-baslik" className="text-body text-ink">
        Deneme hesaplarıyla tek dokunuşla gir.
      </h2>
      {devCode && (
        <p className="mt-1 text-meta text-ink-2">
          Bu ortamda SMS gitmez; kod <span className="font-semibold text-ink tabular-nums">{devCode}</span>.
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {DEMO_PERSONAS.map((p) => {
          const busy = busyId === p.id;
          const off = disabled && !busy;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => !disabled && onPick(p.id)}
                aria-disabled={disabled || undefined}
                aria-busy={busy || undefined}
                aria-labelledby={`deneme-${p.id}`}
                aria-describedby={`deneme-${p.id}-not`}
                className={cx(
                  "flex min-h-14 w-full items-center gap-3 rounded-[10px] border-[1.5px] px-3 py-2 text-left",
                  tappable,
                  focusRing,
                  off
                    ? "cursor-not-allowed border-transparent bg-surface-2 text-ink-2"
                    : cx("border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2", pressMotion),
                )}
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-meta font-semibold text-ink"
                >
                  {initials(p.name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span id={`deneme-${p.id}`} className="text-button">
                    {p.name.split(" ")[0]}
                  </span>
                  <span id={`deneme-${p.id}-not`} className="text-meta text-ink-2">
                    {busy ? "Giriş yapılıyor…" : p.note}
                  </span>
                </span>
                {/* While busy the meta line reads "Giriş yapılıyor…"; no spinner (§17). */}
                <ArrowRight
                  aria-hidden
                  size={20}
                  strokeWidth={1.75}
                  className={cx("size-5 shrink-0 text-ink-2", busy && "invisible")}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
