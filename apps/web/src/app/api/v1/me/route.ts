import { route } from "@/server/http";

/** The signed-in customer and the cafés they work at (Profil). [G18, G19] */
export const GET = route(async ({ app, customer }) => app.me(customer!), { auth: "customer" });
