import type { TerminalResultDTO, TerminalTaskDTO } from "@peni/api";
import { NO_CAPABILITIES, type DriverIO, type DriverStatus, type TerminalDriver } from "./types";

/** How the till computer reaches the Ingenico: over the café's network, or a cable. */
export interface IngenicoOptions {
  connection: "tcp" | "serial";
  /** The device's address on the café's network, from its own settings screen: "192.168.1.25". */
  host?: string;
  port?: number;
  /** A cable's port on the computer: "COM3". */
  path?: string;
  baudRate?: number;
}

const WAITING = "Ingenico bağlantısı, Ingenico'nun protokol belgeleri gelince yazılacak.";

/**
 * The Ingenico yazarkasa (D24, N12): the one piece still to write, once Ingenico sends the
 * protocol documents. It isn't guessed here: Shelby's `IngenicoECR.ts` guessed a frame format
 * and was never checked against a device, and a wrong guess at a fiscal device is worse than
 * none. Until then it says it isn't ready, so the till takes payments by hand.
 *
 * What it has to do, against the documents:
 * - `status`: reach the device; it's ready when it's paired with this computer (GMP-3's
 *   "eşleşme", when the documents say so), has paper and isn't in the middle of something.
 *   Its model and mali sicil (serial) number go in the status.
 * - `run` a sale: open a receipt; add each `sale.lines` item under its `department` with its
 *   name, quantity and price, and its own discount; take `sale.discounts` off the subtotal;
 *   add `sale.paidBefore` as payments of the type the documents give for "other" (penny, askı
 *   as a payment); then take `sale.take`: cash with what was handed over, or a card, which the
 *   device charges through its bank. Close the receipt and answer with its fiş no, Z no, EKÜ
 *   no and the card's last four digits, approval code and bank reference (RRN). Pass `io.ref`
 *   as the transaction's own reference if the protocol has one.
 * - While the card is awaited, report `io.progress` stages; if `io.signal` aborts before the
 *   bank has it, cancel on the device and answer "cancelled". If the bank declines, void
 *   the open receipt and answer "declined" with the bank's code and words. Anything that
 *   fails before money could move is "failed" with the device's own message.
 * - `run` a refund: the bank's iade with the sale's `original.terminal.card` (RRN, approval
 *   code) and the device's return document for its lines. Then switch on `refund` below.
 * - `run` a report: X or Z, answered with the Z report's numbers (`ZReportDataDTO`).
 * - `recover`: ask the device for its last transactions and find `ref` among them, for a job
 *   the computer was restarted in the middle of. Null when the device can't say.
 * - Map the device's error codes to Turkish words a barista understands.
 */
export class IngenicoDriver implements TerminalDriver {
  readonly name = "ingenico";

  constructor(readonly options: IngenicoOptions) {}

  async status(): Promise<DriverStatus> {
    return { ready: false, message: WAITING, model: "Ingenico", serial: null, capabilities: NO_CAPABILITIES };
  }

  async run(_task: TerminalTaskDTO, _io: DriverIO): Promise<TerminalResultDTO> {
    // Penny sends no sales while `status` says it isn't ready; a test slip from the Cihazlar page gets this.
    return { outcome: "failed", code: "NOT_READY", message: WAITING };
  }

  async recover(): Promise<TerminalResultDTO | null> {
    return null;
  }
}
