/**
 * Rapor (design-system.md §9.10, §10.10): h2 "Son 30 gün", then one raised card of rows — the
 * label in `body`, the value at `h3` size in Archivo 600, tabular, rolling with the CountWheel
 * (A17). A quiet "±%" against the previous 30 days sits under a value only when there is a
 * previous figure to compare with [G21]; it is `ink2` with an arrow, never green or red (a rise
 * is not "good" for every row). No charts.
 *
 * `data={null}` is the loading form: the same card with its real labels, and static skeletons
 * where the figures will land (nothing jumps when they do).
 */
import type { StaffDashboardDTO } from "@peni/api";
import { staffCopy } from "@peni/brand/copy";
import { formatNumber } from "@peni/brand/format";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Card, CountWheel, Icon, Skeleton, T } from "@/components/ui";
import { fonts, space, typeScale, useTokens } from "@/lib/theme";
import { trend, trendSpoken, type Trend } from "./model";

interface ReportRow {
  key: string;
  label: string;
  /** Null while loading. */
  value: number | null;
  /** Written after the number ("peni", "ikram"); none when the label carries the unit. */
  unit?: string;
  previous: number | null | undefined;
  /** A static note, or null while a data-driven one loads. */
  note?: string | null;
}

export const TRENDS_NOTE = "Yüzdeler önceki 30 güne göre.";

function rowsFor(data: Pick<StaffDashboardDTO, "report" | "memberCount"> | null): ReportRow[] {
  const c = staffCopy.report;
  const r = data?.report;
  const p = r?.previous;
  const askiIn = r ? r.askidaDonatedByMembersPeni + r.askidaTillDonationsPeni + r.askidaMatchedByCafePeni : null;
  const askiInBefore = p ? p.askidaDonatedByMembersPeni + p.askidaTillDonationsPeni + p.askidaMatchedByCafePeni : null;
  return [
    { key: "issued", label: c.issued, value: r?.issuedPeni ?? null, previous: p?.issuedPeni },
    { key: "spent", label: c.spent, value: r?.redeemedPeni ?? null, previous: p?.redeemedPeni },
    { key: "outstanding", label: c.outstanding, value: r?.outstandingPeni ?? null, previous: p?.outstandingPeni, note: c.outstandingNote },
    {
      key: "askiIn",
      label: c.askiIn,
      value: askiIn,
      unit: "peni",
      previous: askiInBefore,
      note: r ? c.askiInSplit(r.askidaDonatedByMembersPeni, r.askidaTillDonationsPeni, r.askidaMatchedByCafePeni) : null,
    },
    { key: "askiOut", label: c.askiOut, value: r?.askidaClaims ?? null, unit: "ikram", previous: p?.askidaClaims },
    { key: "members", label: c.members, value: data?.memberCount ?? null, previous: p?.memberCount },
  ];
}

export function ReportList({ data }: { data: Pick<StaffDashboardDTO, "report" | "memberCount"> | null }) {
  const t = useTokens();
  const rows = rowsFor(data);
  const anyTrend = rows.some((row) => row.value != null && trend(row.value, row.previous) != null);

  return (
    <View style={styles.wrap} accessibilityState={data ? undefined : { busy: true }}>
      <View style={styles.head}>
        <T variant="h2" accessibilityRole="header">
          {staffCopy.report.title}
        </T>
        {anyTrend ? (
          <T variant="meta" color="ink2">
            {TRENDS_NOTE}
          </T>
        ) : null}
      </View>
      <Card padding="none">
        {rows.map((row, i) => {
          const tr = row.value != null ? trend(row.value, row.previous) : null;
          const spoken =
            row.value != null
              ? `${row.label}: ${formatNumber(row.value)}${row.unit ? ` ${row.unit}` : ""}${tr ? `, ${trendSpoken(tr)}` : ""}`
              : row.label;
          return (
            <View
              key={row.key}
              accessible
              accessibilityLabel={row.note ? `${spoken}. ${row.note}` : spoken}
              style={[styles.row, i ? { borderTopWidth: 1, borderTopColor: t.line } : null]}
            >
              <View style={styles.labelCol}>
                <T variant="body">{row.label}</T>
                {row.note ? (
                  <T variant="meta" color="ink2" tabular>
                    {row.note}
                  </T>
                ) : row.note === null ? (
                  <Skeleton width={180} line="meta" />
                ) : null}
              </View>
              <View style={styles.valueCol}>
                {row.value != null ? (
                  <View style={styles.value}>
                    <CountWheel value={row.value} variant="h3" textStyle={styles.valueText} />
                    {row.unit ? (
                      <T variant="h3" style={styles.valueText}>
                        {` ${row.unit}`}
                      </T>
                    ) : null}
                  </View>
                ) : (
                  <Skeleton width={row.unit ? 96 : 64} line="h3" />
                )}
                <TrendLine trend={tr} />
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

function TrendLine({ trend: tr }: { trend: Trend | null }) {
  const t = useTokens();
  if (!tr) return null;
  return (
    <View aria-hidden style={styles.trend}>
      {tr.direction === "flat" ? null : <Icon icon={tr.direction === "up" ? ArrowUp : ArrowDown} size={16} color={t.ink2} />}
      <T variant="meta" color="ink2" tabular>
        {tr.direction === "flat" ? "aynı" : `%${formatNumber(tr.percent)}`}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  head: { gap: 4 },
  row: {
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: space.card,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  labelCol: { flex: 1, minWidth: 0, gap: 4, paddingTop: 2 },
  valueCol: { alignItems: "flex-end", flexShrink: 0 },
  value: { flexDirection: "row", alignItems: "flex-end" },
  // `h3` size and line, in Archivo 600 (§9.10): figures, not headings.
  valueText: { fontFamily: fonts.sansSemiBold, letterSpacing: 0, lineHeight: typeScale.h3.lineHeight },
  trend: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
});
