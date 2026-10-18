import { saveReportSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Reports kept on Raporlar (piece 29), run for today. Needs "reports.view". */
export const GET = route(async ({ app, req, staffToken }) => app.chat.saved(await app.staff.at(staffToken, segment(req, -3))));

/** "Raporlara kaydet": keeps a report the assistant drew. The same key twice keeps it once. */
export const POST = route(async ({ app, req, staffToken }) => app.chat.save(await app.staff.at(staffToken, segment(req, -3)), await body(req, saveReportSchema)));
