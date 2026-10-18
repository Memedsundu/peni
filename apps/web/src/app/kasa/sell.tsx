"use client";

import { newIdempotencyKey, PeniApiError, type OrderDTO, type PaymentAnswerDTO, type PaymentDTO, type PaymentMethodDTO, type TillMenuDTO } from "@peni/api";
import { formatPercent, formatTL } from "@peni/brand/format";
import { lineTotal, orderTotals, QUICK_DISCOUNTS, type OrderLine } from "@peni/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { displayLink, type DisplayLine, type DisplayState } from "./display";
import type { TillProps } from "./till";
import { Button, Keypad, Notice, Photo, Sheet } from "./ui";

type Cart = {
  lines: OrderLine[];
  discountPercent: number;
  /** Made once per order, so a retried tap never makes a second one. */
  createKey: string;
  /** The server's copy, once the barista has gone to pay. */
  order: OrderDTO | null;
};

type Panel =
  | null
  | { kind: "cash" }
  /** A payment the terminal or the barista still has to settle, or one that just failed. */
  | { kind: "payment"; orderId: string; payment: PaymentDTO; tenderedKurus?: number }
  | { kind: "discount"; productId: string | null };

const emptyCart = (): Cart => ({ lines: [], discountPercent: 0, createKey: newIdempotencyKey(), order: null });

/** What the server has to match: product, quantity and discounts. */
const signature = (lines: { productId: string; quantity: number; discountPercent: number }[], discountPercent: number) =>
  JSON.stringify([lines.map((l) => [l.productId, l.quantity, l.discountPercent]), discountPercent]);

/**
 * Satış ekranı, as in the approved mockup: tabs and photo tiles on the left, the order on the
 * right. Totals are worked out here with the same rule as the server, for speed; the server's
 * numbers are the ones that count, and a mismatch stops the payment for a second look.
 */
