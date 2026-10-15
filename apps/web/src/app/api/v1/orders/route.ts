import { createOrderSchema } from "@peni/api";
import { body, route } from "@/server/http";

export const GET = route(async ({ app, customer }) => ({ orders: app.ordersFor(customer!) }), { auth: "customer" });

export const POST = route(
  async ({ app, req, customer }) => app.createOrder(customer!, await body(req, createOrderSchema)),
  { auth: "customer" },
);
