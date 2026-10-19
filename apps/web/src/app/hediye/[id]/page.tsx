import type { Metadata } from "next";
import { GiftByLink } from "../gift";

export const metadata: Metadata = { title: "Ismarlama", robots: { index: false } };

/** A treat's own link, shared by the sender or sent by email (plan piece 12). */
export default async function GiftPage({ params }: { params: Promise<{ id: string }> }) {
  return <GiftByLink id={(await params).id} />;
}
