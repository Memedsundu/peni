"use client";

import type { StaffDashboardDTO } from "@peni/api";
import { staffCopy } from "@peni/brand/copy";
import { formatNumber } from "@peni/brand/format";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import { Card, NumberRoll, Skeleton } from "@/components/ui";
import { trend, trendSpoken, type Trend } from "./model";

interface ReportRow {
  key: string;
  label: string;
  value: number;
  /** The unit written after the number ("peni", "ikram"); none when the label carries it. */
  unit?: string;
  previous: number | null | undefined;
  note?: ReactNode;
}

/**
 * Rapor (design-system.md §9.10): h2 "Son 30 gün", then one raised card of rows — the label in
 * `text-body`, the value in `text-h3` Archivo 600 tabular, rolling with NumberFlow. A quiet
 * "±%" against the previous 30 days sits under a value only when there is a previous figure to
 * compare with [G21]. No charts.
 */
export function ReportList({ data }: { data: Pick<StaffDashboardDTO, "report" | "memberCount"> }) {
  const r = data.report;
  const p = r.previous;
  const askiIn = r.askidaDonatedByMembersPeni + r.askidaTillDonationsPeni + r.askidaMatchedByCafePeni;
  const askiInBefore = p ? p.askidaDonatedByMembersPeni + p.askidaTillDonationsPeni + p.askidaMatchedByCafePeni : null;
  const t = staffCopy.report;

  const rows: ReportRow[] = [
    { key: "issued", label: t.issued, value: r.issuedPeni, previous: p?.issuedPeni },
    { key: "spent", label: t.spent, value: r.redeemedPeni, previous: p?.redeemedPeni },
    { key: "outstanding", label: t.outstanding, value: r.outstandingPeni, previous: p?.outstandingPeni, note: t.outstandingNote },
    {
      key: "askiIn",
      label: t.askiIn,
      value: askiIn,
      unit: "peni",
      previous: askiInBefore,
      note: t.askiInSplit(r.askidaDonatedByMembersPeni, r.askidaTillDonationsPeni, r.askidaMatchedByCafePeni),
    },
    { key: "askiOut", label: t.askiOut, value: r.askidaClaims, unit: "ikram", previous: p?.askidaClaims },
    { key: "members", label: t.members, value: data.memberCount, previous: p?.memberCount },
  ];
  const anyTrend = rows.some((row) => trend(row.value, row.previous) != null);

  return (
    <section aria-labelledby="rapor-title" className="max-w-[640px]">
      <h2 id="rapor-title" className="font-display text-h2 text-ink">
        {t.title}
      </h2>
      {anyTrend && <p className="mt-1 text-meta text-ink-2">Yüzdeler önceki 30 güne göre.</p>}
      <Card padding="none" className="mt-5 overflow-hidden">
        <dl className="divide-y divide-line">
          {rows.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-4 px-4 py-4 md:px-5">
              <div className="min-w-0">
                <dt className="text-body text-ink">{row.label}</dt>
                {row.note && <dd className="mt-1 max-w-[36ch] text-meta text-ink-2">{row.note}</dd>}
              </div>
              <dd className="flex shrink-0 flex-col items-end text-right">
                <span className="font-sans text-h3 text-ink tabular-nums">
                  <NumberRoll value={row.value} kind="number" />
                  {row.unit && <span> {row.unit}</span>}
                </span>
                <TrendLine t={trend(row.value, row.previous)} />
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

function TrendLine({ t }: { t: Trend | null }) {
  if (!t) return null;
  const Arrow = t.direction === "up" ? ArrowUp : ArrowDown;
  return (
    <span className="mt-0.5 inline-flex items-center gap-0.5 text-meta text-ink-2 tabular-nums">
      <span aria-hidden className="inline-flex items-center gap-0.5">
        {t.direction === "flat" ? (
          "aynı"
        ) : (
          <>
            <Arrow size={16} strokeWidth={1.75} absoluteStrokeWidth className="size-4" />%{formatNumber(t.percent)}
          </>
        )}
      </span>
      <span className="sr-only">{trendSpoken(t)}</span>
    </span>
  );
}

export function ReportSkeleton() {
  return (
    <div aria-hidden className="max-w-[640px]">
      <Skeleton className="h-7 w-40" />
      <Skeleton radius={14} className="mt-5 h-[452px] w-full" />
    </div>
  );
}
