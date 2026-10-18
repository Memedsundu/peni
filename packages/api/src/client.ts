import type {
  AuthProvidersDTO,
  ClaimDTO,
  PeniCheckDTO,
  TillAskidaDTO,
  SpendCodeDTO,
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
  CashStateDTO,
  TillMenuDTO,
  RolesDTO,
  SessionDTO,
  StaffDashboardDTO,
  StaffMeDTO,
  StaffSessionDTO,
  StaffMenuDTO,
  StockDTO,
  BillDTO,
  BillsDTO,
  SupplierDTO,
  SuppliersDTO,
  StockItemHistoryDTO,
  RecipesDTO,
  StaffFeedDTO,
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
  OpenCashInput,
  CloseCashInput,
  CashMoveInput,
  UpdateOrderInput,
  MenuCategoryInput,
  MenuOrderInput,
  UpdateProductInput,
  StaffSignInInput,
  UpdateStaffInput,
  SendGiftInput,
  TakeClaimInput,
  CheckPeniInput,
  UsePeniInput,
  GiveAskidaInput,
  CreateEventInput,
  UpdateEventInput,
  ReportInput,
  ResolveReportInput,
  CreatePostInput,
  UpdatePostInput,
  TillDonationInput,
  UpdateProfileInput,
  AddStockItemInput,
  UpdateStockItemInput,
  CountStockInput,
  WasteStockInput,
  SaveRecipeInput,
  AddSupplierInput,
  UpdateSupplierInput,
  AddBillInput,
  CorrectBillInput,
  PayBillInput,
  VoidBillInput,
  BillListQuery,
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
    // A photo goes as it is, with its own type; everything else is JSON.
    const raw = typeof Blob !== "undefined" && body instanceof Blob;
    if (raw) headers["content-type"] = body.type || "application/octet-stream";
    else if (body !== undefined) headers["content-type"] = "application/json";
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
        body: raw ? (body as Blob) : body === undefined ? undefined : JSON.stringify(body),
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
      /** Takes back the viewer's own comment, for good. */
      deleteComment: (cafeSlug: string, postId: string, commentId: string) =>
        call<{ ok: true }>("POST", `/cafes/${slug(cafeSlug)}/posts/${slug(postId)}/comments/${slug(commentId)}/delete`, {}),
      /**
       * Gift recipient check by phone or Peni kodu: "Mehmet K." or 404 (RECIPIENT_NOT_MEMBER).
       * Rate-limited per customer (LOOKUP_LIMITED). [G6, D28]
       */
      lookupMember: (cafeSlug: string, by: MemberLookupInput) =>
        call<MemberLookupDTO>("POST", `/cafes/${slug(cafeSlug)}/members/lookup`, by),
      /** Members who show their profile, to pick whom to treat; `q` searches names. [D28] */
      members: (cafeSlug: string, q?: string) =>
        call<CafeMembersDTO>("GET", `/cafes/${slug(cafeSlug)}/members${q ? `?q=${encodeURIComponent(q)}` : ""}`),
      /** A member opens an event (D4); the same `createKey` again opens it once. */
      openEvent: (cafeSlug: string, input: CreateEventInput) =>
        call<{ ok: true; postId: string }>("POST", `/cafes/${slug(cafeSlug)}/events`, input),
      /** The host changes their event. */
      updateEvent: (cafeSlug: string, postId: string, input: UpdateEventInput) =>
        call<{ ok: true }>("POST", `/cafes/${slug(cafeSlug)}/events/${slug(postId)}`, input),
      /** The host calls it off. */
      cancelEvent: (cafeSlug: string, postId: string) =>
        call<{ ok: true }>("POST", `/cafes/${slug(cafeSlug)}/events/${slug(postId)}/cancel`, {}),
      /** Reports another member's comment or event to the café, once. */
      report: (cafeSlug: string, input: ReportInput) => call<{ ok: true }>("POST", `/cafes/${slug(cafeSlug)}/reports`, input),
      /** Public `text/calendar` link for a Peni masası; open it with `Linking`. [G22] */
      icsUrl: (cafeSlug: string, postId: string) =>
        `${base}/api/v1/cafes/${slug(cafeSlug)}/posts/${slug(postId)}/ics`,
    },
    wallet: {
      get: () => call<FullWalletDTO>("GET", "/me/wallet"),
      /** A fresh ödeme kodu for spending peni at the café's till; replaces the last one. */
      spendCode: (cafeSlug: string) => call<SpendCodeDTO>("POST", "/me/spend-code", { cafeSlug }),
    },
    claims: {
      /** Public; says whether it's the viewer's when signed in. */
      get: (token: string) => call<ClaimDTO>("GET", `/claims/${slug(token)}`),
      /** "Peni'yi al": by the QR's token or the typed code. Taking it twice is harmless. */
      take: (input: TakeClaimInput) => call<ClaimDTO>("POST", "/claims", input),
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
        /** How each product uses stock, with its cost (piece 17). */
        recipes: (cafeSlug: string) => call<RecipesDTO>("GET", `/staff/${slug(cafeSlug)}/menu/recipes`, undefined, true),
        saveRecipe: (cafeSlug: string, productId: string, input: SaveRecipeInput) =>
          call<RecipesDTO>("POST", `/staff/${slug(cafeSlug)}/menu/products/${slug(productId)}/recipe`, input, true),
      },
      /** Stok (piece 17). Viewing needs "stock.view"; the rest "stock.edit". Every call answers with the whole page. */
      stock: {
        get: (cafeSlug: string) => call<StockDTO>("GET", `/staff/${slug(cafeSlug)}/stock`, undefined, true),
        item: (cafeSlug: string, itemId: string) => call<StockItemHistoryDTO>("GET", `/staff/${slug(cafeSlug)}/stock/items/${slug(itemId)}`, undefined, true),
        addItem: (cafeSlug: string, input: AddStockItemInput) => call<StockDTO>("POST", `/staff/${slug(cafeSlug)}/stock/items`, input, true),
        /** Send only what changes; `removed` takes it off Stok or brings it back. */
        updateItem: (cafeSlug: string, itemId: string, input: UpdateStockItemInput) =>
          call<StockDTO>("POST", `/staff/${slug(cafeSlug)}/stock/items/${slug(itemId)}`, input, true),
        count: (cafeSlug: string, input: CountStockInput) => call<StockDTO>("POST", `/staff/${slug(cafeSlug)}/stock/count`, input, true),
        waste: (cafeSlug: string, input: WasteStockInput) => call<StockDTO>("POST", `/staff/${slug(cafeSlug)}/stock/waste`, input, true),
      },
      /** Faturalar (piece 18). Viewing needs "bills.view", adding "bills.add", the rest "bills.manage". */
      bills: {
        list: (cafeSlug: string, query: BillListQuery = {}) => {
          const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]).toString();
          return call<BillsDTO>("GET", `/staff/${slug(cafeSlug)}/bills${qs ? `?${qs}` : ""}`, undefined, true);
        },
        get: (cafeSlug: string, billId: string) => call<BillDTO>("GET", `/staff/${slug(cafeSlug)}/bills/${slug(billId)}`, undefined, true),
        /** The same `key` again returns the same bill. Stock lines add stock and set the item's price. */
        add: (cafeSlug: string, input: AddBillInput) => call<BillDTO>("POST", `/staff/${slug(cafeSlug)}/bills`, input, true),
        /** BILL_CHANGED when someone else corrected it since `version`. */
        correct: (cafeSlug: string, billId: string, input: CorrectBillInput) =>
          call<BillDTO>("POST", `/staff/${slug(cafeSlug)}/bills/${slug(billId)}`, input, true),
        pay: (cafeSlug: string, billId: string, input: PayBillInput) => call<BillDTO>("POST", `/staff/${slug(cafeSlug)}/bills/${slug(billId)}/pay`, input, true),
        unpay: (cafeSlug: string, billId: string) => call<BillDTO>("POST", `/staff/${slug(cafeSlug)}/bills/${slug(billId)}/unpay`, {}, true),
        /** Takes its stock back out; kept in the list as "İptal". */
        void: (cafeSlug: string, billId: string, input: VoidBillInput) => call<BillDTO>("POST", `/staff/${slug(cafeSlug)}/bills/${slug(billId)}/void`, input, true),
      },
      /** Tedarikçiler (piece 18). Viewing needs "suppliers.view"; changes "suppliers.edit". */
      suppliers: {
        list: (cafeSlug: string) => call<SuppliersDTO>("GET", `/staff/${slug(cafeSlug)}/suppliers`, undefined, true),
        get: (cafeSlug: string, supplierId: string) => call<SupplierDTO>("GET", `/staff/${slug(cafeSlug)}/suppliers/${slug(supplierId)}`, undefined, true),
        add: (cafeSlug: string, input: AddSupplierInput) => call<SupplierDTO>("POST", `/staff/${slug(cafeSlug)}/suppliers`, input, true),
        /** Send only what changes; `removed` hides it from new bills or brings it back. */
        update: (cafeSlug: string, supplierId: string, input: UpdateSupplierInput) =>
          call<SupplierDTO>("POST", `/staff/${slug(cafeSlug)}/suppliers/${slug(supplierId)}`, input, true),
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
        /** "Peni": whose wallet the customer's ödeme kodu opens, and how much can go on the order. */
        checkPeni: (cafeSlug: string, orderId: string, input: CheckPeniInput) =>
          call<PeniCheckDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/peni/check`, input, true),
        /** Takes peni from that wallet as a payment, approved at once. The order is paid when nothing's left. */
        usePeni: (cafeSlug: string, orderId: string, input: UsePeniInput) =>
          call<PaymentAnswerDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/peni`, input, true),
        /** "Peni'yi geri ver": the peni on an unpaid order go back to the wallet. */
        returnPeni: (cafeSlug: string, orderId: string) =>
          call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/peni/return`, {}, true),
        /** The askı as the till sees it: the pool and the askı items it pays for (plan piece 13). */
        askida: (cafeSlug: string) => call<TillAskidaDTO>("GET", `/staff/${slug(cafeSlug)}/askida`, undefined, true),
        /** "Askıdan ver": the askı pays for askı items on the order, for anyone who asks (D8). */
        giveAskida: (cafeSlug: string, orderId: string, input: GiveAskidaInput) =>
          call<PaymentAnswerDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/askida`, input, true),
        /** "Askıya geri koy": what the askı paid for on an unpaid order goes back to it. */
        returnAskida: (cafeSlug: string, orderId: string) =>
          call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/askida/return`, {}, true),
        void: (cafeSlug: string, orderId: string, reason: string) =>
          call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/void`, { reason }, true),
        refund: (cafeSlug: string, orderId: string, reason: string) =>
          call<OrderDTO>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/refund`, { reason }, true),
        remove: (cafeSlug: string, orderId: string, reason: string) =>
          call<{ ok: true }>("POST", `/staff/${slug(cafeSlug)}/orders/${slug(orderId)}/delete`, { reason }, true),
      },
      /** Kasa: the drawer's sessions. Every call answers with the drawer's state. Needs "cash.drawer". */
      cash: {
        get: (cafeSlug: string) => call<CashStateDTO>("GET", `/staff/${slug(cafeSlug)}/cash`, undefined, true),
        open: (cafeSlug: string, input: OpenCashInput) => call<CashStateDTO>("POST", `/staff/${slug(cafeSlug)}/cash/open`, input, true),
        close: (cafeSlug: string, input: CloseCashInput) => call<CashStateDTO>("POST", `/staff/${slug(cafeSlug)}/cash/close`, input, true),
        /** Cash put in or taken out by hand, with a reason. */
        move: (cafeSlug: string, input: CashMoveInput) => call<CashStateDTO>("POST", `/staff/${slug(cafeSlug)}/cash/moves`, input, true),
      },
      /** Topluluk (plan piece 14): every change answers with the whole feed. */
      feed: {
        get: (cafeSlug: string) => call<StaffFeedDTO>("GET", `/staff/${slug(cafeSlug)}/feed`, undefined, true),
        create: (cafeSlug: string, input: CreatePostInput) => call<StaffFeedDTO>("POST", `/staff/${slug(cafeSlug)}/feed`, input, true),
        update: (cafeSlug: string, postId: string, input: UpdatePostInput) =>
          call<StaffFeedDTO>("POST", `/staff/${slug(cafeSlug)}/feed/${slug(postId)}`, input, true),
        /** Takes the post down; it stays on record. */
        remove: (cafeSlug: string, postId: string) => call<StaffFeedDTO>("POST", `/staff/${slug(cafeSlug)}/feed/${slug(postId)}/remove`, {}, true),
        /** Needs "posts.moderate"; `hidden: false` brings it back. */
        hideComment: (cafeSlug: string, postId: string, commentId: string, hidden: boolean) =>
          call<StaffFeedDTO>("POST", `/staff/${slug(cafeSlug)}/feed/${slug(postId)}/comments/${slug(commentId)}`, { hidden }, true),
        /** A JPEG, PNG or WebP of at most 2 MB, shrunk on the device first. Answers with its URL for `imageUrls`. */
        uploadImage: (cafeSlug: string, photo: Blob) => call<{ url: string }>("POST", `/staff/${slug(cafeSlug)}/images`, photo, true),
        /** Needs "posts.moderate": take the reported thing down (and maybe pause its writer), or keep it. */
        resolveReport: (cafeSlug: string, input: ResolveReportInput) =>
          call<StaffFeedDTO>("POST", `/staff/${slug(cafeSlug)}/feed/reports`, input, true),
        /** Needs "posts.moderate". */
        pauseMember: (cafeSlug: string, customerId: string, paused: boolean) =>
          call<StaffFeedDTO>("POST", `/staff/${slug(cafeSlug)}/feed/members/${slug(customerId)}`, { paused }, true),
      },
      dashboard: (cafeSlug: string) => call<StaffDashboardDTO>("GET", `/staff/${slug(cafeSlug)}`, undefined, true),
      tillDonation: (cafeSlug: string, input: TillDonationInput) =>
        call<{ balancePeni: number }>("POST", `/staff/${slug(cafeSlug)}/askida/till`, input, true),
    },
  };
}

export type PeniClient = ReturnType<typeof createPeniClient>;
