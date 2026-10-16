import type {
  CafeDetailDTO,
  CafeSummaryDTO,
  FullWalletDTO,
  GiftDTO,
  GiftPreviewDTO,
  MeDTO,
  MemberLookupDTO,
  OrderDTO,
  SessionDTO,
  StaffDashboardDTO,
  ApiErrorBody,
} from "./dto";
import { errorMessageTr } from "./messages";
import type {
  CreateOrderInput,
  DonateAskidaInput,
  PauseDuration,
  RequestCodeInput,
  SendGiftInput,
  StaffTransitionInput,
  TillDonationInput,
  UpdateProfileInput,
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
    let res: Response;
    try {
      res = await doFetch(`${base}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // Offline, DNS, CORS, aborted: one code the UI can show as "Bağlantı kurulamadı."
      throw new PeniApiError("NETWORK", 0, error instanceof Error ? error.message : "Network error");
    }
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
      /** `isNew` asks for the name step; then save it with `me.updateProfile`. */
      verifyCode: (input: VerifyCodeInput) => call<SessionDTO>("POST", "/auth/verify", input),
    },
    me: {
      /** The signed-in customer and the cafés they work at. [G18, G19] */
      get: () => call<MeDTO>("GET", "/me"),
      updateProfile: (input: UpdateProfileInput) => call<MeDTO>("POST", "/me/profile", input),
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
      /**
       * Gift recipient check: "Mehmet K." or 404 (RECIPIENT_NOT_MEMBER). Rate-limited
       * per customer (LOOKUP_LIMITED). [G6]
       */
      lookupMember: (cafeSlug: string, phone: string) =>
        call<MemberLookupDTO>("POST", `/cafes/${slug(cafeSlug)}/members/lookup`, { phone }),
      /** Public `text/calendar` link for a Peni masası; open it with `Linking`. [G22] */
      icsUrl: (cafeSlug: string, postId: string) =>
        `${base}/api/v1/cafes/${slug(cafeSlug)}/posts/${slug(postId)}/ics`,
    },
    wallet: {
      get: () => call<FullWalletDTO>("GET", "/me/wallet"),
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
      /** Public; personalised when signed in. [G11] */
      preview: (id: string) => call<GiftPreviewDTO>("GET", `/gifts/${slug(id)}/preview`),
      /** "Teşekkür et". Once per gift; repeating it is harmless. [G15] */
      thank: (id: string) => call<GiftDTO>("POST", `/gifts/${slug(id)}/thanks`, {}),
      /** "Geri al" on a pending gift the viewer sent. [G17] */
      cancel: (id: string) => call<GiftDTO>("POST", `/gifts/${slug(id)}/cancel`, {}),
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
      /**
       * `true` pauses with no end and `false` resumes (the original call).
       * `{ minutes: 15 }` or `"end_of_day"` pause with auto-resume; `null` resumes. [G20]
       */
      setPaused: (cafeSlug: string, pause: boolean | PauseDuration | null) =>
        call<{ appOrderingPaused: boolean; pausedUntil: string | null }>(
          "POST",
          `/staff/${slug(cafeSlug)}/pause`,
          typeof pause === "boolean" ? { paused: pause } : { pause },
          true,
        ),
    },
  };
}

export type PeniClient = ReturnType<typeof createPeniClient>;
