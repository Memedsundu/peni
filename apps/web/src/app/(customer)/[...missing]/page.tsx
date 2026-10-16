import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** Same title as (customer)/not-found.tsx, so it survives hydration. */
export const metadata: Metadata = { title: "Sayfa bulunamadı" };

/**
 * Any URL no route matches lands here, so the 404 renders inside the customer chrome
 * ((customer)/not-found.tsx) instead of a bare page.
 */
export default function Missing(): never {
  notFound();
}
