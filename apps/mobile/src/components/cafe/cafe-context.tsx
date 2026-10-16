/**
 * What the café screen's parts share (design-system.md §10.2): the café, who is looking, why
 * ordering may be blocked, and the routes to the sheets. Provided by `app/kafe/[slug].tsx`.
 */
import type { CafeDetailDTO } from "@peni/api";
import { router } from "expo-router";
import { createContext, useContext } from "react";
import type { OrderingBlocked } from "./aski-model";

/** What to do right after joining in the `katil` sheet. */
export type JoinThen = "birak" | "al";

export interface CafeCtx {
  cafe: CafeDetailDTO;
  slug: string;
  signedIn: boolean;
  member: boolean;
  blocked: OrderingBlocked;
  /** One clock for the screen, so "bugün", "GEÇTİ" and the dateline agree. */
  now: Date;
  /** Re-reads the café quietly; a failure keeps what is on screen. */
  refresh: () => Promise<void>;
}

export const CafeContext = createContext<CafeCtx | null>(null);

export function useCafe(): CafeCtx {
  const ctx = useContext(CafeContext);
  if (!ctx) throw new Error("useCafe outside the café screen");
  return ctx;
}

const q = encodeURIComponent;

/** Sheet routes (root-stack formSheets, §8.4), each opened with `?kafe=<slug>`. */
export const cafeSheets = {
  /** The join sheet (D11): "Katıl ve ekle" with `ekle`, or join and go on to a sheet. */
  join: (slug: string, opts: { add?: string; then?: JoinThen } = {}) =>
    router.push(
      `/katil?kafe=${q(slug)}${opts.add ? `&ekle=${q(opts.add)}` : ""}${opts.then ? `&sonra=${opts.then}` : ""}`,
    ),
  cart: (slug: string) => router.push(`/sepet?kafe=${q(slug)}`),
  take: (slug: string) => router.push(`/askidan-al?kafe=${q(slug)}`),
  give: (slug: string) => router.push(`/askiya-birak?kafe=${q(slug)}`),
  /** The gift flow with this café chosen first (D14). */
  gift: (slug: string) => router.push(`/ismarla?kafe=${q(slug)}`),
};
