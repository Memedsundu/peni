import { route, tillTokenFrom } from "@/server/http";

/** The till's sign-in screen: who can sign in on this computer with a PIN. */
export const GET = route(async ({ app, req }) => app.staff.till(tillTokenFrom(req)));
