import { sendGiftSchema } from "@peni/api";
import { body, route } from "@/server/http";

export const POST = route(
  async ({ app, req, customer }) => app.sendGift(customer!, await body(req, sendGiftSchema)),
  { auth: "customer" },
);
