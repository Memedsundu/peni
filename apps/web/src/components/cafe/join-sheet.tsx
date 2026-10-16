"use client";

import { actionCopy } from "@peni/brand/copy";
import { CircleAlert } from "lucide-react";
import { Coin, type CoinCafe } from "@/components/brand";
import { Button, Sheet } from "@/components/ui";

export interface JoinRequest {
  /** "Katıl ve ekle" (menu "+"), "Katıl ve devam et" (askı, masa), "Kafeye katıl". */
  primary: string;
  /** Where /giris sends a signed-out visitor back to: "/k/moda?ekle=latte". */
  returnTo: string;
}

/**
 * The join sheet (design-system.md §9.3, D11): what a non-member's "+" opens. Signed out, the
 * primary becomes "Giriş yap ve katıl" and goes to /giris; the page re-opens the sheet (or
 * finishes the add) on return. Errors stay inline; the page behind is never touched.
 */
export function JoinSheet({
  open,
  onOpenChange,
  cafe,
  signedIn,
  request,
  busy,
  error,
  onJoin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cafe: CoinCafe;
  signedIn: boolean;
  request: JoinRequest;
  busy: boolean;
  error: string | null;
  onJoin: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={actionCopy.join}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-meta text-danger">
              <CircleAlert aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="mt-px size-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          {signedIn ? (
            <Button fullWidth loading={busy} loadingLabel={request.primary} onClick={onJoin}>
              {request.primary}
            </Button>
          ) : (
            <Button fullWidth href={`/giris?returnTo=${encodeURIComponent(request.returnTo)}`}>
              {actionCopy.signInAndJoin}
            </Button>
          )}
          <Button variant="quiet" fullWidth onClick={() => onOpenChange(false)} disabled={busy}>
            {actionCopy.cancel}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-4 pb-1">
        <Coin size={56} cafe={cafe} className="shrink-0" />
        <p className="text-body-lg text-ink">
          {cafe.name} üyesi olunca sipariş verir, her harcamada peni biriktirirsin. Üyelik ücretsiz.
        </p>
      </div>
    </Sheet>
  );
}
