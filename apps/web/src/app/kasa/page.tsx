import type { Metadata } from "next";
import { Till } from "./till";

export const metadata: Metadata = { title: "Satış ekranı" };

/** Satış ekranı (plan piece 6): on a computer the owner set up as a till. */
export default function KasaPage() {
  return <Till />;
}
