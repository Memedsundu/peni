import type { TerminalCapabilitiesDTO, TerminalResultDTO, TerminalTaskDTO } from "@peni/api";

/** What the device is doing, as the till shows it. */
export type Stage = "waiting_card" | "pin" | "authorising" | "printing" | "cancelling";

export interface DriverStatus {
  /** It can take a sale right now. */
  ready: boolean;
  /** Why not, or a warning, in the device's words: "Kağıt bitti". */
  message: string | null;
  model: string | null;
  serial: string | null;
  capabilities: TerminalCapabilitiesDTO;
}

export interface DriverIO {
  /** Tell the till what the device is doing. Cheap: call it on every change. */
  progress(stage: Stage | null, message?: string | null): void;
  /** Aborted when the barista backs out. Stop if the device still can (it's still waiting for the card); otherwise finish and say what happened. */
  signal: AbortSignal;
  /** The job's id: give it to the device as the transaction's own reference when it keeps one, so `recover` can find it. */
  ref: string;
}

/**
 * The one part of Penny Köprü that speaks a device's own protocol. Everything else (asking
 * Penny for work, the journal that survives a power cut, retries) is the same for every
 * device. A driver answers every task with what the device did:
 *
 * - "approved" once it's done: the receipt's numbers, the card's, a report's totals.
 * - "declined" when the bank said no, "failed" when the device couldn't do it and nothing
 *   was taken (paper out, not paired), "cancelled" when it stopped because it was asked.
 * - "unknown", or throw, when it can't tell whether money moved. A person then looks at
 *   what the device printed; never guess "failed" when a card might have been charged.
 */
export interface TerminalDriver {
  readonly name: string;
  status(): Promise<DriverStatus>;
  run(task: TerminalTaskDTO, io: DriverIO): Promise<TerminalResultDTO>;
  /**
   * After a restart, for a job that was sent to the device but never answered: what the
   * device says happened to it (devices keep their last transaction). Null when it can't tell.
   */
  recover(ref: string, task: TerminalTaskDTO): Promise<TerminalResultDTO | null>;
}

export const NO_CAPABILITIES: TerminalCapabilitiesDTO = { sale: false, refund: false, reports: false, cancel: false };
