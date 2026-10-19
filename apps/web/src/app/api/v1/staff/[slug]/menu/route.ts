import { route, segment } from "@/server/http";

/** Menü in the café panel: categories, products on the menu, and removed ones. Needs "menu.edit". */
export const GET = route(async ({ app, req, staffToken }) => app.menuEditor.view(await app.staff.at(staffToken, segment(req, -2))));
