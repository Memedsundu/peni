import { inboxSettingsSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The café's address for bills and the emails that reached it (piece 26). Needs "assistant.use". */
export const GET = route(async ({ app, req, staffToken }) => app.inbox.view(await app.staff.at(staffToken, segment(req, -2))));

/** On or off, or a new address. Needs "bills.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.inbox.update(await app.staff.at(staffToken, segment(req, -2)), await body(req, inboxSettingsSchema)),
);
