import { createHmac, timingSafeEqual } from "node:crypto";
import type { MenuItem, PendingOrderInput, PendingOrderRef, PosAdapter, PosEvent } from "./adapter";

/**
 * Talks to Shelby's partner API. Shelby has no public API today; the endpoints
 * below are the contract Shelby must implement (see docs/shelby-integration.md).
 */
export interface ShelbyAdapterConfig {
  baseUrl: string;
  /** Service token issued by Shelby for Peni. Server-side only. */
  token: string;
  /** Peni café id → Shelby café id. */
  cafeIdMap: Record<string, string>;
  fetch?: typeof fetch;
}

export class ShelbyPosAdapter implements PosAdapter {
  readonly kind = "shelby" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ShelbyAdapterConfig) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  async listMenu(cafeId: string): Promise<MenuItem[]> {
    const body = await this.request<{ items: MenuItem[] }>("GET", `/cafes/${this.shelbyCafe(cafeId)}/menu`);
    return body.items;
  }

  async isAcceptingOrders(cafeId: string): Promise<boolean> {
    const body = await this.request<{ acceptingOrders: boolean }>("GET", `/cafes/${this.shelbyCafe(cafeId)}/status`);
    return body.acceptingOrders;
  }

  async createPendingOrder(input: PendingOrderInput): Promise<PendingOrderRef> {
    return this.request<PendingOrderRef>("POST", `/cafes/${this.shelbyCafe(input.cafeId)}/orders`, {
      ...input,
      cafeId: this.shelbyCafe(input.cafeId),
      channel: "peni",
    });
  }

  async cancelPendingOrder(posOrderId: string, reason: string): Promise<void> {
    await this.request("POST", `/orders/${encodeURIComponent(posOrderId)}/cancel`, { reason });
  }

  private shelbyCafe(cafeId: string): string {
    const id = this.config.cafeIdMap[cafeId];
    if (!id) throw new Error(`Café ${cafeId} is not linked to Shelby`);
    return encodeURIComponent(id);
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/api/partner/peni/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Shelby ${method} ${path} failed with ${res.status}`);
    return (await res.json()) as T;
  }
}

export const SHELBY_SIGNATURE_HEADER = "x-shelby-signature";
const TOLERANCE_SECONDS = 300;

/** Signs a webhook body the way Shelby must: `t=<unix>,v1=<hex hmac-sha256 of "<t>.<body>">`. */
export function signShelbyWebhook(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/** Verifies and parses a Shelby webhook. Returns null if the signature is missing, wrong or stale. */
export function verifyShelbyWebhook(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): PosEvent | null {
  if (!header) return null;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSeconds - t) > TOLERANCE_SECONDS || !parts.v1) return null;

  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"), "hex");
  const given = Buffer.from(parts.v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    return JSON.parse(rawBody) as PosEvent;
  } catch {
    return null;
  }
}
