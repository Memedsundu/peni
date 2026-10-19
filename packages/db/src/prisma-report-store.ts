import type { ContentReport, ReportReason, ReportStore, ReportTargetType } from "@peni/core";
import type { ContentReport as Row } from "./generated/client";
import type { Db } from "./db";

export class PrismaReportStore implements ReportStore {
  constructor(private readonly db: Db) {}

  async add(r: ContentReport): Promise<boolean> {
    const { count } = await this.db().contentReport.createMany({ data: [r], skipDuplicates: true });
    return count > 0;
  }

  async listOpen(cafeId: string): Promise<ContentReport[]> {
    const rows = await this.db().contentReport.findMany({ where: { cafeId, status: "open" }, orderBy: { createdAt: "asc" } });
    return rows.map(toDomain);
  }

  async openFor(targetType: ReportTargetType, targetId: string): Promise<ContentReport[]> {
    return (await this.db().contentReport.findMany({ where: { targetType, targetId, status: "open" } })).map(toDomain);
  }

  async reportedBy(cafeId: string, reporterId: string): Promise<Set<string>> {
    const rows = await this.db().contentReport.findMany({ where: { cafeId, reporterId }, select: { targetType: true, targetId: true } });
    return new Set(rows.map((r) => `${r.targetType}:${r.targetId}`));
  }

  async resolve(targetType: ReportTargetType, targetId: string, status: "upheld" | "dismissed", by: string, at: Date): Promise<void> {
    await this.db().contentReport.updateMany({ where: { targetType, targetId, status: "open" }, data: { status, resolvedBy: by, resolvedAt: at } });
  }
}

function toDomain(row: Row): ContentReport {
  return {
    id: row.id,
    cafeId: row.cafeId,
    // Profiles can't be reported yet; every row is a post or a comment.
    targetType: row.targetType as ReportTargetType,
    targetId: row.targetId,
    postId: row.postId ?? row.targetId,
    reporterId: row.reporterId,
    reason: row.reason as ReportReason,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
  };
}
