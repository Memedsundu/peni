"use client";

import { Popover } from "@base-ui/react/popover";
import type { AskidaDTO } from "@peni/api";
import { askiCopy } from "@peni/brand/copy";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AskiCaption, AskiRail, HookGlyph, askiRailProps, type HangSignal } from "@/components/brand";
import { Button, buttonClasses, cx, focusRing, toast } from "@/components/ui";
import { useCafe } from "./cafe-context";
import { AskiIkramNote } from "./aski-bits";
import { AskiGiveSheet } from "./aski-give-sheet";
import { signInUrlFor, takeAskiIntent } from "./aski-intent";
import { afterDonation, donationToast, donorLines, poolView, referenceItem, type Donation } from "./aski-model";
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
  const { cafe, signedIn, member, requireJoin, refresh, ikramProductId } = useCafe();
  const router = useRouter();
  const [takeOpen, setTakeOpen] = useState(false);
  const [giveOpen, setGiveOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Back from /giris with `?aski=birak|al` (aski-intent): re-open the sheet the visitor was
   * heading for, once, with the panel in view so the cup they leave hangs where they can see it.
   */
  const intentRead = useRef(false);
  useEffect(() => {
    if (intentRead.current) return;
    intentRead.current = true;
    const intent = takeAskiIntent();
    if (!intent || !signedIn || !cafe.askida.enabled) return;
    panelRef.current?.scrollIntoView({ block: "center" });
    if (intent === "al") setTakeOpen(true);
    else if (member) setGiveOpen(true);
    else requireJoin(() => setGiveOpen(true));
    // Once, on arrival.
  }, []);

  /*
   * A8 after one's own donation. The new count and the hang signal land in ONE render (the rail
   * hangs only the items that arrive with its signal); the refetch then replaces this local
   * picture with the server's, without replaying anything. The override belongs to the exact
   * `askida` object it was computed from: every refetch replaces that object, so from then on
   * the server's numbers win (even if someone took the same item and the pool looks "unchanged").
   */
  const [own, setOwn] = useState<{ askida: AskidaDTO; itemsAvailable: number; donatedPeni: number } | null>(null);
  const [hangSignal, setHangSignal] = useState<HangSignal>({ n: 0 });

  const askida = cafe.askida;
  if (!askida.enabled) return null;

  const reference = referenceItem(cafe);
  // Until the refetch lands the server still reports the pool as it was before the donation.
  const local = own && own.askida === askida ? own : null;
  // Counted in the reference item; in a cheaper askı item when no whole reference item is left (poolView).
  const view = local ? { itemsAvailable: local.itemsAvailable, referenceItemName: askida.referenceItemName } : poolView(cafe);
  const shown = {
    itemsAvailable: view.itemsAvailable,
    referenceItemName: view.referenceItemName,
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
        askida,
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
    else if (!signedIn) router.push(signInUrlFor("birak"));
    else requireJoin(() => setGiveOpen(true));
  };

  const actions = (
    <>
      <div className="flex gap-2">
        <Button variant="aski" onClick={() => setTakeOpen(true)} className="min-w-0 flex-1">
          {askiCopy.take}
        </Button>
        <Button variant="secondary" onClick={give} className="min-w-0 flex-1">
          {askiCopy.give}
        </Button>
      </div>
      {ikram && <AskiIkramNote name={ikram.name} className="mt-3" />}
    </>
  );

  return (
    // The legend is the Askı section's heading: an h2 beside "Menü" and "Masa" in the page outline.
    <div ref={panelRef} data-aski-panel className="@container rounded-[14px] bg-aski-soft p-4 text-ink md:p-5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-aski-ink">
          <HookGlyph size={20} />
          <span className="legend">{askiCopy.legend}</span>
        </h2>
        <AskiExplainer />
      </div>

      {/*
        Phone: one column. From a 576px panel (@xl): the rail column is exactly 12 slots wide
        (21rem = 12 × 28px). With named donors, the buttons share the rail's width and the donors
        sit beside it. With none (the default, since naming is opt-in) the buttons take the second
        column, so the panel reads "what's waiting | what you can do" with no empty half.
      */}
      <div className="mt-3 grid gap-5 @xl:grid-cols-[21rem_minmax(0,1fr)] @xl:gap-x-8">
        <div className="min-w-0">
          <AskiRail count={rail.count} item={rail.item} size="md" hangSignal={hangSignal} />
          <AskiCaption askida={shown} className="mt-3" />
          {donors.length > 0 && <div className="mt-5">{actions}</div>}
        </div>

        {donors.length > 0 ? (
          <ul
            className={cx(
              "flex flex-col gap-2 border-t border-aski-ink/20 pt-4",
              // Beside the rail the rule runs the column's full height, so the panel reads as two balanced halves.
              "@xl:self-stretch @xl:border-t-0 @xl:border-l @xl:pt-0.5 @xl:pl-6",
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
        ) : (
          <div className="min-w-0 @xl:self-center">{actions}</div>
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
