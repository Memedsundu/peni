"use client";

import type { OrderDTO, OrderListDTO, OrderStatusDTO, PaymentDTO } from "@peni/api";
import { formatLongDate, formatPercent, formatTL, formatTime } from "@peni/brand/format";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { TillProps } from "./till";
import { Button, Notice, Sheet } from "./ui";

type Action = "void" | "refund" | "delete";

/** Moves a "YYYY-MM-DD" by whole days. */
function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

const STATUS_STYLE: Record<OrderStatusDTO, string> = {
  open: "bg-tile text-ink",
  paid: "bg-green-soft text-green",
  voided: "bg-tile text-muted",
  refunded: "bg-red-soft text-red",
};

/**
 * Satışlar: one day at a time, newest first, with the day's sums. A row opens the order;
 * a manager voids or refunds there, the owner deletes, always with a reason.
 */
export function Sales({ t, slug, onError, lang }: TillProps) {
  const [day, setDay] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [status, setStatus] = useState<OrderStatusDTO | null>(null);
  const [list, setList] = useState<OrderListDTO | null>(null);
  const [open, setOpen] = useState<OrderDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const l = await api.staff.till.orders(slug, { day: day ?? undefined, status: status ?? undefined });
      setList(l);
      if (!day) setToday(l.businessDay);
      setError(null);
    } catch (e) {
      setError(onError(e));
    }
  }, [slug, day, status, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = list?.businessDay ?? day;
  const s = list?.summary;
  const filters: (OrderStatusDTO | null)[] = [null, "paid", "open", "refunded", "voided"];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button size="sm" aria-label={t("prevDay")} onClick={() => shown && setDay(shiftDay(shown, -1))}>
            ‹
          </Button>
          <h1 className="min-w-56 text-center font-serif text-3xl font-normal">
            {shown === today ? t("today") : shown ? formatLongDate(new Date(`${shown}T12:00:00Z`)) : ""}
          </h1>
          <Button size="sm" aria-label={t("nextDay")} disabled={!shown || shown === today} onClick={() => shown && setDay(shiftDay(shown, 1))}>
            ›
          </Button>
          {shown !== today && (
            <Button size="sm" kind="bare" onClick={() => setDay(null)}>
              {t("today")}
            </Button>
          )}
        </div>
        <div role="tablist" className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f ?? "all"}
              type="button"
              role="tab"
              aria-selected={status === f}
              onClick={() => setStatus(f)}
              className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm ${status === f ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink"}`}
            >
              {f ? t(`status_${f}`) : t("all")}
            </button>
          ))}
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("sumSales")} value={formatTL(s.salesKurus)} note={`${s.paidCount} ${s.paidCount === 1 ? t("sumOrder1") : t("sumOrders")}`} />
          <Stat label={t("cash")} value={formatTL(s.cashKurus)} />
          <Stat label={t("card")} value={formatTL(s.cardKurus)} />
          {s.peniKurus > 0 && <Stat label={t("peni")} value={formatTL(s.peniKurus)} />}
          {s.askidaKurus > 0 && <Stat label={t("askida")} value={formatTL(s.askidaKurus)} />}
          <Stat
            label={`${t("sumRefunds")} · ${t("sumVoided")}`}
            value={formatTL(s.refundedKurus)}
            note={`${s.refundedCount} ${t("status_refunded").toLocaleLowerCase(lang)} · ${s.voidedCount} ${t("status_voided").toLocaleLowerCase(lang)}`}
          />
        </div>
      )}

      {error && <Notice tone="red">{error}</Notice>}

      {list && list.orders.length === 0 && <p className="py-16 text-center text-muted">{t("noSales")}</p>}
      {list && list.orders.length > 0 && (
        <ul className="flex flex-col">
          {list.orders.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setOpen(o)}
                className="grid min-h-16 w-full cursor-pointer grid-cols-[64px_64px_96px_1fr_auto] items-center gap-4 border-b border-line-soft text-left active:bg-panel"
              >
                <span className="tabular font-semibold">#{o.number}</span>
                <span className="tabular text-muted">{formatTime(o.createdAt)}</span>
                <span className={`justify-self-start rounded-full px-3 py-1 text-sm ${STATUS_STYLE[o.status]}`}>{t(`status_${o.status}`)}</span>
                <span className="truncate text-muted">
                  {o.itemCount} {o.itemCount === 1 ? t("item1") : t("items")}
                  {o.paymentMethod && ` · ${t(o.paymentMethod)}`}
                  {` · ${o.takenBy}`}
                </span>
                <span className={`tabular text-right text-lg ${o.status === "voided" || o.status === "refunded" ? "text-muted line-through" : ""}`}>
                  {formatTL(o.totalKurus)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <OrderSheet
          t={t}
          slug={slug}
          order={open}
          onError={onError}
          onClose={() => setOpen(null)}
          onChanged={(next) => {
            setOpen(next);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line p-4">
      <span className="text-sm text-muted">{label}</span>
      <span className="tabular font-serif text-3xl">{value}</span>
      {note && <span className="text-sm text-muted">{note}</span>}
    </div>
  );
}

function OrderSheet({
  t,
  slug,
  order,
  onError,
  onClose,
  onChanged,
}: Pick<TillProps, "t" | "slug" | "onError"> & { order: OrderDTO; onClose: () => void; onChanged: (o: OrderDTO | null) => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!action || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "void") onChanged(await api.staff.till.void(slug, order.id, reason));
      else if (action === "refund") onChanged(await api.staff.till.refund(slug, order.id, reason));
      else {
        await api.staff.till.remove(slug, order.id, reason);
        onChanged(null);
      }
      setAction(null);
      setReason("");
    } catch (e) {
      setError(onError(e));
    } finally {
      setBusy(false);
    }
  };

  const labels: Record<Action, string> = { void: t("voidAction"), refund: t("refundAction"), delete: t("deleteAction") };
  const help: Record<Action, string> = { void: t("voidHelp"), refund: t("refundHelp"), delete: t("deleteHelp") };

  return (
    <Sheet title={`#${order.number}`} onClose={onClose} labelClose={t("close")}>
      <p className="-mt-3 text-sm text-muted">
        {t(`status_${order.status}`)} · {formatTime(order.createdAt)} · {t("takenBy")}: {order.takenBy}
      </p>
      <ul className="flex flex-col">
        {order.lines.map((l) => (
          <li key={l.productId} className="flex justify-between gap-4 border-b border-line-soft py-2">
            <span>
              {l.quantity} × {l.name}
              {l.discountPercent > 0 && <span className="text-green"> · {formatPercent(l.discountPercent)}</span>}
            </span>
            <span className="tabular">{formatTL(l.totalKurus)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 text-[15px]">
        {order.discountKurus > 0 && (
          <div className="flex justify-between text-muted">
            <span>
              {t("discount")}
              {order.discountPercent > 0 && ` (${t("orderDiscount").toLocaleLowerCase("tr")} ${formatPercent(order.discountPercent)})`}
            </span>
            <span className="tabular text-green">{formatTL(-order.discountKurus)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">{order.paymentMethod ? t(order.paymentMethod) : t("due")}</span>
          <span className="tabular font-serif text-3xl">{formatTL(order.totalKurus)}</span>
        </div>
        {order.peni && (
          <div className="flex justify-between text-muted">
            <span>
              {t("peni")} · {order.peni.name}
            </span>
            <span className="tabular">{order.peni.peni} peni</span>
          </div>
        )}
        {order.askida && (
          <div className="flex justify-between text-muted">
            <span>
              {t("askidaOnOrder")} · {order.askida.items.map((i) => `${i.quantity} ${i.name}`).join(", ")}
            </span>
            <span className="tabular">{formatTL(order.askida.kurus)}</span>
          </div>
        )}
        {order.tenderedKurus !== null && (
          <div className="flex justify-between text-muted">
            <span>
              {t("handedOver")} {formatTL(order.tenderedKurus)}
            </span>
            <span>
              {t("change")} {formatTL(order.changeKurus ?? 0)}
            </span>
          </div>
        )}
      </div>
      {order.payments.length > 0 && <Payments t={t} payments={order.payments} />}
      {order.payments.some((p) => p.kind === "refund" && p.status === "pending") && <Notice>{t("refundWaiting")}</Notice>}
      {order.voided && (
        <Notice>
          {t("voidedBy")}: {order.voided.by}, {formatTime(order.voided.at)}. {order.voided.reason}
        </Notice>
      )}
      {order.refunded && (
        <Notice tone="red">
          {t("refundedBy")}: {order.refunded.by}, {formatTime(order.refunded.at)} · {formatTL(order.refunded.amountKurus)}. {order.refunded.reason}
        </Notice>
      )}

      {action ? (
        <form
          className="flex flex-col gap-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <p className="text-sm text-muted">{help[action]}</p>
          <label className="flex flex-col gap-2 text-sm text-muted">
            {t("reason")}
            <textarea
              autoFocus
              rows={2}
              maxLength={200}
              value={reason}
              placeholder={t("reasonPlaceholder")}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-ink"
            />
          </label>
          {error && <Notice tone="red">{error}</Notice>}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setAction(null)}>{t("cancel")}</Button>
            <Button kind="danger" type="submit" disabled={busy || !reason.trim()}>
              {labels[action]}
            </Button>
          </div>
        </form>
      ) : (
        (order.canVoid || order.canRefund || order.canDelete) && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {order.canVoid && <Button onClick={() => setAction("void")}>{t("voidAction")}</Button>}
            {order.canRefund && <Button onClick={() => setAction("refund")}>{t("refundAction")}</Button>}
            {order.canDelete && (
              <Button kind="bare" className="text-red" onClick={() => setAction("delete")}>
                {t("deleteAction")}
              </Button>
            )}
          </div>
        )
      )}
    </Sheet>
  );
}

/** Every try at taking or giving back the money, so a declined card or a refund is never a mystery. */
function Payments({ t, payments }: Pick<TillProps, "t"> & { payments: PaymentDTO[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm text-muted">{t("payments")}</h3>
      <ul className="flex flex-col">
        {payments.map((p) => {
          const over = p.status === "declined" || p.status === "cancelled";
          const details = [
            p.reference && p.method !== "askida" && `${t("approvalCode")} ${p.reference}`,
            p.receiptNo && `${t("receiptNo")} ${p.receiptNo}`,
          ].filter(Boolean);
          return (
            <li key={p.id} className={`flex items-baseline justify-between gap-4 border-b border-line-soft py-2 text-[15px] ${over ? "text-muted" : ""}`}>
              <span>
                {p.kind === "refund" ? `${t("refundLine")} · ` : ""}
                {t(p.method)} · {t(`pay_${p.status}`)}
                <span className="text-muted">
                  {" "}
                  · {formatTime(p.settledAt ?? p.startedAt)} · {p.settledBy ?? p.startedBy}
                  {details.length > 0 && ` · ${details.join(" · ")}`}
                </span>
              </span>
              <span className={`tabular ${over ? "line-through" : ""}`}>{formatTL(p.kind === "refund" ? -p.amountKurus : p.amountKurus)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
