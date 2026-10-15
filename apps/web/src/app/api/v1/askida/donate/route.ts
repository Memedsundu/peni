import { donateAskidaSchema } from "@peni/api";
import { body, route } from "@/server/http";

export const POST = route(
  async ({ app, req, customer }) => app.donateToAskida(customer!, await body(req, donateAskidaSchema)),
  { auth: "customer" },
);
