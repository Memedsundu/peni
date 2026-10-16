import type { GiftPreviewDTO } from "@peni/api";
import { cafeHue, formatPeni, numberWord, SEP, trUpper } from "@peni/brand/format";
import { cafeHues } from "@peni/brand/tokens";
import { ImageResponse } from "next/og";
import { coinDataUri, OG, OG_FONT, OG_SIZE, ogFonts } from "@/components/home/og-art";
import { getApp } from "@/server/runtime";

export const alt = "Seni bir çay bekliyor";
export const size = OG_SIZE;
export const contentType = "image/png";

/**
 * The link preview of a shared ısmarlama (design-system.md §15, P2): the café's colourway as
 * a 24px band, the coin, "Seni bir çay bekliyor" and who sent it. Crawlers are signed out,
 * so it shows only what the public preview [G11] shows. Unknown or broken gifts fall back to
 * the plain brand line.
 */
export default async function GiftOpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [fonts, gift] = await Promise.all([ogFonts(), read(id)]);

  const what = gift ? (gift.goods ?? formatPeni(gift.peni)) : null;
  const pending = gift?.status === "pending" || gift?.status === "accepted";
  const title = !gift ? "Mahallenin masası." : pending ? `Seni ${spoken(what!)} bekliyor` : "Bu ısmarlamanın süresi doldu.";
  const line = gift && pending ? `${gift.fromFirstName} sana ${gift.cafeName} için ${what} ısmarladı.` : null;
  const band = gift ? cafeHues[cafeHue(gift.cafeSlug)] : OG.ink;

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
    { ...size, fonts },
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

function spoken(goods: string): string {
  const m = /^(\d+) (.+)$/.exec(goods);
  return m ? `${numberWord(Number(m[1]))} ${m[2]}` : goods;
}
