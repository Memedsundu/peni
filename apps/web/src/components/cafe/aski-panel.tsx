"use client";

import { Popover } from "@base-ui/react/popover";
import type { AskidaDTO } from "@peni/api";
import { askiCopy } from "@peni/brand/copy";
import { Check, Info } from "lucide-react";
import { useState } from "react";
import { AskiCaption, AskiRail, HookGlyph, askiRailProps, type HangSignal } from "@/components/brand";
import { Button, buttonClasses, cx, focusRing, toast } from "@/components/ui";
import { useCafe } from "./cafe-context";
import { AskiGiveSheet } from "./aski-give-sheet";
import { afterDonation, donationToast, donorLines, referenceItem, type Donation } from "./aski-model";
import { AskiTakeSheet } from "./aski-take-sheet";

/*
 * Askıda kahve on the café page (design-system.md §9.3 "Askı", §6.2, A8, A9, D7, D8).
 *
 * A flat `aski-soft` panel: the legend and "Askı nedir?", the hook rail and its caption, two
 * equal buttons ("Askıdan al" in askı turquoise, "Askıya bırak" secondary) and up to three named
 * donors. It takes no props; everything comes from `useCafe()`.
 *
 * Dignity (review blockers, §17):
 * - Nothing about anyone who takes is shown: no names, initials or times of claims.
 * - This rail animates ONLY for the viewer's own donation (A8). A refetch that brings someone
 *   else's donation or claim re-renders it silently: no fade, no sway, no line.
 * - The weekly ikram count is hidden below 3 (`askiCaption`, D8).
 */
export function AskiPanel() {
  const { cafe, member, requireJoin, refresh, ikramProductId } = useCafe();
  const [takeOpen, setTakeOpen] = useState(false);
  const [giveOpen, setGiveOpen] = useState(false);

  /*
   * A8 after one's own donation. The new count and the hang signal land in ONE render (the rail
   * hangs only the items that arrive with its signal); the refetch then replaces this local
   * picture with the server's, without replaying anything.
   */
  const [own, setOwn] = useState<{ base: Pick<AskidaDTO, "balancePeni" | "itemsAvailable">; itemsAvailable: number; donatedPeni: number } | null>(
    null,
  );
  const [hangSignal, setHangSignal] = useState<HangSignal>({ n: 0 });

  const askida = cafe.askida;
  if (!askida.enabled) return null;

  const reference = referenceItem(cafe);
  // Until the refetch lands the server still reports the pool as it was before the donation.
  const local = own && own.base.balancePeni === askida.balancePeni && own.base.itemsAvailable === askida.itemsAvailable ? own : null;
  const shown = {
    itemsAvailable: local ? local.itemsAvailable : askida.itemsAvailable,
    referenceItemName: askida.referenceItemName,
    claimsPerDay: askida.claimsPerDay,
    claimedLast7Days: askida.claimedLast7Days,
    donatedLast7DaysPeni: askida.donatedLast7DaysPeni + (local ? local.donatedPeni : 0),
  };
  const rail = askiRailProps(shown);
  const donors = donorLines(cafe);
  const ikram = ikramProductId ? cafe.menu.find((m) => m.productId === ikramProductId) : null;

  const onDonated = (d: Donation) => {
    const next = afterDonation(askida, reference, d);
    if (next) {
      const n = (typeof hangSignal === "number" ? hangSignal : hangSignal.n) + 1;
      setOwn({
        base: { balancePeni: askida.balancePeni, itemsAvailable: askida.itemsAvailable },
        itemsAvailable: next.itemsAvailable,
        donatedPeni: d.peni + d.matchedPeni,
      });
      setHangSignal({ n, count: next.own, match: next.match });
    }
    const t = donationToast(d);
    toast(t.title, t.description ? { description: t.description } : undefined);
    void refresh();
  };

  const give = () => {
    if (member) setGiveOpen(true);
    else requireJoin(() => setGiveOpen(true));
  };

  return (
    // The page's `<section id="aski">` carries the h2 ("Askı"); the legend is this panel's own heading.
    <div data-aski-panel className="@container rounded-[14px] bg-aski-soft p-4 text-ink md:p-5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-aski-ink">
          <HookGlyph size={20} />
          <span className="legend">{askiCopy.legend}</span>
        </h3>
        <AskiExplainer />
      </div>

      {/*
        Phone: one column. From a 576px panel (@xl): the rail column is exactly 12 slots wide
        (21rem = 12 × 28px) and the two buttons share that width; the donors sit beside it.
      */}
      <div className="mt-3 grid gap-5 @xl:grid-cols-[21rem_minmax(0,1fr)] @xl:gap-x-8">
        <div className="min-w-0">
          <AskiRail count={rail.count} item={rail.item} size="md" hangSignal={hangSignal} />
          <AskiCaption askida={shown} className="mt-3" />
          <div className="mt-5 flex gap-2">
            <Button variant="aski" onClick={() => setTakeOpen(true)} className="min-w-0 flex-1">
              {askiCopy.take}
            </Button>
            <Button variant="secondary" onClick={give} className="min-w-0 flex-1">
              {askiCopy.give}
            </Button>
          </div>
          {ikram && (
            <p role="status" className="mt-3 flex items-start gap-2 text-meta text-ink">
              <Check aria-hidden size={16} absoluteStrokeWidth strokeWidth={1.75} className="mt-px size-4 shrink-0 text-ink-2" />
              <span>
                <span className="font-semibold">{ikram.name}</span> siparişine eklendi. Kasada ₺0 görünür.
              </span>
            </p>
          )}
        </div>

        {donors.length > 0 && (
          <ul
            className={cx(
              "flex flex-col gap-2 border-t border-aski-ink/20 pt-4",
              "@xl:self-start @xl:border-t-0 @xl:border-l @xl:pt-0.5 @xl:pl-6",
            )}
          >
            {donors.map((d) => (
              <li key={d.key} className="text-meta text-ink-2">
                {/* "Ayşe K. 1 çay bıraktı · bugün": the name carries the weight, the rest is quiet. */}
                <span className="font-semibold text-ink">{d.name}</span>
                {askiCopy.donorLine(d.name, d.what, d.day).slice(d.name.length)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AskiTakeSheet open={takeOpen} onOpenChange={setTakeOpen} />
      {member && <AskiGiveSheet open={giveOpen} onOpenChange={setGiveOpen} onDonated={onDonated} />}
    </div>
  );
}

/** "Askı nedir?": a quiet info button and a small popover with the one-paragraph answer. */
function AskiExplainer() {
  return (
    <Popover.Root>
      <Popover.Trigger className={cx(buttonClasses({ variant: "quiet", size: "sm" }), "-mr-3 shrink-0 gap-1.5")}>
        <Info aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
        <span>{askiCopy.whatIs}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup
            className={cx(
              "w-[min(20rem,calc(100vw-32px))] origin-(--transform-origin) rounded-[14px] bg-surface p-4 text-ink shadow-floating outline-none",
              "transition-[opacity,scale] duration-200 ease-out-strong motion-reduce:duration-150",
              "data-starting-style:opacity-0 data-ending-style:opacity-0",
              "motion-safe:data-starting-style:scale-[.96] motion-safe:data-ending-style:scale-[.96]",
              focusRing,
            )}
          >
            <Popover.Title className="sr-only">{askiCopy.whatIs}</Popover.Title>
            <Popover.Description className="text-body">{askiCopy.explainer}</Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
