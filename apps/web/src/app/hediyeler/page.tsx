import type { Metadata } from "next";
import { Treats } from "./treats";

export const metadata: Metadata = { title: "Ismarlamalar", robots: { index: false } };

/** Treats waiting for the customer, the ones they sent, and their Peni kodu (plan piece 12). */
export default function TreatsPage() {
  return <Treats />;
}
