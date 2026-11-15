import type { Metadata } from "next";
import { headers } from "next/headers";
import type { SharePreview } from "@/server/app";
import { getApp } from "@/server/runtime";

/** Penny's coin, for a link whose post and café have no photo. */
const FALLBACK_IMAGE = "/coin-large.png";

/**
 * The title, description and link card (Open Graph, Twitter) for a café's page or one post's
 * page, so a shared link shows the café's name and a photo instead of "Kafe · Penny".
 */
export async function shareMetadata(slug: string, postId?: string): Promise<Metadata> {
  let preview: SharePreview | null = null;
  try {
    preview = await (await getApp()).sharePreview(slug, postId);
  } catch (error) {
    // A link card is a nicety: the page still opens with the plain title.
    console.error(error);
  }
  if (!preview) return { title: "Kafe" };
  return toMetadata(preview, `/kafe/${encodeURIComponent(slug)}${postId ? `/g/${encodeURIComponent(postId)}` : ""}`, await publicBase());
}

/**
 * Links in a card must be whole addresses. PENI_PUBLIC_URL when it's set, as for links in
 * emails; until then (production has no domain of its own yet) the address this visitor came
 * to, which is the one they are sharing.
 */
async function publicBase(): Promise<string | null> {
  const set = process.env.PENI_PUBLIC_URL?.trim();
  if (set) return set;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return `${h.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

function toMetadata(preview: SharePreview, path: string, base: string | null): Metadata {
  const title = preview.title === preview.cafeName ? preview.cafeName : `${preview.title} · ${preview.cafeName}`;
  const image = preview.imageUrl ?? FALLBACK_IMAGE;
  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    title,
    description: preview.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Penny",
      locale: "tr_TR",
      url: path,
      title,
      description: preview.description,
      images: [{ url: image, alt: preview.cafeName }],
    },
    twitter: {
      // The coin is small and square; a real photo gets the large card.
      card: preview.imageUrl ? "summary_large_image" : "summary",
      title,
      description: preview.description,
      images: [image],
    },
  };
}
