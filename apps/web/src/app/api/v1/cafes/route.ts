import { route } from "@/server/http";

export const GET = route(async ({ app, customer }) => ({ cafes: await app.listCafes(customer) }));
