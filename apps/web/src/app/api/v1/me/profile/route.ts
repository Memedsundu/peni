import { updateProfileSchema } from "@peni/api";
import { body, route } from "@/server/http";

/** "Adın" + "Kaydet", and "Profilim görünsün". Send only what changes. [G18] */
export const POST = route(
  async ({ app, req, customer }) => app.updateProfile(customer!, await body(req, updateProfileSchema)),
  { auth: "customer" },
);
