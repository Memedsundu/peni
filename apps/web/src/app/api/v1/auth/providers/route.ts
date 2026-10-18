import { route } from "@/server/http";

/** Which sign-in buttons to show. */
export const GET = route(async ({ app }) => app.auth.providers());
