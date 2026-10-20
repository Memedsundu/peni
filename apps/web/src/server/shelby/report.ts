import { formatTL } from "@peni/core";
import type { CheckRow } from "./check";
import type { MoveReport } from "./map";

const value = (unit: CheckRow["unit"], n: number) => (unit === "kurus" ? formatTL(n) : unit === "milli" ? String(n / 1000) : String(n));

/** The move's report as Markdown: what moved, what stayed in Shelby and why, and the totals side by side. */
export function reportMarkdown(report: MoveReport, rows: CheckRow[], meta: { when: Date; mode: string }): string {
  const bad = rows.filter((r) => !r.ok);
  const out: string[] = [
    `# Shelby → Peni: ${report.shelbyCafe}`,
    "",
    `${meta.mode}, ${meta.when.toISOString()}. ${report.from ? `Records from ${report.from} on.` : "All records."}`,
    "",
    bad.length ? `**${bad.length} total(s) don't match.** They're marked ✗ below.` : "**Every total matches.**",
    "",
    "## Moved",
    "",
    ...report.moved.map((m) => `- ${m.what}: ${m.count}`),
    "",
    "## Not moved",
    "",
    ...(report.notMoved.length ? report.notMoved.map((n) => `- ${n.what} (${n.count}): ${n.why}`) : ["- Nothing."]),
    "",
    "## To look at",
    "",
    ...(report.warnings.length ? report.warnings.map((w) => `- ${w}`) : ["- Nothing."]),
    "",
    "## Totals",
    "",
    "| | | Shelby | Penny | |",
    "|---|---|---:|---:|---|",
    ...rows.map(
      (r) => `| ${r.group} | ${r.label} | ${value(r.unit, r.shelby)} | ${value(r.unit, r.peni)} | ${r.ok ? (r.shelby === r.peni ? "✓" : "✓ rounding") : "✗"} |`,
    ),
    "",
  ];
  return out.join("\n");
}
