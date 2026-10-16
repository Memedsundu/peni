"use client";

import { createPeniClient } from "@peni/api";

/** localStorage key for the café staff key (shared with the staff chrome's `storage` listener). */
export const STAFF_KEY = "peni.staffKey";

export function readStaffKey(): string | null {
  try {
    return localStorage.getItem(STAFF_KEY);
  } catch {
    return null;
  }
}

export function writeStaffKey(key: string): void {
  try {
    localStorage.setItem(STAFF_KEY, key);
  } catch {
    // Private mode: the key just won't be remembered.
  }
}

export function clearStaffKey(): void {
  try {
    localStorage.removeItem(STAFF_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Ends the customer session (clears the httpOnly cookie). Throws when the server refuses. */
export async function signOut(): Promise<void> {
  const res = await fetch("/api/v1/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error(String(res.status));
}

/** Same-origin client: the session travels in the httpOnly cookie. */
export const peni = createPeniClient({ baseUrl: "", getStaffKey: readStaffKey });
