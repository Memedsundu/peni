"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { Legend, ResponsiveContainer, Tooltip } from "recharts";

/**
 * shadcn/ui's chart pieces (https://ui.shadcn.com/charts, MIT), in Peni's look: a frame that
 * names each series and gives it a colour as `--color-<key>`, a tooltip like a card, and a
 * legend. The colours are Peni's own tokens (--ink, --mark, --green), so dark mode follows.
 * Recharts draws the chart itself.
 */

export type ChartConfig = Record<string, { label: string; color: string }>;

/** The box a chart draws in. `label` says in words what it shows, for screen readers. */
export function ChartContainer({ config, height, label, children }: { config: ChartConfig; height: number; label: string; children: ReactNode }) {
  const vars = Object.fromEntries(Object.entries(config).map(([key, v]) => [`--color-${key}`, v.color])) as CSSProperties;
  return (
    <div
      role="img"
      aria-label={label}
      style={{ height, ...vars }}
      className="w-full min-w-0 text-xs [&_.recharts-cartesian-axis-tick_text]:fill-[var(--muted)] [&_.recharts-cartesian-grid_line]:stroke-[var(--line)] [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none"
    >
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/** A gradient id that is unique on the page, for an area's fill. */
export function useFillId(name: string): string {
  return `${name}-${useId().replace(/:/g, "")}`;
}

interface Row {
  dataKey?: string | number | ((obj: unknown) => unknown);
  name?: string | number;
  value?: unknown;
  color?: string;
}

/**
 * The tooltip: the point's label, then each series with its colour and value. `rowLabel`
 * names a row by what it really is (its own date, "4 Eyl"), and then the heading goes:
 * each row already says which day it is.
 */
export function ChartTooltip({
  config,
  format,
  line = true,
  rowLabel,
}: {
  config: ChartConfig;
  format: (value: number, key: string) => string;
  line?: boolean;
  rowLabel?: (key: string, row: Record<string, unknown>) => string | null;
}) {
  return (
    <Tooltip
      // A thin line on line and area charts; nothing on bars, where the bar itself is the mark.
      cursor={line ? { stroke: "var(--line)", strokeWidth: 1 } : false}
      isAnimationActive={false}
      content={(props) => {
        const { active, payload, label } = props as { active?: boolean; payload?: readonly (Row & { payload?: Record<string, unknown> })[]; label?: unknown };
        if (!active || !payload?.length) return null;
        // In the order the chart names them (this period before the one it's set against), not the order they're drawn.
        const order = Object.keys(config);
        const at = (p: Row) => order.indexOf(String(p.dataKey ?? p.name ?? ""));
        const rows = payload.filter((p) => typeof p.value === "number").sort((a, b) => at(a) - at(b));
        if (!rows.length) return null;
        return (
          <div className="flex min-w-36 flex-col gap-1.5 rounded-xl border border-line bg-paper px-3 py-2 text-xs shadow-sm">
            {!rowLabel && <span className="font-medium text-ink">{String(label ?? "")}</span>}
            {rows.map((p) => {
              const key = String(p.dataKey ?? p.name ?? "");
              const name = (rowLabel && p.payload ? rowLabel(key, p.payload) : null) ?? config[key]?.label ?? key;
              return (
                <span key={key} className="flex items-center justify-between gap-4">
                  <span className={`flex items-center gap-1.5 ${rowLabel ? "text-ink" : "text-muted"}`}>
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ background: `var(--color-${key})` }} />
                    {name}
                  </span>
                  <span className="tabular font-medium text-ink">{format(p.value as number, key)}</span>
                </span>
              );
            })}
          </div>
        );
      }}
    />
  );
}

/** The legend, top right, in the chart's own colours. */
export function ChartLegend({ config, dashed = [] }: { config: ChartConfig; dashed?: string[] }) {
  return (
    <Legend
      verticalAlign="top"
      align="right"
      height={28}
      content={() => (
        <ul className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted">
          {Object.entries(config).map(([key, v]) => (
            <li key={key} className="flex items-center gap-1.5">
              {dashed.includes(key) ? (
                <span aria-hidden="true" className="w-3 border-t-2 border-dashed" style={{ borderColor: `var(--color-${key})` }} />
              ) : (
                <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: `var(--color-${key})` }} />
              )}
              {v.label}
            </li>
          ))}
        </ul>
      )}
    />
  );
}
