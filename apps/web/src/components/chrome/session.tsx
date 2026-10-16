"use client";

import { createContext, useContext } from "react";

/**
 * What the customer chrome knows about the visitor, read on the server in
 * (customer)/layout.tsx so the first paint is already right (no signed-out flash).
 * `null` means signed out. Refreshed by `router.refresh()` after sign-in, sign-out or joining.
 */
export interface ChromeSession {
  /** Display name; empty until the customer has told us their name [G8]. */
  name: string;
  /** At least one membership, so a Peni kodu exists [G7b]. Gates every "Peni kodum" entry. */
  hasMemberships: boolean;
}

const SessionContext = createContext<ChromeSession | null>(null);

export function ChromeSessionProvider({ session, children }: { session: ChromeSession | null; children: React.ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** The signed-in visitor, or `null`. */
export function useChromeSession(): ChromeSession | null {
  return useContext(SessionContext);
}
