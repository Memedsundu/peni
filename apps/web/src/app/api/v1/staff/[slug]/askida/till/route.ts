import { tillDonationSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const POST = route(
  async ({ app, req }) => app.tillDonation(segment(req, -3), await body(req, tillDonationSchema)),
  { auth: "staff" },
);
