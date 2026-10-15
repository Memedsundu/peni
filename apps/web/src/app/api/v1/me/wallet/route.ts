import { route } from "@/server/http";

export const GET = route(async ({ app, customer }) => app.wallet(customer!), { auth: "customer" });
