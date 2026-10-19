import type {
  AuthProvidersDTO,
  CafeDetailDTO,
  CafeMembersDTO,
  CafeSummaryDTO,
  FullWalletDTO,
  GiftDTO,
  GiftPreviewDTO,
  MeDTO,
  MemberLookupDTO,
  OrderDTO,
  OrderListDTO,
  PaymentAnswerDTO,
  TillMenuDTO,
  RolesDTO,
  SessionDTO,
  StaffDashboardDTO,
  StaffMeDTO,
  StaffSessionDTO,
  StaffMenuDTO,
  TeamDTO,
  TillDTO,
  TillDeviceDTO,
  ApiErrorBody,
} from "./dto";
import { errorMessageTr } from "./messages";
import type {
  AddStaffInput,
  AppleSignInInput,
  ChangePasswordInput,
  DonateAskidaInput,
  MemberLookupInput,
  EmailVerifyInput,
  PinSignInInput,
  SaveRolesInput,
  AddProductInput,
  CreateOrderInput,
  OrderListQuery,
  PayOrderInput,
  CancelPaymentInput,
  UpdateOrderInput,
  MenuCategoryInput,
  MenuOrderInput,
  UpdateProductInput,
  StaffSignInInput,
  UpdateStaffInput,
  SendGiftInput,
  TillDonationInput,
  UpdateProfileInput,
} from "./schemas";

export class PeniApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** The server's English message; `message` is the Turkish copy. */
    readonly serverMessage: string,
  ) {
    super(errorMessageTr(code, serverMessage));
    this.name = "PeniApiError";
  }
}

