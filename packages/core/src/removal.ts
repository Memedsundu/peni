import type { PeniDirectory } from "./directory";
import type { LedgerStore } from "./ledger";

/**
 * Deleting a café and everything in it (N13). Only the Shelby move does it: its preview copy
 * is replaced by a fresh move from Shelby, and on switch night the last copy by the real one.
 */
export interface CafeRemovalStore {
  /**
   * Deletes the café and every record it holds. A staff account whose only café this was
   * goes with it; one that also works at another café stays. All or nothing. Refused when
   * the café has peni history: the ledger is append-only and is never deleted.
   */
  removeCafe(cafeId: string): Promise<RemovedCafe>;
}

export interface RemovedCafe {
  /** Staff accounts deleted with the café. */
  accountsRemoved: number;
  /** Staff accounts kept: they also work at another café. */
  accountsKept: number;
}

/** Why a café with peni history can't be removed. */
export const peniHistory = (cafeId: string, transactions: number): string =>
  `${cafeId} has peni history (${transactions} ledger transaction(s)); the peni ledger is never deleted, so the café can't be removed`;

/** An in-memory store that can forget one café's records. */
export interface ForgetsCafe {
  forgetCafe(cafeId: string): void;
}

/** Drops the café's records from an in-memory map. */
export function forgetIn<V extends { cafeId: string | null }>(records: Map<string, V>, cafeId: string): void {
  for (const [key, value] of records) if (value.cafeId === cafeId) records.delete(key);
}

/** Drops the café's records from an in-memory list, in place. */
export function forgetInList<V extends { cafeId: string | null }>(records: V[], cafeId: string): void {
  for (let i = records.length - 1; i >= 0; i--) if (records[i]!.cafeId === cafeId) records.splice(i, 1);
}

/** Drops the entries whose key starts with the café's id (`${cafeId}:…`). */
export function forgetKeys(records: Map<string, unknown> | Set<string>, prefix: string): void {
  for (const key of records.keys()) if (key.startsWith(prefix)) records.delete(key);
}

/** The in-memory side: each store forgets the café; the staff store also its people's accounts. */
export class InMemoryCafeRemovalStore implements CafeRemovalStore {
  constructor(
    private readonly ledger: LedgerStore,
    private readonly directory: PeniDirectory,
    private readonly identity: ForgetsCafe & { forgetMemberCodes(membershipIds: string[]): void },
    private readonly staff: { forgetCafe(cafeId: string): RemovedCafe },
    private readonly others: ForgetsCafe[],
  ) {}

  async removeCafe(cafeId: string): Promise<RemovedCafe> {
    const history = (await this.ledger.query({ cafeId })).length;
    if (history) throw new Error(peniHistory(cafeId, history));
    this.identity.forgetMemberCodes((await this.directory.listMemberships({ cafeId })).map((m) => m.id));
    this.identity.forgetCafe(cafeId);
    for (const store of this.others) store.forgetCafe(cafeId);
    return this.staff.forgetCafe(cafeId);
  }
}
