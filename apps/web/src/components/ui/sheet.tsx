"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { actionCopy } from "@peni/brand/copy";
import { ChevronLeft, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { cx } from "./cx";
import { IconButton, iconButtonClasses } from "./icon-button";
import { MD_UP, useMediaQuery } from "./use-media-query";

type FocusTarget = boolean | RefObject<HTMLElement | null>;

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after the open or close animation has finished (reset a multi-step sheet here). */
  onOpenChangeComplete?: (open: boolean) => void;
  /** The sheet's heading ("Siparişin", "Askıya bırak"), `text-h3`. Names the dialog. */
  title: ReactNode;
  /** A sentence under the title, `ink-2`. Describes the dialog. */
  description?: ReactNode;
  /** A `legend` line over the title ("ADIM 1/3"). */
  eyebrow?: ReactNode;
  /** Shows a `ChevronLeft` "Geri" button before the title (multi-step sheets). */
  onBack?: () => void;
  children?: ReactNode;
  /** Pinned under the scrolling body: the sheet's primary action(s). */
  footer?: ReactNode;
  /**
   * `false` keeps the sheet open on outside presses (Escape and "Kapat" still close it) —
   * for flows with typed input that a stray tap shouldn't throw away.
   */
  dismissible?: boolean;
  /** Phone only: take the whole screen (Peni kodum). */
  fullScreenOnPhone?: boolean;
  /** Where focus goes on open. Default: the first focusable control. */
  initialFocus?: FocusTarget;
  /** Where focus goes on close. Default: back to what opened it. */
  finalFocus?: FocusTarget;
  /** Extra classes for the scrolling body. */
  bodyClassName?: string;
}

/**
 * Sheet (design-system.md §12.2, D20, D24, A5). Below 768px a Base UI Drawer: a bottom sheet at
 * content height (max 88dvh, no snap points), 22px top corners, a 36×4 `line-strong` handle,
 * swipe down to dismiss, keyboard-aware for fields. From 768px a Base UI Dialog, 480px wide.
 * Both close on Escape, on the backdrop (unless `dismissible={false}`) and with the `X` "Kapat".
 *
 * Motion: the drawer slides on 450ms `ease-drawer` and follows the finger; the dialog scales
 * .96 → 1 with opacity over 200ms. Reduced motion: opacity over 150ms only.
 * The backdrop is black at .35 (.6 in dark, where .35 of black over a near-black page is
 * invisible) and fades out as the drawer is swiped.
 */
export function Sheet(props: SheetProps) {
  const wide = useMediaQuery(MD_UP);
  return wide ? <DialogSheet {...props} /> : <DrawerSheet {...props} />;
}

const backdropBase =
  "fixed inset-0 z-50 min-h-dvh bg-black [--sheet-scrim:.35] dark:[--sheet-scrim:.6] data-starting-style:opacity-0 data-ending-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute";

function DrawerSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  description,
  eyebrow,
  onBack,
  children,
  footer,
  dismissible = true,
  fullScreenOnPhone = false,
  initialFocus,
  finalFocus,
  bodyClassName,
}: SheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={onOpenChangeComplete}
      disablePointerDismissal={!dismissible}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop
            className={cx(
              backdropBase,
              "opacity-[calc(var(--sheet-scrim)*(1-var(--drawer-swipe-progress,0)))]",
              "transition-opacity duration-[450ms] ease-drawer data-swiping:duration-0 motion-reduce:duration-150",
            )}
          />
          {/* The keyboard inset lifts the sheet above an open software keyboard. */}
          <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center pb-[var(--drawer-keyboard-inset,0px)]">
            <Drawer.Popup
              initialFocus={initialFocus}
              finalFocus={finalFocus}
              className={cx(
                "relative flex w-full max-w-[640px] flex-col bg-surface text-ink shadow-floating outline-none touch-none",
                fullScreenOnPhone
                  ? "h-[calc(100dvh-var(--drawer-keyboard-inset,0px))] pt-[env(safe-area-inset-top)]"
                  : "max-h-[calc(88dvh-var(--drawer-keyboard-inset,0px))] rounded-t-[22px]",
                // A5: follow the finger; slide in and out from below.
                "[transform:translateY(var(--drawer-swipe-movement-y,0px))]",
                "motion-safe:transition-transform motion-safe:duration-[450ms] motion-safe:ease-drawer",
                "motion-safe:data-starting-style:[transform:translateY(100%)] motion-safe:data-ending-style:[transform:translateY(100%)]",
                "data-swipe-dismiss:duration-[calc(var(--drawer-swipe-strength,1)*400ms)]",
                "data-swiping:transition-none data-swiping:select-none",
                // Reduced motion: opacity only.
                "motion-reduce:transition-opacity motion-reduce:duration-150 motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0",
                // Paper under the sheet, so an upward overscroll never shows a gap at the bottom edge.
                "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-surface",
              )}
            >
              <span aria-hidden className="mx-auto mt-2 block h-1 w-9 shrink-0 rounded-full bg-line-strong" />
              <SheetHeader
                parts={{ Title: Drawer.Title, Description: Drawer.Description, Close: Drawer.Close }}
                title={title}
                description={description}
                eyebrow={eyebrow}
                onBack={onBack}
                className="px-4 pt-1.5"
              />
              <Drawer.Content
                className={cx(
                  "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-auto px-4 pt-3",
                  footer == null ? "pb-[max(1rem,env(safe-area-inset-bottom))]" : "pb-4",
                  bodyClassName,
                )}
              >
                {children}
              </Drawer.Content>
              {footer != null && (
                <div className="shrink-0 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
              )}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

function DialogSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  description,
  eyebrow,
  onBack,
  children,
  footer,
  dismissible = true,
  initialFocus,
  finalFocus,
  bodyClassName,
}: SheetProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={onOpenChangeComplete}
      disablePointerDismissal={!dismissible}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cx(backdropBase, "opacity-(--sheet-scrim) transition-opacity duration-200 ease-out-strong motion-reduce:duration-150")}
        />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <Dialog.Popup
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            className={cx(
              "relative flex max-h-[min(88dvh,760px)] w-[480px] max-w-full flex-col rounded-[22px] bg-surface text-ink shadow-floating outline-none",
              "transition-[scale,opacity] duration-200 ease-out-strong motion-reduce:duration-150",
              "data-starting-style:opacity-0 data-ending-style:opacity-0",
              "motion-safe:data-starting-style:scale-[.96] motion-safe:data-ending-style:scale-[.96]",
            )}
          >
            <SheetHeader
              parts={{ Title: Dialog.Title, Description: Dialog.Description, Close: Dialog.Close }}
              title={title}
              description={description}
              eyebrow={eyebrow}
              onBack={onBack}
              className="px-6 pt-5"
            />
            <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4", footer == null ? "pb-6" : "pb-5", bodyClassName)}>
              {children}
            </div>
            {footer != null && <div className="shrink-0 border-t border-line px-6 py-4">{footer}</div>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type TitlePart = typeof Drawer.Title | typeof Dialog.Title;
type DescriptionPart = typeof Drawer.Description | typeof Dialog.Description;
type ClosePart = typeof Drawer.Close | typeof Dialog.Close;

function SheetHeader({
  parts,
  title,
  description,
  eyebrow,
  onBack,
  className,
}: {
  parts: { Title: TitlePart; Description: DescriptionPart; Close: ClosePart };
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  onBack?: () => void;
  className?: string;
}) {
  const { Title, Description, Close } = parts;
  return (
    <div className={cx("flex shrink-0 items-start gap-1", className)}>
      {onBack && <IconButton icon={ChevronLeft} label={actionCopy.back} onClick={onBack} className="-ml-2.5" />}
      {/* 9px top: centres the 26px title line on the 44px buttons beside it. */}
      <div className={cx("min-w-0 flex-1 pt-[9px]", onBack && "pl-0.5")}>
        {eyebrow != null && <p className="mb-1 legend text-ink-2">{eyebrow}</p>}
        <Title className="font-display text-h3 text-ink">{title}</Title>
        {description != null && <Description className="mt-1 text-body text-ink-2">{description}</Description>}
      </div>
      <Close aria-label={actionCopy.close} className={cx(iconButtonClasses({ variant: "quiet" }), "-mr-2.5")}>
        <X aria-hidden size={20} strokeWidth={1.75} className="size-5" />
      </Close>
    </div>
  );
}
