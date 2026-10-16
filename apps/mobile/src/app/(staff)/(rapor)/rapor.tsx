/**
 * Kafe modu · Rapor (design-system.md §10.10, §9.10): "Son 30 gün" and one card of figures,
 * each rolling with the CountWheel, with "±%" against the previous 30 days [G21]. The figures
 * come from the shared board (polled by the staff tabs); pull to refresh reloads at once. The
 * café's nameplate sits under the title, so the figures always say whose they are.
 */
import { staffCopy } from "@peni/brand/copy";
import { useCallback } from "react";
import { BoardErrorBanner, loadBoard, PressNameplate, ReportList, StaffGate, StaffScreen, useBoard } from "@/components/staff";
import { useSession } from "@/lib/session";
import { useRememberedCafeName } from "@/lib/staff-prefs";

export default function Rapor() {
  const { api, staffKey } = useSession();
  const { slug, data, error, loading, unauthorized } = useBoard();
  const remembered = useRememberedCafeName(slug);

  const refresh = useCallback(async () => {
    if (slug) await loadBoard(api, slug);
  }, [api, slug]);

  if (!staffKey || !slug || unauthorized) {
    return (
      <StaffScreen title={staffCopy.sections.rapor}>
        <StaffGate rejected={unauthorized} />
      </StaffScreen>
    );
  }

  return (
    <StaffScreen
      title={staffCopy.sections.rapor}
      slug={slug}
      strip={<PressNameplate name={data?.cafe.name ?? remembered} />}
      onRefresh={refresh}
      busy={loading && !data}
      top={error ? <BoardErrorBanner what={staffCopy.sections.rapor} stale={data != null} onRetry={refresh} /> : undefined}
    >
      {data ? <ReportList data={data} /> : loading ? <ReportList data={null} /> : null}
    </StaffScreen>
  );
}
