import type {
  CafeDetailDTO,
  CafeSummaryDTO,
  GiftDTO,
  OrderDTO,
  SessionDTO,
  StaffDashboardDTO,
  WalletDTO,
  ApiErrorBody,
} from "./dto";
import { errorMessageTr } from "./messages";
import type {
  CreateOrderInput,
  DonateAskidaInput,
  RequestCodeInput,
  SendGiftInput,
  StaffTransitionInput,
  TillDonationInput,
  VerifyCodeInput,
} from "./schemas";

export class PeniApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    serverMessage: string,
  ) {
    super(errorMessageTr(code, serverMessage));
    this.name = "PeniApiError";
  }
}

export interface PeniClientOptions {
  baseUrl: string;
  /** Returns the customer's bearer token, if signed in. */
  getToken?: () => string | null | Promise<string | null>;
  /** Staff key for café panel calls. */
  getStaffKey?: () => string | null | Promise<string | null>;
  fetch?: typeof fetch;
}

/** Random id for idempotent POSTs. Re-use the same key when retrying the same action. */
export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createPeniClient(options: PeniClientOptions) {
  const base = options.baseUrl.replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown, staff = false): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    const token = await options.getToken?.();
    if (token) headers.authorization = `Bearer ${token}`;
    if (staff) {
      const key = await options.getStaffKey?.();
      if (key) headers["x-peni-staff-key"] = key;
    }
    const res = await doFetch(`${base}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
    if (!res.ok) {
      const err = (json as ApiErrorBody | null)?.error;
      throw new PeniApiError(err?.code ?? "HTTP_" + res.status, res.status, err?.message ?? res.statusText);
    }
    return json as T;
  }

  const slug = (s: string) => encodeURIComponent(s);

  return {
    auth: {
      requestCode: (input: RequestCodeInput) =>
        call<{ sent: true; devCode?: string }>("POST", "/auth/request-code", input),
      verifyCode: (input: VerifyCodeInput) => call<SessionDTO>("POST", "/auth/verify", input),
    },
    cafes: {
      list: () => call<{ cafes: CafeSummaryDTO[] }>("GET", "/cafes"),
      get: (cafeSlug: string) => call<CafeDetailDTO>("GET", `/cafes/${slug(cafeSlug)}`),
      join: (cafeSlug: string) => call<CafeDetailDTO>("POST", `/cafes/${slug(cafeSlug)}/join`, {}),
      react: (cafeSlug: string, postId: string) =>
        call<{ ok: true }>("POST", `/cafes/${slug(cafeSlug)}/posts/${slug(postId)}/react`, {}),
      rsvp: (cafeSlug: string, postId: string) =>
        call<{ ok: true }>("POST", `/cafes/${slug(cafeSlug)}/posts/${slug(postId)}/rsvp`, {}),
      comment: (cafeSlug: string, postId: string, body: string) =>
        call<{ ok: true }>("POST", `/cafes/${slug(cafeSlug)}/posts/${slug(postId)}/comments`, { body }),
    },
    wallet: {
      get: () => call<WalletDTO>("GET", "/me/wallet"),
    },
    orders: {
      create: (input: CreateOrderInput) => call<OrderDTO>("POST", "/orders", input),
      get: (id: string) => call<OrderDTO>("GET", `/orders/${slug(id)}`),
      mine: () => call<{ orders: OrderDTO[] }>("GET", "/orders"),
      cancel: (id: string) => call<OrderDTO>("POST", `/orders/${slug(id)}/cancel`, {}),
    },
    gifts: {
      send: (input: SendGiftInput) => call<GiftDTO>("POST", "/gifts", input),
      accept: (id: string) => call<GiftDTO>("POST", `/gifts/${slug(id)}/accept`, {}),
      decline: (id: string) => call<GiftDTO>("POST", `/gifts/${slug(id)}/decline`, {}),
    },
    askida: {
      donate: (input: DonateAskidaInput) =>
        call<{ balancePeni: number; matchedPeni: number }>("POST", "/askida/donate", input),
    },
    staff: {
      dashboard: (cafeSlug: string) => call<StaffDashboardDTO>("GET", `/staff/${slug(cafeSlug)}`, undefined, true),
      transition: (cafeSlug: string, orderId: string, input: StaffTransitionInput) =>
        call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}`, input, true),
      tillDonation: (cafeSlug: string, input: TillDonationInput) =>
        call<{ balancePeni: number }>("POST", `/staff/${slug(cafeSlug)}/askida/till`, input, true),
      setPaused: (cafeSlug: string, paused: boolean) =>
        call<{ appOrderingPaused: boolean }>("POST", `/staff/${slug(cafeSlug)}/pause`, { paused }, true),
    },
  };
}

export type PeniClient = ReturnType<typeof createPeniClient>;
