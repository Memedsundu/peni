import { addSupplierSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Tedarikçiler: who the café buys from and what it owes each. Needs "suppliers.view". */
export const GET = route(async ({ app, req, staffToken }) => app.bills.suppliers(await app.staff.at(staffToken, segment(req, -2))));

/** "Tedarikçi ekle". The same `key` adds one. Needs "suppliers.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.bills.addSupplier(await app.staff.at(staffToken, segment(req, -2)), await body(req, addSupplierSchema)),
);
