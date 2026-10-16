import { notFound } from "next/navigation";

/**
 * Any URL no route matches lands here, so the 404 renders inside the customer chrome
 * ((customer)/not-found.tsx) instead of a bare page.
 */
export default function Missing(): never {
  notFound();
}
