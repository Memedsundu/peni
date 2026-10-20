"use client";

import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { useEffect, useRef } from "react";

/** Peni's colours as the chart sees them, read from the page so dark mode follows (D29). */
export interface ChartColors {
  ink: string;
  muted: string;
  line: string;
  green: string;
  /** What a chart points out; amber, far from black (--chart-accent). */
  accent: string;
  mark: string;
  paper: string;
  red: string;
  font: string;
}

let loading: Promise<typeof import("echarts/core")> | null = null;

/** Only the parts of ECharts the panel draws: bars and lines on a grid, in SVG. */
function loadECharts() {
  loading ??= Promise.all([import("echarts/core"), import("echarts/charts"), import("echarts/components"), import("echarts/renderers")]).then(
    ([core, charts, components, renderers]) => {
      core.use([charts.BarChart, charts.LineChart, components.GridComponent, components.TooltipComponent, components.LegendComponent, renderers.SVGRenderer]);
      return core;
    },
  );
  return loading;
}

function colorsOf(el: HTMLElement): ChartColors {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    ink: v("--ink"),
    muted: v("--muted"),
    line: v("--line"),
    green: v("--green"),
    accent: v("--chart-accent"),
    mark: v("--mark"),
    paper: v("--paper"),
    red: v("--red"),
    font: css.fontFamily,
  };
}

/** What every chart shares: quiet axes, the panel's font, a tooltip like a card. */
export function baseOption(c: ChartColors): EChartsCoreOption {
  return {
    textStyle: { fontFamily: c.font },
    animationDuration: 400,
    tooltip: {
      trigger: "axis",
      backgroundColor: c.paper,
      borderColor: c.line,
      textStyle: { color: c.ink, fontFamily: c.font },
      axisPointer: { type: "line", lineStyle: { color: c.line } },
    },
  };
}

export const axisLabel = (c: ChartColors) => ({ fontFamily: c.font, color: c.muted, fontSize: 12 });

/**
 * An ECharts chart in Peni's look. `option` is built from the colours, so it is drawn again
 * when the theme changes; it resizes with its box. `label` says in words what it shows,
 * for screen readers.
 */
export function Chart({ option, height, label }: { option: (c: ChartColors) => EChartsCoreOption; height: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const build = useRef(option);
  build.current = option;

  useEffect(() => {
    const el = box.current!;
    let gone = false;
    const draw = () => chart.current?.setOption({ ...baseOption(colorsOf(el)), ...build.current(colorsOf(el)) }, { notMerge: true });
    void loadECharts().then((echarts) => {
      if (gone) return;
      chart.current = echarts.init(el, null, { renderer: "svg" });
      draw();
    });
    const resize = new ResizeObserver(() => chart.current?.resize());
    resize.observe(el);
    // The theme lives on <html data-theme>.
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      gone = true;
      resize.disconnect();
      theme.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (el && chart.current) chart.current.setOption({ ...baseOption(colorsOf(el)), ...option(colorsOf(el)) }, { notMerge: true });
  }, [option]);

  return <div ref={box} role="img" aria-label={label} style={{ height }} className="w-full min-w-0" />;
}

/** Axis numbers: "12 bin", "1,2 mn". */
export function compactTL(kurus: number, lang: "tr" | "en"): string {
  const tl = kurus / 100;
  const abs = Math.abs(tl);
  const locale = lang === "tr" ? "tr-TR" : "en-GB";
  // One decimal under 10 thousand, so 1.000 and 1.200 don't both read "1 bin".
  const n = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 });
  if (abs >= 1_000_000) return lang === "tr" ? `${n(tl / 1_000_000)} mn` : `${n(tl / 1_000_000)}m`;
  if (abs >= 1000) return lang === "tr" ? `${n(tl / 1000)} bin` : `${n(tl / 1000)}k`;
  return String(Math.round(tl));
}

/** Percent change; null when there's nothing to compare with, or the base was a loss. */
export function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** "+%12" in Turkish, "+12%" in English. */
export function signedPercent(n: number, lang: "tr" | "en"): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  return lang === "tr" ? `${sign}%${Math.abs(n)}` : `${sign}${Math.abs(n)}%`;
}
