/**
 * Kafe modu (design-system.md §9.10, §10.10): the staff board store, its poller, the press
 * frame, StaffTicket, TillPanel and ReportList. Import from "@/components/staff".
 */
export {
  applyTillDonation,
  bumpOrder,
  findOrder,
  flushBumps,
  getBoard,
  loadBoard,
  messageOf,
  rejectOrder,
  selectCafe,
  setPause,
  useBoard,
  type BoardSnapshot,
} from "./board-store";
export { loadCafeDetail, useCafeDetail, useCafeHue, type CafeDetailEntry } from "./cafe-detail";
export { StaffGate, GATE_ACTION, GATE_TEXT, BACK_TO_CUSTOMER } from "./gate";
export { KeepAwakeWhileFocused, useNow, useSettling } from "./hooks";
export * from "./model";
export { StaffBoardPoller, POLL_MS } from "./poller";
export { PausePill, PressClock, PressNameplate, TezgahStrip } from "./press-strip";
export { ReportList, TRENDS_NOTE } from "./report-list";
export { StaffScreen, type StaffScreenProps } from "./staff-screen";
export { StaffTicket, StaffTicketSkeleton, type StaffTicketProps } from "./ticket";
export { TillPanel, TillPanelSkeleton } from "./till-panel";
export { BoardErrorBanner } from "./error-banner";
