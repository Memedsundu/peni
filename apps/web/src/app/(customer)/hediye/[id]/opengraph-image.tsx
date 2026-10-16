import type { GiftPreviewDTO } from "@peni/api";
import { cafeHue, SEP, trUpper } from "@peni/brand/format";
import { type CafeHue, cafeHues } from "@peni/brand/tokens";
import { ImageResponse } from "next/og";
import { coinDataUri, OG, OG_FONT, OG_SIZE, ogFonts } from "@/components/home/og-art";
import { getApp } from "@/server/runtime";
import { giftShareCopy } from "./og-copy";

/** One image per gift; its alt text is the title the image draws (expired, peni-only…). */
export async function generateImageMetadata({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await params;
  const gift = await read(id);
  return [{ id: "kart", alt: giftShareCopy(gift).title, size: OG_SIZE, contentType: "image/png" }];
}

/**
 * The link preview of a shared ısmarlama (design-system.md §15, P2): the café's colourway as
 * a 24px band, the coin, "Seni bir çay bekliyor" and who sent it. Crawlers are signed out,
 * so it shows only what the public preview [G11] shows. Unknown or broken gifts fall back to
 * the plain brand line.
 */
export default async function GiftOpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [fonts, gift] = await Promise.all([ogFonts(), read(id)]);

  const { title, line } = giftShareCopy(gift);
  const band = gift ? cafeHues[await hueOf(gift.cafeSlug)] : OG.ink;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: OG.bg }}>
        <div style={{ height: 24, width: "100%", background: band }} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 64, padding: "0 88px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
          <img src={coinDataUri()} width={240} height={240} alt="" style={{ width: 240, height: 240, flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontFamily: OG_FONT.semibold, fontWeight: 600, fontSize: 26, letterSpacing: "0.08em", color: OG.ink2 }}>
              {gift ? `ISMARLAMA${SEP}${trUpper(gift.cafeName)}` : "PENİ"}
            </div>
            <div style={{ marginTop: 16, fontFamily: OG_FONT.display, fontWeight: 600, fontSize: 80, lineHeight: 1.05, letterSpacing: "-0.015em", color: OG.ink }}>
              {title}
            </div>
            {line && (
              <div style={{ marginTop: 20, fontFamily: OG_FONT.body, fontWeight: 400, fontSize: 36, lineHeight: 1.3, color: OG.ink2 }}>{line}</div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

async function read(id: string): Promise<GiftPreviewDTO | null> {
  try {
    const app = await getApp();
    return await app.giftPreview(id, null);
  } catch {
    return null;
  }
}

/** The café's own colourway [G9] (the gift preview doesn't carry it), else the slug's. */
async function hueOf(slug: string): Promise<CafeHue> {
  try {
    const app = await getApp();
    const cafe = (await app.listCafes(null)).find((c) => c.slug === slug);
    return cafe?.hue ?? cafeHue(slug);
  } catch {
    return cafeHue(slug);
  }
}
