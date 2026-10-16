"use client";

import { useParams } from "next/navigation";
import { CafeSkeleton } from "@/components/cafe/cafe-states";

/** Shown while the café streams in: the café's own plate and the page's real geometry. */
export default function Loading() {
  const params = useParams<{ slug?: string }>();
  return <CafeSkeleton slug={typeof params?.slug === "string" ? params.slug : null} />;
}
