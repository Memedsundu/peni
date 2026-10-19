import { JOB_LOCK_MS, JOB_MAX_ATTEMPTS, JOB_RETRY_MS, type AiEvent, type AssistantStore, type Job } from "@peni/core";
import { randomUUID } from "node:crypto";
import { eventId } from "./assistant";

/** What a handler says about a try: finished with a result, or failed (and whether to try again). */
export type JobOutcome = { result: Record<string, unknown> } | { error: string; retry: boolean };

export type JobHandler = (job: Job) => Promise<JobOutcome>;

/**
 * Background jobs (plan piece 24), kept in Postgres. A job runs right after it is added
 * (the route hands `runSoon` to Next's `after`), so a document is read while the person
 * waits. Anything left over, a retry or a server that died mid-job, runs on the next pass:
 * whenever someone opens Taslaklar, and on the morning cron. Nothing else to host.
 */
export class JobRunner {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(
    private readonly store: AssistantStore,
    private readonly now: () => Date,
  ) {}

  handle(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async add(cafeId: string, kind: string, payload: Record<string, unknown>): Promise<Job> {
    const now = this.now();
    const job: Job = {
      id: `job_${randomUUID()}`,
      cafeId,
      kind,
      payload,
      status: "queued",
      attempts: 0,
      runAt: now,
      lockedUntil: null,
      lastError: null,
      result: null,
      createdAt: now,
      finishedAt: null,
    };
    await this.store.addJob(job);
    return job;
  }

  /** Runs what is due, a few at a time, until nothing is left or `max` have run. */
  async runDue(max = 10): Promise<number> {
    let ran = 0;
    while (ran < max) {
      const now = this.now();
      const jobs = await this.store.claimJobs(now, Math.min(3, max - ran), new Date(now.getTime() + JOB_LOCK_MS));
      if (!jobs.length) break;
      await Promise.all(jobs.map((j) => this.run(j)));
      ran += jobs.length;
    }
    return ran;
  }

  private async run(job: Job): Promise<void> {
    const handler = this.handlers.get(job.kind);
    let outcome: JobOutcome;
    try {
      outcome = handler ? await handler(job) : { error: `No handler for ${job.kind}`, retry: false };
    } catch (error) {
      outcome = { error: error instanceof Error ? error.message : String(error), retry: true };
    }
    const now = this.now();
    if ("result" in outcome) {
      await this.store.saveJob({ ...job, status: "done", lockedUntil: null, result: outcome.result, finishedAt: now });
      return;
    }
    const again = outcome.retry && job.attempts < JOB_MAX_ATTEMPTS;
    await this.store.saveJob({
      ...job,
      status: again ? "queued" : "failed",
      runAt: again ? new Date(now.getTime() + JOB_RETRY_MS[job.attempts - 1]!) : job.runAt,
      lockedUntil: null,
      lastError: outcome.error.slice(0, 500),
      finishedAt: again ? null : now,
    });
    if (!again) await this.store.addEvent(failedEvent(job, outcome.error, now));
  }
}

function failedEvent(job: Job, error: string, at: Date): AiEvent {
  return {
    id: eventId(),
    cafeId: job.cafeId,
    at,
    kind: "job.failed",
    memberId: typeof job.payload.by === "string" ? job.payload.by : null,
    purpose: job.kind,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    ms: null,
    ok: false,
    detail: error.slice(0, 300),
    draftId: null,
    documentId: typeof job.payload.documentId === "string" ? job.payload.documentId : null,
    jobId: job.id,
  };
}
