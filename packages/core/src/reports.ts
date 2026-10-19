/**
 * Members report what other members wrote: a comment, or an event they opened (plan piece 15).
 * The café's own posts aren't reported; they're the café's to answer for.
 */

export type ReportTargetType = "post" | "comment";
export type ReportReason = "spam" | "rude" | "unsafe" | "other";
export type ReportStatus = "open" | "upheld" | "dismissed";

export const REPORT_REASONS: readonly ReportReason[] = ["spam", "rude", "unsafe", "other"];

/** This many members reporting the same thing hide it until a moderator looks. */
export const AUTO_HIDE_REPORTS = 3;

export interface ContentReport {
  id: string;
  cafeId: string;
  targetType: ReportTargetType;
  targetId: string;
  /** The post the content is on: the event itself, or the comment's post. */
  postId: string;
  /** Customer id. */
  reporterId: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  /** Who closed it: the staff member who looked, or the host who called the event off. */
  resolvedBy: string | null;
}

export interface ReportStore {
  /** One report per member per target: returns false when this member already reported it. */
  add(report: ContentReport): Promise<boolean>;
  /** The café's open reports, oldest first. */
  listOpen(cafeId: string): Promise<ContentReport[]>;
  /** Every report still open on one target. */
  openFor(targetType: ReportTargetType, targetId: string): Promise<ContentReport[]>;
  /** Targets this member reported at this café, as "post:<id>" and "comment:<id>". */
  reportedBy(cafeId: string, reporterId: string): Promise<Set<string>>;
  /** Closes every open report on a target. */
  resolve(targetType: ReportTargetType, targetId: string, status: "upheld" | "dismissed", by: string, at: Date): Promise<void>;
}

export class InMemoryReportStore implements ReportStore {
  private readonly reports: ContentReport[] = [];

  async add(report: ContentReport) {
    const dup = this.reports.some((r) => r.targetType === report.targetType && r.targetId === report.targetId && r.reporterId === report.reporterId);
    if (dup) return false;
    this.reports.push({ ...report });
    return true;
  }

  async listOpen(cafeId: string) {
    return this.reports
      .filter((r) => r.cafeId === cafeId && r.status === "open")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({ ...r }));
  }

  async openFor(targetType: ReportTargetType, targetId: string) {
    return this.reports.filter((r) => r.targetType === targetType && r.targetId === targetId && r.status === "open").map((r) => ({ ...r }));
  }

  async reportedBy(cafeId: string, reporterId: string) {
    return new Set(this.reports.filter((r) => r.cafeId === cafeId && r.reporterId === reporterId).map((r) => `${r.targetType}:${r.targetId}`));
  }

  async resolve(targetType: ReportTargetType, targetId: string, status: "upheld" | "dismissed", by: string, at: Date) {
    for (const r of this.reports) {
      if (r.targetType === targetType && r.targetId === targetId && r.status === "open") Object.assign(r, { status, resolvedBy: by, resolvedAt: at });
    }
  }
}
