import { spendCodeSchema } from "@peni/api";
import { body, route } from "@/server/http";

/** "Ödeme kodum": a fresh code to spend peni at the café's till. */
export const POST = route(async ({ app, req, customer }) => app.spendCode(customer!, (await body(req, spendCodeSchema)).cafeSlug), { auth: "customer" });
