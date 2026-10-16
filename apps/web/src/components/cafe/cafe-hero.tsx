"use client";

import type { CafeDetailDTO } from "@peni/api";
import { actionCopy, peniCopy } from "@peni/brand/copy";
import { greeting as greetingFor, SEP } from "@peni/brand/format";
import { CircleAlert, Gift, MapPin } from "lucide-react";
import { Amount } from "@/components/brand";
import { Button } from "@/components/ui";

/** Meta (design-system.md §9.3 item 3): the address with `MapPin`, then the peni rule. */
export function CafeMeta({ cafe }: { cafe: CafeDetailDTO }) {
  const place = [cafe.address, cafe.district].filter(Boolean).join(SEP);
  return (
    <div className="flex flex-col gap-1">
      {place && (
        <p className="flex items-start gap-1.5 text-body text-ink">
          <MapPin aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="mt-[3px] size-4 shrink-0 text-ink-2" />
          <span>{place}</span>
        </p>
      )}
      <p className="text-meta text-ink-2">{peniCopy.earnRule(cafe.earnRatePercent)}</p>
    </div>
  );
}

/** "Günaydın Ayşe." for members; nothing for everyone else. */
export function memberGreeting(member: boolean, firstName: string | null, now: Date): string | null {
  if (!member) return null;
  const hello = greetingFor(now);
  return firstName ? `${hello} ${firstName}.` : `${hello}.`;
}

/**
 * Membership row (§9.3 item 4).
 * - Member: a `peni-soft` chip "Sende **90 peni** · ≈ 3 çay" and a quiet "Bir çay ısmarla"
 *   that opens the gift flow in the wallet with this café chosen first (D14).
 * - Non-member: primary "Kafeye katıl" + the free-membership line.
 * - Signed out: primary "Giriş yap ve katıl", back here afterwards to finish the join.
 */
export function MembershipRow({
  cafe,
  signedIn,
  joining,
  joinError,
  onJoin,
}: {
  cafe: CafeDetailDTO;
  signedIn: boolean;
  joining: boolean;
  joinError: string | null;
  onJoin: () => void;
}) {
  if (cafe.membership) {
    return (
      // gap-x-5 with the quiet button's -ml-3: an 8px gap on one line, and on its own line the
      // gift icon starts on the content edge like everything above it.
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <div className="inline-flex min-h-11 items-center rounded-[10px] bg-peni-soft px-3 py-2 text-ink">
          <Amount
            size="sm"
            peni={cafe.membership.balancePeni}
            refItems={cafe.refItems}
            cafe={cafe}
            prefix={<span className="text-body">{peniCopy.balance(0).before}</span>}
          />
        </div>
        <Button variant="quiet" iconStart={Gift} href={`/cuzdan?ismarla=${encodeURIComponent(cafe.slug)}`} className="-ml-3">
          Bir çay ısmarla
        </Button>
      </div>
    );
  }

  const meta = <p className="text-meta text-ink-2">Üyelik ücretsiz. Sipariş verir, her harcamada peni biriktirirsin.</p>;
  if (!signedIn) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button href={`/giris?returnTo=${encodeURIComponent(`/k/${cafe.slug}?katil=1`)}`}>{actionCopy.signInAndJoin}</Button>
        {meta}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={onJoin} loading={joining} loadingLabel={actionCopy.join}>
        {actionCopy.join}
      </Button>
      {joinError ? (
        <p role="alert" className="flex items-start gap-1.5 text-meta text-danger">
          <CircleAlert aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="mt-px size-4 shrink-0" />
          <span>{joinError}</span>
        </p>
      ) : (
        meta
      )}
    </div>
  );
}
