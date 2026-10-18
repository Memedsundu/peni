import { tillDonationSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const POST = route(async ({ app, req, staffToken }) =>
  app.tillDonation(await app.staff.at(staffToken, segment(req, -3), "peni.till"), await body(req, tillDonationSchema)),
);
