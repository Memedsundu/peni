import { closePaySchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Ayı kapat" for pay. Needs "pay.close". */
export const POST = route(async ({ app, req, staffToken }) => app.pay.close(await app.staff.at(staffToken, segment(req, -3)), await body(req, closePaySchema)));
