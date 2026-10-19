import { updateSupplierSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** One supplier: details, what is owed, bills and prices over time. Needs "suppliers.view". */
export const GET = route(async ({ app, req, staffToken }) => app.bills.supplier(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1)));

/** Changes only what was sent; `removed` hides it from new bills. Needs "suppliers.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.bills.updateSupplier(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1), await body(req, updateSupplierSchema)),
);
