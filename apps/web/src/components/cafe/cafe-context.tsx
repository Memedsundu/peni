"use client";

import * as React from "react";
import type { CafeDetailDTO } from "@peni/api";

/**
 * The café page's shared state (§9.3). The page shell provides it; the Askı
 * module and the Masa feed read it with `useCafe()` and take no props.
 */
export interface CafeCtx {
  cafe: CafeDetailDTO;
  signedIn: boolean;
  member: boolean;
  /** Re-fetch the café detail. Errors after the first load never wipe the page. */
  refresh(): Promise<void>;
  /**
   * Signed out: go to /giris?returnTo=/k/{slug}. Not a member: open the join
   * sheet and run `then()` after a successful join and refresh. Member: run `then()` now.
   */
  requireJoin(then?: () => void): void;
  /** Put the askı item into the cart as the ikram line and show the cart. */
  addIkram(productId: string): void;
  /** The product currently in the cart as the ikram line, if any. */
  ikramProductId: string | null;
  /** Why ordering is blocked right now, if it is. */
  orderingBlocked: null | "closed" | "preorder_off";
}

export const CafeContext = React.createContext<CafeCtx | null>(null);

export function useCafe(): CafeCtx {
  const ctx = React.useContext(CafeContext);
  if (!ctx) throw new Error("useCafe() must be used inside <CafeContext.Provider>");
  return ctx;
}
