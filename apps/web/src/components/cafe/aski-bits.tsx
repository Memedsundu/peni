"use client";

import { goodsName } from "@peni/brand/format";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Icon, cx, type IconProp } from "@/components/ui";

/*
 * Small pieces the Askı panel and its two sheets share (design-system.md §9.3).
 */

/**
 * One calm sentence with its icon, in place of the chips and the primary: the take states [G3]
 * and the give sheet with nothing to leave.
 */
export function AskiStateNote({ icon, text }: { icon: IconProp; text: string }) {
  return (
    <div role="status" className="flex items-start gap-3">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
        <Icon icon={icon} size={20} />
      </span>
      <p className="min-w-0 flex-1 pt-2 text-body-lg text-ink">{text}</p>
    </div>
  );
}

/**
 * The ikram that is already in the cart: "Siparişine 1 çay eklendi. Kasada ₺0 görünür."
 * Shown under the panel's buttons and at the top of the take sheet, so a second visit to the
 * sheet reads as a swap, never as a second ikram. `short` drops the ₺0 sentence where the
 * sheet's body already says it.
 */
export function AskiIkramNote({ name, short = false, className }: { name: string; short?: boolean; className?: string }) {
  return (
    <p role="status" className={cx("flex items-start gap-2 text-meta text-ink", className)}>
      <Check aria-hidden size={16} absoluteStrokeWidth strokeWidth={1.75} className="mt-px size-4 shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1">
        Siparişine <span className="font-semibold">1 {goodsName(name)}</span> eklendi.{!short && " Kasada ₺0 görünür."}
      </span>
    </p>
  );
}

/**
 * A named set of askı choice chips ("Hangisi?", "Ne bırakıyorsun?") on a fixed grid: one
 * full-width option per line on a phone, two per line once the sheet is wide enough for the
 * longest label (and its disabled reason) to stay on one line. The chips pass `w-full` and
 * never `grow`, so rows never come out ragged. Callers put the choosable options first.
 *
 * `wide`: the give sheet's labels carry a price ("1 peynirli poğaça · 40 peni") and need about
 * twice the room of the take sheet's names.
 */
export function AskiChoiceGroup({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="@container">
      <div role="group" aria-label={label} className={cx("grid grid-cols-1 gap-2", wide ? "@xl:grid-cols-2" : "@sm:grid-cols-2")}>
        {children}
      </div>
    </div>
  );
}
