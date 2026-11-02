import { terminalSettingsSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** On or off, the device's departments, and how pennies and the askı go on the receipt. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.yazarkasa.saveSettings(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, terminalSettingsSchema)),
);
