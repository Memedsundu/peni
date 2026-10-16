"use client";

import type { CafeSummaryDTO } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { Store } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Banner, Button, EmptyState, Skeleton } from "@/components/ui";
import { peni } from "@/lib/client";
import { CafeCard } from "./cafe-card";

type State = { kind: "ok"; cafes: CafeSummaryDTO[] } | { kind: "loading" } | { kind: "error"; retrying: boolean };

/**
 * "Kafeler" (design-system.md §9.1): h2 and the card grid, 1 column, 2 from 640, 3 from 1024,
 * gap 16. The server hands over the list it read; when that read failed (`initial === null`)
 * the client loads it itself, showing skeleton cards, and an inline danger banner with
 * "Tekrar dene" if that fails too. The hero above never goes away.
 */
export function CafeList({ initial }: { initial: CafeSummaryDTO[] | null }) {
  const [state, setState] = useState<State>(initial ? { kind: "ok", cafes: initial } : { kind: "loading" });

  // A server refresh (sign-in, a join elsewhere) brings a new list: show it.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    if (initial) setState({ kind: "ok", cafes: initial });
  }

  const load = useCallback(async () => {
    try {
      const { cafes } = await peni.cafes.list();
      setState({ kind: "ok", cafes });
    } catch {
      setState({ kind: "error", retrying: false });
    }
  }, []);

  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  return (
    <section aria-labelledby="kafeler" aria-busy={state.kind === "loading" || undefined}>
      <h2 id="kafeler" className="font-display text-h2 text-ink">
        Kafeler
      </h2>
      <div className="mt-4 md:mt-5">
        {state.kind === "ok" && state.cafes.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.cafes.map((cafe) => (
              <li key={cafe.id} className="@container min-w-0">
                <CafeCard cafe={cafe} />
              </li>
            ))}
          </ul>
        )}
        {state.kind === "ok" && state.cafes.length === 0 && (
          <EmptyState icon={Store} text="Yakında burada mahallenin kafeleri olacak." />
        )}
        {state.kind === "loading" && <CafeGridSkeleton />}
        {state.kind === "error" && (
          <Banner
            tone="danger"
            title={errorCopy.cafesLoad}
            action={
              <Button
                size="sm"
                variant="secondary"
                loading={state.retrying}
                loadingLabel={errorCopy.retry}
                onClick={() => {
                  setState({ kind: "error", retrying: true });
                  void load();
                }}
              >
                {errorCopy.retry}
              </Button>
            }
          />
        )}
      </div>
    </section>
  );
}

/** Three cards with the real geometry: the 16/7 cover, then 16, 22 and 16px bars (§9.1). */
export function CafeGridSkeleton() {
  return (
    <ul aria-hidden className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0.42, 0.6, 0.5].map((w, i) => (
        <li key={i}>
          <div className="overflow-hidden rounded-[14px] bg-surface shadow-raised">
            <Skeleton radius={0} className="aspect-[16/7] w-full" />
            <div className="flex flex-col p-4 md:p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-[22px]" style={{ width: `${w * 100}%` }} />
              <Skeleton className="mt-5 h-4 w-44" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
