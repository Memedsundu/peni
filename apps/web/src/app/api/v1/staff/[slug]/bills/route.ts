import { addBillSchema, billListQuerySchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Faturalar: a month's bills (`?month=2026-10`) or everything still owed (`?show=owed`). Needs "bills.view". */
export const GET = route(async ({ app, req, staffToken }) => {
  const params = req.nextUrl.searchParams;
  const query = billListQuerySchema.parse({ month: params.get("month") ?? undefined, show: params.get("show") ?? undefined });
  return app.bills.list(await app.staff.at(staffToken, segment(req, -2)), query);
});

/** "Fatura ekle". Stock lines add stock and set the item's price. The same `key` adds it once. Needs "bills.add". */
export const POST = route(async ({ app, req, staffToken }) => app.bills.add(await app.staff.at(staffToken, segment(req, -2)), await body(req, addBillSchema)));
