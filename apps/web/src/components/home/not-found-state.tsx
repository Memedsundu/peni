import { actionCopy } from "@peni/brand/copy";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * "Bu sayfa masada yok." — the 404 for both the customer chrome and the bare root. The
 * EmptyState anatomy (§12.2: a 64px `surface-2` disc with a 32px lucide icon at stroke 1.5,
 * one sentence, one secondary button), with the sentence as the page's h1 in Brygada.
 */
export function NotFoundState() {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
      <span aria-hidden className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink-2">
        <Coffee size={32} strokeWidth={1.5} />
      </span>
      <h1 className="font-display text-h3 text-ink">Bu sayfa masada yok.</h1>
      <Button variant="secondary" href="/">
        {actionCopy.backToCafes}
      </Button>
    </div>
  );
}
