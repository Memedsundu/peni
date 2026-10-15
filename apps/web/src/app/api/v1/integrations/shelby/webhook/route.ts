import { SHELBY_SIGNATURE_HEADER, verifyShelbyWebhook } from "@peni/core/pos/shelby";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/server/http";
import { getApp } from "@/server/runtime";

/** Shelby → Peni: order.paid / order.refunded / order.cancelled. Signed with SHELBY_WEBHOOK_SECRET. */
export async function POST(req: NextRequest) {
  const secret = process.env.SHELBY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Webhook secret not set" } }, { status: 503 });

  const raw = await req.text();
  const event = verifyShelbyWebhook(raw, req.headers.get(SHELBY_SIGNATURE_HEADER), secret);
  if (!event) return NextResponse.json({ error: { code: "BAD_SIGNATURE", message: "Invalid signature" } }, { status: 401 });

  try {
    await (await getApp()).handlePosEvent(event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
