import { bridgeResultSchema } from "@peni/api";
import { body, bridgeTokenFrom, route, segment } from "@/server/http";

/** What the device did with a job. Sending the same answer again is fine. */
export const POST = route(async ({ app, req }) =>
  app.yazarkasa.result(await app.yazarkasa.bridgeFor(bridgeTokenFrom(req)), segment(req, -2), (await body(req, bridgeResultSchema)).result),
);
