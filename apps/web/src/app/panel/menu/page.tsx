import type { Metadata } from "next";
import { Menu } from "./menu";

export const metadata: Metadata = { title: "Menü · Kafe paneli", robots: { index: false } };

/** Products, prices and how each uses stock, with its cost (plan pieces 5 and 17). `?kafe=moda` picks the café. */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  return <Menu cafeSlug={(await searchParams).kafe ?? null} />;
}
