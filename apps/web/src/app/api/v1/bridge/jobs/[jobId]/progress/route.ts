import { bridgeProgressSchema } from "@peni/api";
import { body, bridgeTokenFrom, route, segment } from "@/server/http";

/** What the device is doing with a job, for the till; the answer says whether the barista backed out. */
export const POST = route(async ({ app, req }) =>
  app.yazarkasa.progress(await app.yazarkasa.bridgeFor(bridgeTokenFrom(req)), segment(req, -2), await body(req, bridgeProgressSchema)),
);
