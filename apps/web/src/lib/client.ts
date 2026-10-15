"use client";

import { createPeniClient } from "@peni/api";

const STAFF_KEY = "peni.staffKey";

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

/** Same-origin client: the session travels in the httpOnly cookie. */
export const peni = createPeniClient({ baseUrl: "", getStaffKey: readStaffKey });
