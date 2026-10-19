import type { OrderClaimDTO, PaymentMethodDTO } from "@peni/api";

/**
 * The link between the till and its customer screen (plan piece 7). The screen is a
 * second window on the same computer, shown on the small monitor facing the customer,
 * so the two talk through the browser itself (BroadcastChannel): instant, and nothing
 * about an unpaid order leaves the computer. The screen says "hello" when it opens and
 * the till answers with what it shows.
 */
export type DisplayLine = { name: string; quantity: number; discountPercent: number; totalKurus: number };

export type DisplayState =
  | { kind: "idle" }
  | {
      kind: "order";
      lines: DisplayLine[];
      subtotalKurus: number;
      discountKurus: number;
      totalKurus: number;
      /** Peni the customer spent on it, and what's left to pay (piece 11). */
      peni?: number;
      dueKurus?: number;
    }
  | {
      kind: "paid";
      number: number;
      lines: DisplayLine[];
      discountKurus: number;
      totalKurus: number;
      method: PaymentMethodDTO;
      changeKurus: number | null;
      claim: OrderClaimDTO | null;
      peni?: number;
    };

type Message = { type: "state"; state: DisplayState } | { type: "hello" };

export function displayLink(deviceId: string, on: { state?: (s: DisplayState) => void; hello?: () => void }) {
  if (typeof BroadcastChannel === "undefined") return { send: () => {}, close: () => {} };
  const channel = new BroadcastChannel(`peni.till.${deviceId}`);
  channel.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.type === "state") on.state?.(e.data.state);
    else if (e.data?.type === "hello") on.hello?.();
  };
  return {
    send: (msg: Message) => channel.postMessage(msg),
    close: () => channel.close(),
  };
}
