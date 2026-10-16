/**
 * Generates every brand asset from src/shapes.ts (§15), with @resvg/resvg-js:
 *
 *   apps/mobile/assets/icon.png                 1024, generic coin on #F4EEE2, opaque
 *   apps/mobile/assets/icon-dark.png            1024, the same coin on #14110E
 *   apps/mobile/assets/icon-tinted.png          1024, transparent, one luminance layer (iOS tinted)
 *   apps/mobile/assets/adaptive-foreground.png  1024, coin at 60% of the 108dp canvas, transparent
 *   apps/mobile/assets/adaptive-monochrome.png  1024, outline + beads + "p" in black, transparent
 *   apps/mobile/assets/splash-icon.png          512, the icon coin on transparent
 *   apps/mobile/assets/favicon.png              48, for Expo web
 *   apps/mobile/assets/sounds/new-order.wav     the staff chime, PCM written in TS
 *   apps/web/src/app/icon.svg                   the 28-layout coin with P_GLYPH
 *   apps/web/src/app/apple-icon.png             180, from the app icon
 *
 *   pnpm --filter @peni/brand make-assets       (or `pnpm brand:assets` from the root)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/*.ts import each other without extensions (as bundlers expect). Node's type stripping
// needs the extension, so map "./tokens" → "./tokens.ts" for .ts parents before loading them.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.endsWith(".ts")) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        /* fall through */
      }
    }
    return nextResolve(specifier, context);
  },
});

const { coinArt, coinDocument, faviconSvg } = await import("./coin-svg.ts");
const { COIN } = await import("../src/shapes.ts");
const { dark, light } = await import("../src/tokens.ts");
const { chimeWav } = await import("./wav.ts");

const require = createRequire(import.meta.url);
const { Resvg } = require("@resvg/resvg-js") as typeof import("@resvg/resvg-js");

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const mobileAssets = resolve(repo, "apps/mobile/assets");
const webApp = resolve(repo, "apps/web/src/app");

const written: string[] = [];

function write(path: string, data: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  written.push(`${relative(repo, path)}  ${(Buffer.byteLength(data) / 1024).toFixed(1)}KB`);
}

function png(svg: string, width: number): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    shapeRendering: 2,
    font: { loadSystemFonts: false },
    logLevel: "error",
  })
    .render()
    .asPng();
}

/** App icon art: the generic coin without its legend band, the "p" ×1.15 (§15). */
const iconP = COIN.icon.p;
const ICON = 1024;
const ICON_COIN = ICON * 0.72; // 737px

const iconLight = coinDocument({ size: ICON, coinDiameter: ICON_COIN, background: light.bg, art: coinArt({ p: iconP }) });
// "The same coin on #14110E": at icon scale the edge already holds at 3.45:1, so the UI's
// dark-theme hairline ring (meant for 16–96px) is left off.
const iconDark = coinDocument({ size: ICON, coinDiameter: ICON_COIN, background: dark.bg, art: coinArt({ p: iconP }) });
const iconTinted = coinDocument({ size: ICON, coinDiameter: ICON_COIN, art: coinArt({ p: iconP, paint: "tinted" }) });

// Android adaptive: 108dp canvas, coin at 60% (inside the 66% safe zone), transparent.
const adaptiveForeground = coinDocument({ size: ICON, coinDiameter: ICON * 0.6, art: coinArt({ p: iconP }) });
const adaptiveMonochrome = coinDocument({ size: ICON, coinDiameter: ICON * 0.6, art: coinArt({ p: iconP, paint: "monochrome" }) });

// Splash: a 512px coin on transparent; the dark ring is invisible on the light splash and
// holds the edge on the dark one (the same image serves both, app.json §14.2).
const SPLASH = 512;
const splash = coinDocument({ size: SPLASH, coinDiameter: SPLASH * (62 / 64), art: coinArt({ p: iconP, darkRing: true }) });

write(resolve(mobileAssets, "icon.png"), png(iconLight, ICON));
write(resolve(mobileAssets, "icon-dark.png"), png(iconDark, ICON));
write(resolve(mobileAssets, "icon-tinted.png"), png(iconTinted, ICON));
write(resolve(mobileAssets, "adaptive-foreground.png"), png(adaptiveForeground, ICON));
write(resolve(mobileAssets, "adaptive-monochrome.png"), png(adaptiveMonochrome, ICON));
write(resolve(mobileAssets, "splash-icon.png"), png(splash, SPLASH));
write(resolve(mobileAssets, "favicon.png"), png(iconLight, 48));
write(resolve(mobileAssets, "sounds/new-order.wav"), chimeWav());

write(resolve(webApp, "icon.svg"), faviconSvg());
write(resolve(webApp, "apple-icon.png"), png(iconLight, 180));

console.log(`make-assets: wrote ${written.length} files\n  ${written.join("\n  ")}`);
