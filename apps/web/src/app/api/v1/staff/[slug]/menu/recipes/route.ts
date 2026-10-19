import { route, segment } from "@/server/http";

/** How each product on the menu uses stock, what one costs, and the items a recipe can use. Needs "menu.recipes". */
export const GET = route(async ({ app, req, staffToken }) => app.stock.recipes(await app.staff.at(staffToken, segment(req, -3))));