export interface PeniClientOptions {
  baseUrl: string;
  /** Returns the customer's bearer token, if signed in. */
  getToken?: () => string | null | Promise<string | null>;
  /** The staff session token for café panel calls (the Expo app's café mode). The web panel uses the cookie. */
  getStaffToken?: () => string | null | Promise<string | null>;
  /** On a computer set up as a till outside a browser: its device token. Browsers use the cookie. */
  getTillToken?: () => string | null | Promise<string | null>;
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
      const staffToken = await options.getStaffToken?.();
      if (staffToken) headers["x-peni-staff-token"] = staffToken;
      const tillToken = await options.getTillToken?.();
      if (tillToken) headers["x-peni-till-token"] = tillToken;
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
      /** Which sign-in buttons to show. */
      providers: () => call<AuthProvidersDTO>("GET", "/auth/providers"),
      /** Emails a 6-digit code. */
      emailStart: (email: string) => call<{ ok: true; expiresInSeconds: number }>("POST", "/auth/email/start", { email }),
      emailVerify: (input: EmailVerifyInput) => call<SessionDTO>("POST", "/auth/email/verify", input),
      /** The ID token from Google's sign-in (Google Identity Services on the web, expo-auth-session in the app). */
      google: (idToken: string) => call<SessionDTO>("POST", "/auth/google", { idToken }),
      /** The ID token from Sign in with Apple, and the name Apple gives only the first time. */
      apple: (input: AppleSignInInput) => call<SessionDTO>("POST", "/auth/apple", input),
      signOut: () => call<{ ok: true }>("POST", "/auth/logout", {}),
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
       * Gift recipient check by phone or Peni kodu: "Mehmet K." or 404 (RECIPIENT_NOT_MEMBER).
       * Rate-limited per customer (LOOKUP_LIMITED). [G6, D28]
       */
      lookupMember: (cafeSlug: string, by: MemberLookupInput) =>
        call<MemberLookupDTO>("POST", `/cafes/${slug(cafeSlug)}/members/lookup`, by),
      /** Members who show their profile, to pick whom to treat; `q` searches names. [D28] */
      members: (cafeSlug: string, q?: string) =>
        call<CafeMembersDTO>("GET", `/cafes/${slug(cafeSlug)}/members${q ? `?q=${encodeURIComponent(q)}` : ""}`),
      /** Public `text/calendar` link for a Peni masası; open it with `Linking`. [G22] */
      icsUrl: (cafeSlug: string, postId: string) =>
        `${base}/api/v1/cafes/${slug(cafeSlug)}/posts/${slug(postId)}/ics`,
    },
    wallet: {
      get: () => call<FullWalletDTO>("GET", "/me/wallet"),
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
    till: {
      /** On a computer set up as a till: the names to tap before typing a PIN. */
      get: () => call<TillDTO>("GET", "/till", undefined, true),
      pinSignIn: (input: PinSignInInput) => call<StaffSessionDTO>("POST", "/till/pin", input, true),
      /** "Kilitle": ends the PIN session, back to the names. */
      lock: () => call<{ ok: true }>("POST", "/staff-session/sign-out", {}, true),
    },
    staff: {
      /** Email and password. Keep `token` for later calls; the web panel also gets a cookie. */
      signIn: (input: StaffSignInInput) => call<StaffSessionDTO>("POST", "/staff-session", input, true),
      signOut: () => call<{ ok: true }>("POST", "/staff-session/sign-out", {}, true),
      /** The signed-in staff member and, per café, their role and permission keys. */
      me: () => call<StaffMeDTO>("GET", "/staff-session", undefined, true),
      changePassword: (input: ChangePasswordInput) => call<{ ok: true }>("POST", "/staff-session/password", input, true),
      team: (cafeSlug: string) => call<TeamDTO>("GET", `/staff/${slug(cafeSlug)}/team`, undefined, true),
      addMember: (cafeSlug: string, input: AddStaffInput) => call<TeamDTO>("POST", `/staff/${slug(cafeSlug)}/team`, input, true),
      updateMember: (cafeSlug: string, memberId: string, input: UpdateStaffInput) =>
        call<TeamDTO>("POST", `/staff/${slug(cafeSlug)}/team/${slug(memberId)}`, input, true),
      resetPassword: (cafeSlug: string, memberId: string, password: string) =>
        call<{ ok: true }>("POST", `/staff/${slug(cafeSlug)}/team/${slug(memberId)}/password`, { password }, true),
      /** The caller's own till PIN at this café. Needs a password sign-in. */
      setPin: (cafeSlug: string, pin: string) => call<{ ok: true }>("POST", `/staff/${slug(cafeSlug)}/pin`, { pin }, true),
      devices: (cafeSlug: string) => call<{ devices: TillDeviceDTO[] }>("GET", `/staff/${slug(cafeSlug)}/devices`, undefined, true),
      /** Makes this computer a till. Browsers keep the token in a cookie; keep `token` otherwise. */
      registerDevice: (cafeSlug: string, name: string) =>
        call<{ device: TillDeviceDTO; token: string }>("POST", `/staff/${slug(cafeSlug)}/devices`, { name }, true),
      revokeDevice: (cafeSlug: string, deviceId: string) =>
        call<{ devices: TillDeviceDTO[] }>("POST", `/staff/${slug(cafeSlug)}/devices/${slug(deviceId)}/revoke`, {}, true),
      roles: (cafeSlug: string) => call<RolesDTO>("GET", `/staff/${slug(cafeSlug)}/roles`, undefined, true),
      saveRoles: (cafeSlug: string, input: SaveRolesInput) => call<RolesDTO>("POST", `/staff/${slug(cafeSlug)}/roles`, input, true),
      /** Menü: every change answers with the whole menu. Needs "menu.edit". */
      menu: {
        get: (cafeSlug: string) => call<StaffMenuDTO>("GET", `/staff/${slug(cafeSlug)}/menu`, undefined, true),
        addCategory: (cafeSlug: string, input: MenuCategoryInput) =>
          call<StaffMenuDTO>("POST", `/staff/${slug(cafeSlug)}/menu/categories`, input, true),
        renameCategory: (cafeSlug: string, categoryId: string, input: MenuCategoryInput) =>
          call<StaffMenuDTO>("POST", `/staff/${slug(cafeSlug)}/menu/categories/${slug(categoryId)}`, input, true),
        /** Only an empty category (CATEGORY_NOT_EMPTY otherwise). */
        deleteCategory: (cafeSlug: string, categoryId: string) =>
          call<StaffMenuDTO>("POST", `/staff/${slug(cafeSlug)}/menu/categories/${slug(categoryId)}/delete`, {}, true),
        addProduct: (cafeSlug: string, input: AddProductInput) =>
          call<StaffMenuDTO>("POST", `/staff/${slug(cafeSlug)}/menu/products`, input, true),
        /** Send only what changes; `removed` takes it off the menu or brings it back. */
        updateProduct: (cafeSlug: string, productId: string, input: UpdateProductInput) =>
          call<StaffMenuDTO>("POST", `/staff/${slug(cafeSlug)}/menu/products/${slug(productId)}`, input, true),
        reorder: (cafeSlug: string, input: MenuOrderInput) =>
          call<StaffMenuDTO>("POST", `/staff/${slug(cafeSlug)}/menu/order`, input, true),
      },
      /** Satış ekranı: prices and totals always come from the server. */
      till: {
        menu: (cafeSlug: string) => call<TillMenuDTO>("GET", `/staff/${slug(cafeSlug)}/till-menu`, undefined, true),
        orders: (cafeSlug: string, query: OrderListQuery = {}) => {
          const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]).toString();
          return call<OrderListDTO>("GET", `/staff/${slug(cafeSlug)}/orders${qs ? `?${qs}` : ""}`, undefined, true);
        },
        order: (cafeSlug: string, orderId: string) =>
          call<OrderDTO>("GET", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}`, undefined, true),
        /** The same `createKey` again returns the same order. */
        create: (cafeSlug: string, input: CreateOrderInput) => call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders`, input, true),
        update: (cafeSlug: string, orderId: string, input: UpdateOrderInput) =>
          call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}`, input, true),
        /**
         * Starts a payment through the till's terminal. It may be approved at once (cash), or
         * wait for the barista (`confirmPayment`) or the terminal (poll `payment`). The same
         * `payKey` again returns the same payment.
         */
        pay: (cafeSlug: string, orderId: string, input: PayOrderInput) =>
          call<PaymentAnswerDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/pay`, input, true),
        payment: (cafeSlug: string, orderId: string, paymentId: string) =>
          call<PaymentAnswerDTO>("GET", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/payments/${slug(paymentId)}`, undefined, true),
        /** "The terminal approved it": only for payments with `confirmBy: "staff"`. */
        confirmPayment: (cafeSlug: string, orderId: string, paymentId: string) =>
          call<PaymentAnswerDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/payments/${slug(paymentId)}/confirm`, {}, true),
        /** Backs out of a waiting payment; `declined` records that the terminal said no. */
        cancelPayment: (cafeSlug: string, orderId: string, paymentId: string, input: CancelPaymentInput = {}) =>
          call<PaymentAnswerDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/payments/${slug(paymentId)}/cancel`, input, true),
        void: (cafeSlug: string, orderId: string, reason: string) =>
          call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/void`, { reason }, true),
        refund: (cafeSlug: string, orderId: string, reason: string) =>
          call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/refund`, { reason }, true),
        remove: (cafeSlug: string, orderId: string, reason: string) =>
          call<{ ok: true }>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/delete`, { reason }, true),
      },
      dashboard: (cafeSlug: string) => call<StaffDashboardDTO>("GET", `/staff/${slug(cafeSlug)}`, undefined, true),
      tillDonation: (cafeSlug: string, input: TillDonationInput) =>
        call<{ balancePeni: number }>("POST", `/staff/${slug(cafeSlug)}/askida/till`, input, true),
    },
  };
}

export type PeniClient = ReturnType<typeof createPeniClient>;
