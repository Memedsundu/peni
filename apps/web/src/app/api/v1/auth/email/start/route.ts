import { emailStartSchema } from "@peni/api";
import { body, route } from "@/server/http";

/** Emails a 6-digit sign-in code. Answers the same whether or not the email has an account. */
export const POST = route(async ({ app, req }) => app.auth.startEmail((await body(req, emailStartSchema)).email));
