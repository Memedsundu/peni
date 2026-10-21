import { isCafePlan, planOn, trialEndFrom, type Cafe, type CafePlan, type IdentityStore } from "@peni/core";
import { AppError } from "./errors";

/**
 * Changes what a café pays for (N11), by hand until there's online payment: `plan` is the
 * one it has after any trial, `trial: "start"` gives it two weeks of everything from now,
 * `trial: "end"` ends a running one. Returns the café as saved.
 */
export async function setCafePlan(
  identity: IdentityStore,
  slug: string,
  change: { plan?: string; trial?: "start" | "end" },
  now: Date,
): Promise<Cafe> {
  const cafe = await identity.getCafeBySlug(slug);
  if (!cafe) throw new AppError("NOT_FOUND", `No café "${slug}"`, 404);
  if (change.plan !== undefined && !isCafePlan(change.plan)) throw new AppError("VALIDATION", `A plan is topluluk, penny or isletme, not "${change.plan}"`, 400);
  const plan: CafePlan = change.plan ?? cafe.plan;
  const trialEndsAt = change.trial === "start" ? trialEndFrom(now) : change.trial === "end" ? null : cafe.trialEndsAt;
  const saved = { ...cafe, plan, trialEndsAt };
  await identity.saveCafe(saved);
  return saved;
}

/** One line per café for the command: "moda: İşletme (pays for Topluluk, trial until 2026-11-15)". */
export function planLine(cafe: Cafe, now: Date): string {
  const trial = cafe.trialEndsAt && cafe.trialEndsAt > now ? `, trial until ${cafe.trialEndsAt.toISOString().slice(0, 10)}` : "";
  return `${cafe.slug}: has ${planOn(cafe, now)} (pays for ${cafe.plan}${trial})`;
}
