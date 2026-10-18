import type { Metadata } from "next";
import { CafePage } from "../cafe";

export const metadata: Metadata = { title: "Kafe" };

/** A café's own page (DS25, plan piece 14): one scroll from the café to its feed. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <CafePage slug={(await params).slug} />;
}
