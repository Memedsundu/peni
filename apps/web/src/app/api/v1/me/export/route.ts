import { NextResponse } from "next/server";
import { route } from "@/server/http";

/** "Verilerimi indir": everything Peni keeps about the customer, as a JSON file. (plan piece 34) */
export const GET = route(
  async ({ app, customer }) => {
    const data = await app.exportAccount(customer!);
    return NextResponse.json(data, { headers: { "content-disposition": `attachment; filename="peni-verilerim-${data.exportedAt.slice(0, 10)}.json"` } });
  },
  { auth: "customer" },
);
