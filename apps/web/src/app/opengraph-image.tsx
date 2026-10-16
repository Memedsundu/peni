import { ImageResponse } from "next/og";
import { coinDataUri, OG, OG_FONT, OG_SIZE, ogFonts } from "@/components/home/og-art";

export const alt = "peni — Mahallenin masası.";
export const size = OG_SIZE;
export const contentType = "image/png";

/**
 * The site's Open Graph image (design-system.md §15): 1200×630 on the paper colour, a 360px
 * coin on the left, and on the right "peni" in Brygada 600 at 120px and "Mahallenin
 * masası." in Archivo 400 at 40px.
 */
export default async function OpengraphImage() {
  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 72,
          background: OG.bg,
          padding: "0 96px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
        <img src={coinDataUri()} width={360} height={360} alt="" style={{ width: 360, height: 360 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: OG_FONT.display, fontWeight: 600, fontSize: 120, lineHeight: 1, letterSpacing: "-0.02em", color: OG.ink }}>peni</div>
          <div style={{ marginTop: 24, fontFamily: OG_FONT.body, fontWeight: 400, fontSize: 40, lineHeight: 1.2, color: OG.ink2 }}>Mahallenin masası.</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
