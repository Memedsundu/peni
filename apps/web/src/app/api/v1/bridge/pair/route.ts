import { bridgePairSchema } from "@peni/api";
import { body, route } from "@/server/http";

/** The yazarkasa bridge connects with the one-time code from the Cihazlar page, and gets its own token (N12). */
export const POST = route(async ({ app, req }) => app.yazarkasa.pair(await body(req, bridgePairSchema)));
