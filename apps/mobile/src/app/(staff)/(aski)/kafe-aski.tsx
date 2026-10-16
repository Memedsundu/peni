/**
 * Kafe modu · Askı (design-system.md §10.10, §9.10): the café's rail plus the till steppers.
 * The askı numbers come from the shared board (polled by the staff tabs); the till items come
 * from the café's menu (askı items only), loaded once with the board (`cafe-detail`). The
 * café's nameplate sits under the title, so the tab always says which café's askı it is.
 */
import { askiCopy, staffCopy } from "@peni/brand/copy";
import { useCallback } from "react";
import {
  BoardErrorBanner,
  loadBoard,
  loadCafeDetail,
  PressNameplate,
  StaffGate,
  StaffScreen,
  TillPanel,
  TillPanelSkeleton,
  useBoard,
} from "@/components/staff";
import { Banner } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useRememberedCafeName } from "@/lib/staff-prefs";

const ASKI_OFF = "Bu kafede askı kapalı.";

export default function KafeAski() {
  const { api, staffKey } = useSession();
  const { slug, data, error, loading, unauthorized } = useBoard();
  const remembered = useRememberedCafeName(slug);

  const refresh = useCallback(async () => {
    if (slug) await Promise.all([loadBoard(api, slug), loadCafeDetail(api, slug, { force: true })]);
  }, [api, slug]);

  if (!staffKey || !slug || unauthorized) {
    return (
      <StaffScreen title={staffCopy.sections.aski}>
        <StaffGate rejected={unauthorized} />
      </StaffScreen>
    );
  }

  return (
    <StaffScreen
      title={staffCopy.sections.aski}
      slug={slug}
      strip={<PressNameplate name={data?.cafe.name ?? remembered} />}
      onRefresh={refresh}
      busy={loading && !data}
      top={error ? <BoardErrorBanner what={staffCopy.sections.aski} stale={data != null} onRetry={refresh} /> : undefined}
    >
      {!data ? (
        loading ? <TillPanelSkeleton /> : null
      ) : data.askida.enabled ? (
        <TillPanel slug={slug} askida={data.askida} />
      ) : (
        <Banner tone="info" title={ASKI_OFF}>
          {askiCopy.explainer}
        </Banner>
      )}
    </StaffScreen>
  );
}
