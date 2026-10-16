/**
 * Kafe modu · Askı (design-system.md §10.10, §9.10): the café's rail plus the till steppers.
 * The askı numbers come from the shared board (polled by the staff tabs); the till items come
 * from the café's menu (askı items only), loaded by `TillPanel`.
 */
import { askiCopy, staffCopy } from "@peni/brand/copy";
import { useCallback } from "react";
import { BoardErrorBanner, loadBoard, StaffGate, StaffScreen, TillPanel, TillPanelSkeleton, useBoard } from "@/components/staff";
import { Banner } from "@/components/ui";
import { useSession } from "@/lib/session";

const ASKI_OFF = "Bu kafede askı kapalı.";

export default function KafeAski() {
  const { api, staffKey } = useSession();
  const { slug, data, error, loading, unauthorized } = useBoard();

  const refresh = useCallback(async () => {
    if (slug) await loadBoard(api, slug);
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
