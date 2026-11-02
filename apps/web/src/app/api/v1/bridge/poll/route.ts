import { bridgePollSchema } from "@peni/api";
import { body, bridgeTokenFrom, route } from "@/server/http";

// The poll waits up to 20 seconds for a job before answering "nothing".
export const maxDuration = 60;

/** The bridge checks in with its status and gets its next job, waiting a while when there's none (N12). */
export const POST = route(async ({ app, req }) => {
  const bridge = await app.yazarkasa.bridgeFor(bridgeTokenFrom(req));
  return app.yazarkasa.poll(bridge, (await body(req, bridgePollSchema)).status);
});
