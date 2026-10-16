// Kafe modu Rapor (§10.10), first cut on the legacy kit; ReportList arrives in §16 step 6.
import { staffCopy } from "@peni/brand/copy";
import { formatNumber, formatPeni } from "@peni/brand/format";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { Card, ErrorText, Label, Screen, useLegacyTheme } from "@/components/legacy-ui";
import { useSession } from "@/lib/session";
import { space, typeStyle } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function Rapor() {
  const { api, staffKey, staffSlug } = useSession();
  const t = useLegacyTheme();
  const { data, error, loading, refresh } = useLoad(
    useCallback(
      () => (staffKey && staffSlug ? api.staff.dashboard(staffSlug) : Promise.resolve(null)),
      [api, staffKey, staffSlug],
    ),
  );
  const r = data?.report;
  const c = staffCopy.report;
  const rows: { label: string; value: string; note?: string }[] = r
    ? [
        { label: c.issued, value: formatPeni(r.issuedPeni) },
        { label: c.spent, value: formatPeni(r.redeemedPeni) },
        { label: c.outstanding, value: formatPeni(r.outstandingPeni), note: c.outstandingNote },
        {
          label: c.askiIn,
          value: formatPeni(r.askidaDonatedByMembersPeni + r.askidaTillDonationsPeni + r.askidaMatchedByCafePeni),
          note: c.askiInSplit(r.askidaDonatedByMembersPeni, r.askidaTillDonationsPeni, r.askidaMatchedByCafePeni),
        },
        { label: c.askiOut, value: c.askiOutValue(r.askidaClaims) },
        { label: c.members, value: formatNumber(data?.memberCount ?? 0) },
      ]
    : [];

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <ErrorText>{error}</ErrorText>
      {r && <Label>{c.title}</Label>}
      {r && (
        <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
          {rows.map((row, i) => (
            <View
              key={row.label}
              style={{
                minHeight: space.row,
                paddingVertical: space.rowV,
                paddingHorizontal: space.rowH,
                gap: 2,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: t.line,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
                <Text maxFontSizeMultiplier={1.6} style={[typeStyle("body"), { color: t.ink, flex: 1 }]}>
                  {row.label}
                </Text>
                <Text maxFontSizeMultiplier={1.6} style={[typeStyle("price"), { color: t.ink }]}>
                  {row.value}
                </Text>
              </View>
              {row.note ? (
                <Text maxFontSizeMultiplier={1.6} style={[typeStyle("meta"), { color: t.ink2 }]}>
                  {row.note}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
