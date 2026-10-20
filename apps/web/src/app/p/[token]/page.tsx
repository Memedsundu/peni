import type { Metadata } from "next";
import { ClaimByToken } from "../claim";

export const metadata: Metadata = { title: "Penny'n", robots: { index: false } };

/** What the customer screen's QR opens (plan piece 10). */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  return <ClaimByToken token={(await params).token} />;
}
