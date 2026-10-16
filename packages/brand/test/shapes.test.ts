/** §6 geometry helpers: the numbers both platforms draw from. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCss, OUT } from "../scripts/build-css.ts";
import { coinArt, faviconSvg } from "../scripts/coin-svg.ts";
import { CHIME, chimeSamples, chimeWav } from "../scripts/wav.ts";
import {
  APPROX,
  askiItemFor,
  beads,
  COIN,
  COIN_GLYPH,
  coinLayers,
  DEVICE,
  deviceOrder,
  HOOK,
  hookPath,
  ITEM,
  itemViewBox,
  longTableLayout,
  MANICULE,
  P_GLYPH,
  paintProps,
  railLayout,
  scallopCircles,
  SIMIT_GLYPH,
  TABLE,
} from "../src/shapes";
import { cssVar, cssVarName, light } from "../src/tokens";

const PATH_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;

describe("path data", () => {
  it("every glyph is a valid path string", () => {
    for (const d of [P_GLYPH, ...Object.values(DEVICE), HOOK, TABLE, MANICULE, SIMIT_GLYPH, COIN_GLYPH.d, APPROX.d, COIN.rim.d]) {
      expect(d).toMatch(PATH_CHARS);
    }
    for (const item of Object.values(ITEM)) for (const el of item.els) if (el.kind === "path") expect(el.d).toMatch(PATH_CHARS);
  });

  it("P_GLYPH is 30 units tall and centred at (32, 33)", () => {
    const nums = [...P_GLYPH.matchAll(/[A-Za-z]|-?\d*\.?\d+/g)].map((m) => m[0]);
    // All commands in P_GLYPH are absolute (M Q V L H Z), so collect x/y pairs per command.
    const xs: number[] = [];
    const ys: number[] = [];
    let cmd = "";
    let args: number[] = [];
    const flush = () => {
      if (cmd === "V") args.forEach((y) => ys.push(y));
      else if (cmd === "H") args.forEach((x) => xs.push(x));
      else for (let i = 0; i + 1 < args.length; i += 2) (xs.push(args[i]!), ys.push(args[i + 1]!));
      args = [];
    };
    for (const t of nums) {
      if (/[A-Za-z]/.test(t)) {
        flush();
        cmd = t;
      } else args.push(Number(t));
    }
    flush();
    expect(Math.min(...ys)).toBe(18);
    expect(Math.max(...ys)).toBe(48);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(32, 0);
  });

  it("device order is cezve, glass, fincan (hash order, §4.6)", () => {
    expect(deviceOrder).toEqual(["cezve", "glass", "fincan"]);
  });
});

describe("coin", () => {
  it("36 beads on r 28.5 starting at 0°", () => {
    const b = beads();
    expect(b).toHaveLength(36);
    expect(b[0]).toEqual({ cx: 60.5, cy: 32 });
    expect(b[9]).toEqual({ cx: 32, cy: 60.5 });
    expect(b[18]).toEqual({ cx: 3.5, cy: 32 });
  });

  it("layers per size (§6.1 table)", () => {
    expect(coinLayers(16)).toMatchObject({ beads: false, hairline: false, p: true, device: false, band: false });
    expect(coinLayers(28)).toMatchObject({ beads: true, hairline: true, p: true, device: false });
    expect(coinLayers(56)).toMatchObject({ beads: true, hairline: true, p: false, device: true, initials: true, band: false });
    expect(coinLayers(96)).toMatchObject({ beads: true, hairline: false, device: true, initials: true, band: true, legend: true });
    expect(coinLayers(56).deviceTransform?.transform).toBe("translate(23 12) scale(.75)");
    expect(coinLayers(96).deviceTransform?.transform).toBe("translate(25 15) scale(.58)");
    expect(coinLayers(96).initialsAt).toEqual({ topY: 37.5, topSize: 7, bottomY: 43.5, bottomSize: 4.5 });
  });

  it("the generic coin centres the p at scale(.8) about (32, 30) and has no device", () => {
    const g = coinLayers(96, { generic: true });
    expect(g).toMatchObject({ p: true, device: false, initials: false, band: true, legend: true });
    expect(g.pTransform).toMatchObject({ scale: 0.8, tx: 6.4, ty: 6 });
    expect(COIN.generic.legend).toBe("PENİ · MAHALLENİN MASASI");
  });

  it("the back face shows beads and the value only", () => {
    expect(coinLayers(56, { face: "back" })).toMatchObject({ beads: true, p: false, device: false, initials: false, legend: false });
    expect(COIN.back.label.text).toBe("PENİ");
  });

  it("app icon art scales the p ×1.15 about its centre", () => {
    expect(COIN.icon.p).toMatchObject({ scale: 1.15, tx: -4.8, ty: -4.95 });
    expect(coinArt({ p: COIN.icon.p })).toContain('transform="translate(-4.8 -4.95) scale(1.15)"');
  });

  it("icon.svg uses P_GLYPH, not a font", () => {
    const svg = faviconSvg();
    expect(svg).toContain(P_GLYPH);
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("Georgia");
    const onDisk = readFileSync(resolve(fileURLToPath(new URL("../../../apps/web/src/app/icon.svg", import.meta.url))), "utf8");
    expect(onDisk).toBe(svg);
  });
});

describe("askı rail", () => {
  it("md: min(12, floor(width/28)) slots, W = slots × 28, H 40", () => {
    const r = railLayout(300, "md");
    expect(r.slots).toBe(10);
    expect(r.width).toBe(280);
    expect(r.viewBox).toBe("0 0 280 40");
    expect(r.cx.slice(0, 3)).toEqual([14, 42, 70]);
    expect(railLayout(1000, "md").slots).toBe(12);
    expect(railLayout(10, "md").slots).toBe(1);
  });

  it("sm: 6 slots at .75 (pitch 21, height 30)", () => {
    const r = railLayout(1000, "sm");
    expect(r.slots).toBe(6);
    expect(r.pxPitch).toBe(21);
    expect(r.pxWidth).toBe(126);
    expect(r.pxHeight).toBe(30);
  });

  it("maxSlots caps the rail (take sheet mini rail: md, 6)", () => {
    expect(railLayout(400, "md", { maxSlots: 6 }).slots).toBe(6);
  });

  it("rail, finials and hooks", () => {
    const r = railLayout(84, "md");
    expect(r.rail).toEqual({ x: 1, y: 3, width: 82, height: 3, rx: 1.5 });
    expect(r.finials).toEqual([
      { cx: 2.5, cy: 4.5, r: 2.5 },
      { cx: 81.5, cy: 4.5, r: 2.5 },
    ]);
    expect(r.hooks[0]).toBe("M18 6v7a4 4 0 0 1-8 0v-1.5");
    expect(hookPath(14)).toBe(r.hooks[0]);
    expect(r.pivotY).toBe(17);
  });

  it("items fill from the left; above the slots the last slot is +N (N = count − slots + 1)", () => {
    expect(railLayout(168, "md", { count: 4 })).toMatchObject({ items: 4, tag: null });
    expect(railLayout(168, "md", { count: 6 })).toMatchObject({ items: 6, tag: null });
    expect(railLayout(168, "md", { count: 10 })).toMatchObject({ items: 5, tag: { slot: 5, n: 5, label: "+5" } });
    expect(railLayout(168, "md", { count: 0 })).toMatchObject({ items: 0, tag: null });
  });

  it("the glyph matches the caption", () => {
    expect(askiItemFor("Çay")).toBe("glass");
    expect(askiItemFor("Rize Çayı")).toBe("glass");
    expect(askiItemFor("Simit")).toBe("simit");
    expect(askiItemFor("Türk Kahvesi")).toBe("fincan");
    expect(askiItemFor(null)).toBe("fincan");
  });

  it("simit hangs by its hole, with the hook drawn over it", () => {
    expect(ITEM.simit.offsetY).toBe(-4.5);
    expect(ITEM.simit.hookOnTop).toBe(true);
    expect(itemViewBox("glass").viewBox).toBe("-14 -1 28 24");
    expect(itemViewBox("simit").top).toBeLessThanOrEqual(-5.2);
  });

  it("paintProps resolves token paints for either platform", () => {
    const glass = ITEM.glass.els[0]!;
    expect(paintProps(glass, cssVar)).toMatchObject({ fill: "var(--aski)", stroke: "var(--ink)", strokeWidth: 1.25 });
    expect(paintProps(glass, (t) => light[t])).toMatchObject({ fill: light.aski, stroke: light.ink });
    expect(paintProps(ITEM.glass.els[1]!, cssVar).fill).toBe("none");
    expect(paintProps(ITEM.simit.els[1]!, cssVar)).toMatchObject({ cx: 4.98, cy: 5.13, r: 0.7, fill: "var(--on-aski)" });
  });

  it("cssVarName handles digits", () => {
    expect(cssVarName("surface2")).toBe("surface-2");
    expect(cssVarName("onSuccess2")).toBe("on-success-2");
    expect(cssVarName("lineStrong")).toBe("line-strong");
  });
});

describe("long table", () => {
  it("capacity 14: W = 240, 7 + 7 chairs", () => {
    const t = longTableLayout(14, []);
    expect(t).toMatchObject({ drawn: 14, top: 7, bottom: 7, width: 240, viewBox: "0 0 240 92" });
    expect(t.table).toMatchObject({ x: 8, y: 30, width: 224, height: 32, rx: 8 });
    expect(t.chairs.every((c) => c.state === "empty")).toBe(true);
  });

  it("fills T0, B0, T1, B1, … from the left", () => {
    const t = longTableLayout(14, [{ initials: "AK" }, { initials: null }, { me: true, initials: "VS" }]);
    const [t0, b0, t1] = t.chairs;
    expect(t0).toMatchObject({ row: "top", cx: 24, cy: 14, state: "taken", initials: "AK" });
    expect(b0).toMatchObject({ row: "bottom", cx: 24, cy: 78, state: "taken", initials: null });
    expect(t1).toMatchObject({ row: "top", cx: 56, cy: 14, state: "me", initials: "VS" });
    expect(t.chairs.filter((c) => c.state === "empty")).toHaveLength(11);
  });

  it("odd capacity puts the extra chair on top", () => {
    const t = longTableLayout(5, []);
    expect(t).toMatchObject({ top: 3, bottom: 2, width: 112 });
  });

  it("above 16 chairs the last bottom chair becomes +N, and me stays visible", () => {
    const seats = Array.from({ length: 19 }, (_, i) => ({ initials: null, me: i === 18 }));
    const t = longTableLayout(20, seats);
    expect(t.drawn).toBe(16);
    const last = t.chairs[15]!;
    expect(last).toMatchObject({ row: "bottom", state: "more", label: "+5" });
    expect(t.chairs.some((c) => c.state === "me")).toBe(true);
  });
});

describe("fiş scallop", () => {
  it("centred by default, like the web mask's 50% position", () => {
    const s = scallopCircles(100);
    expect(s).toMatchObject({ height: 6, r: 6, cy: 6 });
    expect(s.circles.some((c) => c.cx === 50)).toBe(true);
    for (const c of s.circles) expect(c.cx + 6 > 0 && c.cx - 6 < 100).toBe(true);
    const xs = s.circles.map((c) => c.cx);
    expect(xs.map((x) => 100 - x).sort((a, b) => a - b)).toEqual([...xs].sort((a, b) => a - b));
  });

  it("align start gives the literal cx = 8 + 16i", () => {
    expect(scallopCircles(40, { align: "start" }).circles.map((c) => c.cx)).toEqual([8, 24, 40]);
  });
});

describe("tokens.css", () => {
  it("is in sync with tokens.ts (pnpm brand:css --check)", () => {
    expect(readFileSync(OUT, "utf8")).toBe(buildCss());
  });
});

describe("new-order chime (§15 Sound)", () => {
  it("is a 0.6 s, 44.1 kHz, mono, 16-bit PCM WAV", () => {
    const wav = chimeWav();
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(44_100);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(Math.round(44_100 * 0.6) * 2);
  });

  it("peaks at −6 dBFS, starts and ends silent", () => {
    const s = chimeSamples();
    const peak = Math.max(...Array.from(s, Math.abs));
    expect(20 * Math.log10(peak)).toBeCloseTo(CHIME.peakDbfs, 1);
    expect(s[0]).toBe(0);
    expect(Math.max(...Array.from(s.slice(Math.round(0.43 * 44_100)), Math.abs))).toBe(0);
  });

  it("is the asset on disk", () => {
    const onDisk = readFileSync(resolve(fileURLToPath(new URL("../../../apps/mobile/assets/sounds/new-order.wav", import.meta.url))));
    expect(onDisk.equals(chimeWav())).toBe(true);
  });
});
