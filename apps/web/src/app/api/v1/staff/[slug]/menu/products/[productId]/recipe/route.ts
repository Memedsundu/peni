import { saveRecipeSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Stok nasıl düşsün?": by recipe, as a counted piece, or not at all. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.stock.saveRecipe(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2), await body(req, saveRecipeSchema)),
);
