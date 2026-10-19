import { deleteAccountSchema } from "@peni/api";
import { NextResponse } from "next/server";
import { body, route, SESSION_COOKIE } from "@/server/http";

/** "Hesabımı sil": forgets the customer and signs them out everywhere. (plan piece 34) */
export const POST = route(
  async ({ app, req, customer }) => {
    await body(req, deleteAccountSchema);
    const res = NextResponse.json(await app.deleteAccount(customer!));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  },
  { auth: "customer" },
);