export function Sell({ t, slug, onError, deviceId }: TillProps & { deviceId: string }) {
  const [menu, setMenu] = useState<TillMenuDTO | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [panel, setPanel] = useState<Panel>(null);
  const [paid, setPaid] = useState<OrderDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** One key per payment attempt, kept across retries of the same attempt. */
  const payKeys = useRef(new Map<string, string>());

  const loadMenu = useCallback(async () => {
    try {
      const m = await api.staff.till.menu(slug);
      setMenu(m);
      setTab((current) => (m.categories.some((c) => c.id === current) ? current : (m.categories[0]?.id ?? null)));
    } catch (e) {
      setError(onError(e));
    }
  }, [slug, onError]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const totals = useMemo(() => orderTotals(cart.lines, cart.discountPercent), [cart.lines, cart.discountPercent]);

  // What the customer screen shows: the order as it's entered, then the paid order and its peni.
  const shown = useMemo<DisplayState>(() => {
    const line = (l: Pick<OrderLine, "name" | "quantity" | "discountPercent"> & { totalKurus: number }): DisplayLine => ({
      name: l.name,
      quantity: l.quantity,
      discountPercent: l.discountPercent,
      totalKurus: l.totalKurus,
    });
    if (paid) {
      return {
        kind: "paid",
        number: paid.number,
        lines: paid.lines.map(line),
        discountKurus: paid.discountKurus,
        totalKurus: paid.totalKurus,
        method: paid.paymentMethod ?? "card",
        changeKurus: paid.changeKurus,
        claim: paid.claim,
      };
    }
    if (cart.lines.length === 0) return { kind: "idle" };
    return { kind: "order", lines: cart.lines.map((l) => line({ ...l, totalKurus: lineTotal(l) })), ...totals };
  }, [paid, cart.lines, totals]);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const screen = useRef<ReturnType<typeof displayLink> | null>(null);
  useEffect(() => {
    const link = displayLink(deviceId, { hello: () => link.send({ type: "state", state: shownRef.current }) });
    screen.current = link;
    return () => {
      link.send({ type: "state", state: { kind: "idle" } });
      link.close();
    };
  }, [deviceId]);
  useEffect(() => {
    screen.current?.send({ type: "state", state: shown });
  }, [shown]);

  const edit = (change: (c: Cart) => Partial<Cart>) => {
    setError(null);
    setCart((c) => ({ ...c, ...change(c) }));
  };
  const add = (p: TillMenuDTO["categories"][number]["products"][number]) => {
    setPaid(null);
    edit((c) => {
      const existing = c.lines.find((l) => l.productId === p.productId);
      if (existing) return { lines: c.lines.map((l) => (l === existing ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l)) };
      return { lines: [...c.lines, { productId: p.productId, name: p.name, unitPriceKurus: p.priceKurus, quantity: 1, discountPercent: 0 }] };
    });
  };
  const setQuantity = (productId: string, quantity: number) =>
    edit((c) => ({
      lines: quantity <= 0 ? c.lines.filter((l) => l.productId !== productId) : c.lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(99, quantity) } : l)),
    }));
  const setDiscount = (productId: string | null, percent: number) =>
    edit((c) =>
      productId === null ? { discountPercent: percent } : { lines: c.lines.map((l) => (l.productId === productId ? { ...l, discountPercent: percent } : l)) },
    );

  /** Creates the order, or brings the server's copy in line with the screen. */
  const ensureOrder = async (): Promise<OrderDTO | null> => {
    const lines = cart.lines.map(({ productId, quantity, discountPercent }) => ({ productId, quantity, discountPercent }));
    let order = cart.order;
    if (!order) order = await api.staff.till.create(slug, { createKey: cart.createKey, lines, discountPercent: cart.discountPercent });
    if (signature(order.lines, order.discountPercent) !== signature(lines, cart.discountPercent)) {
      order = await api.staff.till.update(slug, order.id, { lines, discountPercent: cart.discountPercent });
    }
    const serverOrder = order;
    setCart((c) => ({ ...c, order: serverOrder }));
    if (serverOrder.totalKurus !== totals.totalKurus) {
      // A price changed on the menu since the tiles loaded: show the server's prices first.
      setCart((c) => ({ ...c, lines: serverOrder.lines.map(({ totalKurus: _, ...l }) => l) }));
      void loadMenu();
      setError(t("pricesChanged"));
      return null;
    }
    return serverOrder;
  };

  const pay = async (method: PaymentMethodDTO, tenderedKurus?: number) => {
    if (busy || cart.lines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const order = await ensureOrder();
      if (!order) return;
      const attempt = `${order.id}|${method}|${tenderedKurus ?? ""}|${order.totalKurus}`;
      const payKey = payKeys.current.get(attempt) ?? newIdempotencyKey();
      payKeys.current.set(attempt, payKey);
      settled(await api.staff.till.pay(slug, order.id, { method, payKey, tenderedKurus }), tenderedKurus);
    } catch (e) {
      if (e instanceof PeniApiError && e.code === "PRODUCT_UNAVAILABLE") void loadMenu();
      setError(onError(e));
      setPanel(null);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Every payment answer lands here, whichever terminal took it: approved shows the paid
   * order; anything else keeps the payment sheet open on it.
   */
  const settled = (answer: PaymentAnswerDTO, tenderedKurus?: number) => {
    if (answer.payment.status === "approved") {
      setPanel(null);
      setPaid(answer.order);
      setCart(emptyCart());
      payKeys.current.clear();
      return;
    }
    // A declined or cancelled payment is over: trying again is a new payment.
    if (answer.payment.status !== "pending") payKeys.current.clear();
    setCart((c) => ({ ...c, order: answer.order }));
    setPanel({ kind: "payment", orderId: answer.order.id, payment: answer.payment, tenderedKurus });
  };

  const settle = async (action: (orderId: string, paymentId: string) => Promise<PaymentAnswerDTO>) => {
    if (panel?.kind !== "payment" || busy) return;
    setBusy(true);
    try {
      settled(await action(panel.orderId, panel.payment.id), panel.tenderedKurus);
    } catch (e) {
      setError(onError(e));
      setPanel(null);
    } finally {
      setBusy(false);
    }
  };

  const closePayment = () => {
    if (panel?.kind === "payment" && panel.payment.status === "pending") {
      const { orderId, payment } = panel;
      // The barista backs out; the order stays as it is for the next try.
      api.staff.till.cancelPayment(slug, orderId, payment.id).catch((e: unknown) => setError(onError(e)));
      payKeys.current.clear();
    }
    setPanel(null);
  };

  const products = menu?.categories.find((c) => c.id === tab)?.products ?? [];
  const discountLine = panel?.kind === "discount" && panel.productId ? cart.lines.find((l) => l.productId === panel.productId) : null;

  return (
    <>
      <section aria-label="Ürünler" className="flex min-w-0 flex-1 flex-col gap-5 overflow-hidden px-6 pt-5 pb-6">
        {menu && menu.categories.length === 0 && <Notice>{t("emptyMenu")}</Notice>}
        <div role="tablist" aria-label="Kategoriler" className="flex shrink-0 gap-2 overflow-x-auto">
          {menu?.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === tab}
              onClick={() => setTab(c.id)}
              className={`min-h-12 shrink-0 cursor-pointer rounded-full border px-[22px] text-base ${
                c.id === tab ? "border-ink bg-ink font-semibold text-paper" : "border-line bg-paper font-medium text-ink"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 grid-cols-2 content-start gap-4 overflow-y-auto pb-2 md:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <button
              key={p.productId}
              type="button"
              onClick={() => add(p)}
              aria-label={`${p.name}, ${formatTL(p.priceKurus)}, ${t("addOne")}`}
              className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-paper text-left text-ink active:scale-[0.98] active:bg-panel"
            >
              <Photo src={p.imageUrl} alt="" label={t("photo")} className="h-32 w-full" />
              <span className="flex items-baseline justify-between gap-2 px-3.5 pt-3 pb-3.5">
                <span className="text-base font-medium">{p.name}</span>
                <span className="tabular text-[15px] text-muted">{formatTL(p.priceKurus)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside aria-label={t("order")} className="flex w-[440px] shrink-0 flex-col border-l border-line bg-panel">
        {paid ? (
          <PaidView t={t} order={paid} onNext={() => setPaid(null)} />
        ) : (
          <>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-xl font-semibold">{t("order")}</h2>
              <Button kind="bare" size="sm" onClick={() => setCart(emptyCart())} disabled={cart.lines.length === 0}>
                {t("clear")}
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
              {cart.lines.length === 0 && <p className="my-10 text-center text-[15px] text-muted">{t("emptyOrder")}</p>}
              {cart.lines.map((l) => (
                <div key={l.productId} className="flex items-center gap-3 border-b border-line-soft py-3">
                  <button
                    type="button"
                    onClick={() => setPanel({ kind: "discount", productId: l.productId })}
                    className="flex min-h-11 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 text-left"
                  >
                    <span className="text-base font-medium">{l.name}</span>
                    <span className="tabular text-[13px] text-muted">
                      {formatTL(l.unitPriceKurus)}
                      {l.discountPercent > 0 && <span className="text-green"> · {formatPercent(l.discountPercent)} {t("discount").toLocaleLowerCase("tr")}</span>}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <RoundButton label={`${l.name} ${t("removeOne")}`} onClick={() => setQuantity(l.productId, l.quantity - 1)}>
                      −
                    </RoundButton>
                    <span className="tabular min-w-7 text-center text-base font-semibold">{l.quantity}</span>
                    <RoundButton label={`${l.name} ${t("addOne")}`} onClick={() => setQuantity(l.productId, l.quantity + 1)}>
                      +
                    </RoundButton>
                  </div>
                  <span className="tabular w-[76px] text-right text-base">{formatTL(lineTotal(l))}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-line px-6 py-4">
              {error && <Notice tone="red">{error}</Notice>}
              <div className="flex flex-col gap-1.5 text-[15px]">
                <div className="flex justify-between text-muted">
                  <span>{t("subtotal")}</span>
                  <span className="tabular">{formatTL(totals.subtotalKurus)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPanel({ kind: "discount", productId: null })}
                  disabled={cart.lines.length === 0}
                  className="-my-2 flex min-h-11 cursor-pointer items-center justify-between text-muted disabled:cursor-default"
                >
                  <span className="underline decoration-line underline-offset-4">
                    {t("discount")}
                    {cart.discountPercent > 0 && ` ${formatPercent(cart.discountPercent)}`}
                  </span>
                  <span className={`tabular ${totals.discountKurus > 0 ? "text-green" : ""}`}>
                    {totals.discountKurus > 0 ? formatTL(-totals.discountKurus) : "—"}
                  </span>
                </button>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[17px] font-semibold">{t("due")}</span>
                  <span className="tabular font-serif text-[40px] leading-none">{formatTL(totals.totalKurus)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button kind="secondary" size="lg" disabled={cart.lines.length === 0 || busy} onClick={() => setPanel({ kind: "cash" })}>
                  {t("cash")}
                </Button>
                <Button kind="primary" size="lg" disabled={cart.lines.length === 0 || busy} onClick={() => void pay("card")}>
                  {t("card")}
                </Button>
              </div>
            </div>
          </>
        )}
      </aside>

      {panel?.kind === "cash" && <CashPanel t={t} dueKurus={totals.totalKurus} busy={busy} onClose={() => setPanel(null)} onPay={(k) => void pay("cash", k)} />}
      {panel?.kind === "payment" && (
        <PaymentSheet
          t={t}
          payment={panel.payment}
          busy={busy}
          onClose={closePayment}
          onConfirm={() => void settle((o, p) => api.staff.till.confirmPayment(slug, o, p))}
          onDecline={() => void settle((o, p) => api.staff.till.cancelPayment(slug, o, p, { declined: true }))}
          onCheck={() => void settle((o, p) => api.staff.till.payment(slug, o, p))}
          onRetry={() => void pay(panel.payment.method, panel.tenderedKurus)}
        />
      )}
      {panel?.kind === "discount" && (panel.productId === null || discountLine) && (
        <DiscountPanel
          t={t}
          title={discountLine ? `${discountLine.name}: ${t("lineDiscount").toLocaleLowerCase("tr")}` : t("orderDiscount")}
          current={discountLine ? discountLine.discountPercent : cart.discountPercent}
          onClose={() => setPanel(null)}
          onPick={(p) => {
            setDiscount(panel.productId, p);
            setPanel(null);
          }}
        />
      )}
    </>
  );
}

/** How often the till asks while the terminal works on a payment. */
const TERMINAL_POLL_MS = 1500;

/**
 * One sheet for a payment that isn't through yet. With the manual terminal (D24) the
 * barista taps once the terminal approves; with a terminal behind the till bridge the
 * till waits for its answer. A decline, or a terminal that can't be reached, says so
 * and offers another try.
 */
function PaymentSheet({
  t,
  payment,
  busy,
  onClose,
  onConfirm,
  onDecline,
  onCheck,
  onRetry,
}: {
  t: TillProps["t"];
  payment: PaymentDTO;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDecline: () => void;
  onCheck: () => void;
  onRetry: () => void;
}) {
  const waitingOnTerminal = payment.status === "pending" && payment.confirmBy === "terminal";
  const check = useRef(onCheck);
  check.current = onCheck;
  useEffect(() => {
    if (!waitingOnTerminal) return;
    const timer = setInterval(() => check.current(), TERMINAL_POLL_MS);
    return () => clearInterval(timer);
  }, [waitingOnTerminal, payment.id]);

  const problem =
    payment.status === "declined"
      ? payment.failure === "TERMINAL_UNREACHABLE"
        ? t("terminalUnreachable")
        : `${t("cardDeclined")}${payment.failure ? ` (${payment.failure})` : ""}`
      : payment.status === "cancelled"
        ? t("paymentClosed")
        : null;

  return (
    <Sheet title={payment.method === "cash" ? t("cashTitle") : t("cardTitle")} onClose={onClose} labelClose={t("close")}>
      <p className="tabular font-serif text-5xl">{formatTL(payment.amountKurus)}</p>
      {problem ? (
        <>
          <Notice tone="red">{problem}</Notice>
          <Button kind="primary" size="lg" disabled={busy} onClick={onRetry} autoFocus>
            {t("retry")}
          </Button>
        </>
      ) : waitingOnTerminal ? (
        <>
          <p className="flex items-center gap-3 text-muted" role="status">
            <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-green" />
            {payment.method === "cash" ? t("waiting_cash") : t("waiting_card")}
          </p>
          <Button onClick={onClose}>{t("cancel")}</Button>
        </>
      ) : (
        <>
          <p className="text-muted">{t("cardBody")}</p>
          <Button kind="primary" size="lg" disabled={busy} onClick={onConfirm} autoFocus>
            {t("cardDone")}
          </Button>
          <Button kind="quiet" disabled={busy} onClick={onDecline}>
            {t("cardDeclinedAction")}
          </Button>
        </>
      )}
    </Sheet>
  );
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-11 w-11 cursor-pointer rounded-full border border-[#E0E0DC] bg-paper text-xl text-ink active:bg-tile dark:border-line"
    >
      {children}
    </button>
  );
}

function PaidView({ t, order, onNext }: { t: TillProps["t"]; order: OrderDTO; onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <div aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-green-soft text-green">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>
      <h2 className="font-serif text-4xl font-normal">{t("paid")}</h2>
      <p className="tabular text-base text-muted">
        #{order.number} · {order.paymentMethod === "cash" ? t("cash") : t("card")} · {formatTL(order.totalKurus)}
      </p>
      {order.claim && (
        <p className="text-base text-muted">
          {t("peniOnScreen")}: <strong className="tabular text-ink">{order.claim.code}</strong> · {order.claim.peni} peni
        </p>
      )}
      {order.changeKurus !== null && order.changeKurus > 0 && (
        <p className="tabular text-lg">
          {t("changeToGive")}: <strong className="font-serif text-3xl font-normal">{formatTL(order.changeKurus)}</strong>
        </p>
      )}
      <Button kind="primary" className="mt-2 min-h-14 px-8 text-[17px]" onClick={onNext} autoFocus>
        {t("newOrder")}
      </Button>
    </div>
  );
}

/** Notes and coins people hand over most, after the exact amount. */
function cashSuggestions(due: number): number[] {
  const notes = [5_000, 10_000, 20_000, 50_000, 100_000, 200_000];
  const round = (step: number) => Math.ceil(due / step) * step;
  const out = new Set<number>();
  for (const step of [1_000, 5_000, 10_000]) if (round(step) > due) out.add(round(step));
  for (const n of notes) if (n > due) out.add(n);
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

function CashPanel({ t, dueKurus, busy, onClose, onPay }: { t: TillProps["t"]; dueKurus: number; busy: boolean; onClose: () => void; onPay: (tenderedKurus?: number) => void }) {
  /** Whole lira typed on the pad. */
  const [typed, setTyped] = useState("");
  const tendered = typed ? Number(typed) * 100 : null;
  const short = tendered !== null && tendered < dueKurus;
  return (
    <Sheet title={t("cashTitle")} onClose={onClose} labelClose={t("close")}>
      <div className="flex items-baseline justify-between">
        <span className="text-muted">{t("due")}</span>
        <span className="tabular font-serif text-4xl">{formatTL(dueKurus)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button kind="secondary" disabled={busy} onClick={() => onPay(dueKurus)}>
          {t("exact")}
        </Button>
        {cashSuggestions(dueKurus).map((k) => (
          <Button key={k} kind={tendered === k ? "secondary" : "quiet"} disabled={busy} onClick={() => setTyped(String(k / 100))}>
            {formatTL(k)}
          </Button>
        ))}
      </div>
      <div className="flex items-baseline justify-between border-t border-line pt-4">
        <span className="text-muted">{t("handedOver")}</span>
        <span className="tabular text-2xl">{tendered === null ? "—" : formatTL(tendered)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-muted">{t("change")}</span>
        <span className={`tabular font-serif text-4xl ${short ? "text-red" : "text-green"}`}>
          {tendered === null ? "—" : short ? t("tooLittle") : formatTL(tendered - dueKurus)}
        </span>
      </div>
      <Keypad
        onKey={(k) => setTyped((v) => (k === "back" ? v.slice(0, -1) : v.length < 6 ? (v === "0" ? k : v + k) : v))}
        eraseLabel={t("erase")}
        okLabel={t("takeCash")}
        onOk={() => onPay(tendered ?? undefined)}
        okDisabled={busy || short}
      />
    </Sheet>
  );
}

function DiscountPanel({ t, title, current, onClose, onPick }: { t: TillProps["t"]; title: string; current: number; onClose: () => void; onPick: (percent: number) => void }) {
  const [other, setOther] = useState("");
  const value = Number(other);
  const valid = other !== "" && Number.isInteger(value) && value >= 0 && value <= 100;
  return (
    <Sheet title={title} onClose={onClose} labelClose={t("close")}>
      <div className="grid grid-cols-3 gap-2">
        {[0, ...QUICK_DISCOUNTS].map((p) => (
          <Button key={p} kind={p === current ? "primary" : "quiet"} onClick={() => onPick(p)}>
            {p === 0 ? t("noDiscount") : formatPercent(p)}
          </Button>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onPick(value);
        }}
      >
        <label className="flex flex-1 items-center gap-2 rounded-full border border-line px-4">
          <span className="text-muted">%</span>
          <input
            inputMode="numeric"
            aria-label={t("otherPercent")}
            placeholder={t("otherPercent")}
            value={other}
            onChange={(e) => setOther(e.target.value.replace(/\D/g, "").slice(0, 3))}
            className="min-h-12 w-full bg-transparent text-base outline-none"
          />
        </label>
        <Button kind="secondary" type="submit" disabled={!valid}>
          {t("ok")}
        </Button>
      </form>
    </Sheet>
  );
}
