import type {
  AccountExportDTO,
  AskidaDTO,
  CafeDetailDTO,
  ClaimDTO,
  CafeHue,
  CafeMembersDTO,
  CafeSummaryDTO,
  CustomerDTO,
  FullWalletDTO,
  GiftDTO,
  GiftPreviewDTO,
  LedgerEntryDTO,
  MeDTO,
  MemberLookupDTO,
  MenuItemDTO,
  PostDTO,
  RecentRecipientDTO,
  RefItemDTO,
  SessionDTO,
  SpendCodeDTO,
  StaffDashboardDTO,
  StaffReportFieldsDTO,
  TakeClaimInput,
  WalletDTO,
  ShiftPersonDTO,
} from "@peni/api";
import {
  InMemoryCommunityStore,
  InMemoryImageStore,
  InMemoryReportStore,
  InMemoryStockStore,
  type StockStore,
  InMemoryBillStore,
  InMemoryDebtStore,
  InMemoryBooksStore,
  InMemoryShiftStore,
  InMemoryTaskStore,
  InMemoryAssistantStore,
  InMemoryChatStore,
  InMemoryLetterStore,
  InMemoryWatchStore,
  type WatchStore,
  type LetterStore,
  type AssistantStore,
  type ChatStore,
  type BillStore,
  type BooksStore,
  type Shift,
  type ShiftStore,
  type TaskStore,
  type DebtStore,
  type ImageStore,
  type ReportStore,
  InMemoryDirectory,
  InMemoryIdentityStore,
  InMemoryLedgerStore,
  InMemoryMenuStore,
  InMemoryClaimStore,
  InMemorySpendCodeStore,
  CLAIM_MISSES_PER_HOUR,
  claimState,
  localDateKey,
  InMemoryPaymentStore,
  InMemoryCashStore,
  manualTerminals,
  InMemoryOrderStore,
  InMemoryStaffStore,
  Ledger,
  PeniError,
  PeniService,
  memberCode,
  normalizeMemberCode,
  startOfLocalDay,
  type AskidaWallEvent,
  type Cafe,
  type CafePeniReport,
  type CafePeniSettings,
  type CommunityStore,
  type Customer,
  type Gift,
  type IdentityStore,
  type LedgerStore,
  type Membership,
  type MenuItem,
  type MenuStore,
  type ClaimStore,
  type SpendCodeStore,
  type PeniClaim,
  type PaymentStore,
  type CashStore,
  type PaymentTerminals,
  type OrderStore,
  type PeniDirectory,
  type Post,
  type PostWithActivity,
  type ReportTargetType,
  type StaffStore,
} from "@peni/core";
import { goods, initials as initialsOf, trUpper } from "@peni/brand/format";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { CustomerAuth, JoseIdTokenVerifier, type EmailSender, type IdTokenVerifier } from "./customer-auth";
import { giftEmail } from "./gift-email";
import { PayService } from "./pay";
import { TaskService } from "./tasks";
import { AlertService } from "./alerts";
import { SalesReportService } from "./sales-report";
import { AskedReportService } from "./asked-reports";
import { AssistantService, demoModel, demoTranscriber, type AiMode } from "./assistant";
import { ChatService } from "./chat";
import { LetterService } from "./letters";
import { MonthPackageService } from "./month-package";
import { WatchService } from "./watch";
import { InsightsService } from "./insights";
import { ChecksService } from "./checks";
import { InboxService } from "./inbox";
import { JobRunner } from "./jobs";
import type { AiModel, Transcriber } from "@peni/ai";
import { shiftEmail } from "./shift-email";
import { ShiftService } from "./shifts";
import { AppError } from "./errors";
import { buildIcs } from "./ics";
import { MenuService } from "./menu";
import { OrderService } from "./orders";
import { PaymentService } from "./payments";
import { CashService } from "./cash";
import { StockService } from "./stock";
import { BillService } from "./bills";
import { DebtService } from "./debts";
import { MoneyService } from "./money";
import { bare, eventCapacity, eventTime, FeedService } from "./feed";
import { StaffService, type StaffContext } from "./staff";

/**
 * The Peni application layer: everything the HTTP routes call.
 *
 * Peni rules (wallets, gifts, askı) live in @peni/core's PeniService; this class
 * adds customers, cafés, menus and the community feed. Every record sits behind a
 * store: in memory for tests and the demo, Postgres (@peni/db) when DATABASE_URL
 * is set (see runtime.ts).
 */

export { AppError, isAppError } from "./errors";

export type CustomerRecord = Customer;

export interface PeniStores {
  ledger: LedgerStore;
  directory: PeniDirectory;
  identity: IdentityStore;
  community: CommunityStore;
  menu: MenuStore;
  orders: OrderStore;
  claims: ClaimStore;
  spendCodes: SpendCodeStore;
  payments: PaymentStore;
  cash: CashStore;
  staff: StaffStore;
  images: ImageStore;
  reports: ReportStore;
  stock: StockStore;
  bills: BillStore;
  debts: DebtStore;
  books: BooksStore;
  shifts: ShiftStore;
  tasks: TaskStore;
  assistant: AssistantStore;
  chat: ChatStore;
  letters: LetterStore;
  watch: WatchStore;
}

export function inMemoryStores(): PeniStores {
  return {
    ledger: new InMemoryLedgerStore(),
    directory: new InMemoryDirectory(),
    identity: new InMemoryIdentityStore(),
    community: new InMemoryCommunityStore(),
    menu: new InMemoryMenuStore(),
    orders: new InMemoryOrderStore(),
    claims: new InMemoryClaimStore(),
    spendCodes: new InMemorySpendCodeStore(),
    payments: new InMemoryPaymentStore(),
    cash: new InMemoryCashStore(),
    staff: new InMemoryStaffStore(),
    images: new InMemoryImageStore(),
    reports: new InMemoryReportStore(),
    stock: new InMemoryStockStore(),
    bills: new InMemoryBillStore(),
    debts: new InMemoryDebtStore(),
    books: new InMemoryBooksStore(),
    shifts: new InMemoryShiftStore(),
    tasks: new InMemoryTaskStore(),
    assistant: new InMemoryAssistantStore(),
    chat: new InMemoryChatStore(),
    letters: new InMemoryLetterStore(),
    watch: new InMemoryWatchStore(),
  };
}

export interface PeniAppOptions {
  demo: boolean;
  /** bcrypt cost for staff passwords. Tests lower it. */
  bcryptRounds?: number;
  /** Customer sign-in. Without it, Google and Apple are off and so is email. */
  auth?: { verifier?: IdTokenVerifier; email?: EmailSender | null };
  /** Defaults to the system clock. Tests move it to check day boundaries. */
  clock?: () => Date;
  /** Which terminal each till pays with. Manual everywhere until the till bridge (D24). */
  terminals?: PaymentTerminals;
  /** The site's own address ("https://peni.app"), for links in emails. Without it no gift email goes out. */
  publicUrl?: string;
  /** The assistant's model (piece 24): OpenAI with a key, the demo's stand-in, or none (off). */
  ai?: { model: AiModel | null; mode: AiMode; transcriber?: Transcriber | null };
  /**
   * The domain cafés' bill addresses are at (piece 26), when this server takes email.
   * The demo shows addresses at fatura.peni.test, which take only its sample email.
   */
  inboxDomain?: string | null;
}

const DEMO_INBOX_DOMAIN = "fatura.peni.test";
/** What cafés see in place of someone who deleted their account. */
export const DELETED_NAME = "Silinmiş üye";
const HOUR_MS = 3_600_000;
const CLOSED_CLAIM = { claimed: "CLAIM_TAKEN", expired: "CLAIM_EXPIRED", cancelled: "CLAIM_CANCELLED" } as const;
const DAY_MS = 24 * HOUR_MS;
/** Customer sessions last this long. */
const SESSION_MS = 90 * DAY_MS;
/** Gift recipient lookups per customer per hour. [G6] */
export const LOOKUP_LIMIT_PER_HOUR = 20;
/** A Peni masası lasts this long in calendars. */
const EVENT_LENGTH_MS = 2 * HOUR_MS;

export class PeniApp {
  readonly directory: PeniDirectory;
  readonly ledger: Ledger;
  readonly peni: PeniService;
  readonly identity: IdentityStore;
  readonly community: CommunityStore;
  readonly menu: MenuStore;
  /** Menü in the café panel (plan piece 5). */
  readonly menuEditor: MenuService;
  /** Satış ekranı's orders (plan piece 6). */
  readonly till: OrderService;
  /** Every payment and refund, through the till's terminal (plan piece 8). */
  readonly payments: PaymentService;
  /** Kasa: the drawer's sessions, counts and cash moves (plan piece 9). */
  readonly cash: CashService;
  /** Stok and each product's recipe (plan piece 17). */
  readonly stock: StockService;
  /** Stock items, moves and recipes as stored; for the demo seed and the data move from Shelby. */
  readonly stockStore: StockStore;
  /** Faturalar and Tedarikçiler (plan piece 18). */
  readonly bills: BillService;
  /** Suppliers, bills and their payments as stored; for the demo seed and the data move from Shelby. */
  readonly billStore: BillStore;
  readonly debts: DebtService;
  /** Checks, loans and the card as stored; for the demo seed and the data move from Shelby. */
  readonly debtStore: DebtStore;
  readonly money: MoneyService;
  readonly books: BooksStore;
  /** Vardiyalar (plan piece 21). */
  readonly shifts: ShiftService;
  /** Puantaj ve maaş (plan piece 21). */
  readonly pay: PayService;
  /** Görevler (piece 22). */
  readonly tasks: TaskService;
  /** Bugün's alerts and the morning email (piece 22). */
  readonly alerts: AlertService;
  /** Raporlar, and today's sales on Bugün (piece 23). */
  readonly salesReports: SalesReportService;
  /** Background work: reading documents (piece 24), later the weekly letter. */
  readonly jobs: JobRunner;
  /** Taslaklar: documents in, drafts out, a person confirms (piece 24). */
  readonly assistant: AssistantService;
  /** Each café's address for bills (piece 26). */
  readonly inbox: InboxService;
  /** Reports asked for in words (piece 29). */
  readonly askedReports: AskedReportService;
  /** The assistant's chat, "Açıkla" and saved reports (piece 29). */
  readonly chat: ChatService;
  /** The weekly letter (piece 30). */
  readonly letters: LetterService;
  readonly watch: WatchService;
  /** Müdavimler: community insights (piece 32). */
  readonly insights: InsightsService;
  /** Ay kapanışı's package for the mali müşavir (piece 30). */
  readonly monthPackage: MonthPackageService;
  /** Orders and payments as stored; for the demo seed and the data move from Shelby. */
  readonly orderStore: OrderStore;
  readonly paymentStore: PaymentStore;
  readonly taskStore: TaskStore;
  /** Shifts, hours, rates and pay as stored; for the demo seed and the data move from Shelby. */
  readonly shiftStore: ShiftStore;
  /** Staff sign-in, the team and roles. */
  readonly staff: StaffService;
  readonly feed: FeedService;
  readonly images: ImageStore;
  /** Customer sign-in with Google, Apple or an email code. */
  readonly auth: CustomerAuth;
  /** Paid orders' peni codes (plan pieces 7 and 10). */
  private readonly claims: ClaimStore;
  /** Members' reports on each other's comments and events (plan piece 15). */
  private readonly reports: ReportStore;
  private readonly staffStore: StaffStore;
  private clockOverride: Date | null = null;

  constructor(
    private readonly options: PeniAppOptions,
    stores: PeniStores = inMemoryStores(),
  ) {
    this.directory = stores.directory;
    this.ledger = new Ledger(stores.ledger);
    this.identity = stores.identity;
    this.community = stores.community;
    this.menu = stores.menu;
    this.claims = stores.claims;
    this.reports = stores.reports;
    this.peni = new PeniService(this.ledger, this.directory, () => this.now(), stores.claims, stores.spendCodes);
    this.auth = new CustomerAuth(this.identity, {
      now: () => this.now(),
      verifier: options.auth?.verifier ?? new JoseIdTokenVerifier({ google: { audiences: [] }, apple: { audiences: [] } }),
      email: options.auth?.email ?? null,
    });
    this.staff = new StaffService(stores.staff, this.identity, { now: () => this.now(), bcryptRounds: options.bcryptRounds });
    this.images = stores.images;
    this.feed = new FeedService(
      stores.community,
      stores.images,
      stores.staff,
      stores.reports,
      this.directory,
      (ids) => this.publicNames(ids),
      async (ids) => new Map((await this.identity.getCustomers(ids)).map((c) => [c.id, firstNameAndInitial(c.displayName) || "İsimsiz üye"])),
      () => this.now(),
    );
    this.menuEditor = new MenuService(this.menu, this.directory, () => this.now());
    this.payments = new PaymentService(stores.payments, options.terminals ?? manualTerminals, () => this.now());
    this.cash = new CashService(stores.cash, stores.payments, stores.staff, () => this.now());
    this.till = new OrderService(stores.orders, stores.claims, this.menu, stores.staff, this.directory, this.payments, this.cash, this.peni, () => this.now());
    // A newcomer may have no name yet; the barista then checks the balance instead.
    this.stockStore = stores.stock;
    this.stock = new StockService(stores.stock, this.menu, stores.staff, () => this.now());
    this.till.stock = this.stock;
    this.billStore = stores.bills;
    this.debtStore = stores.debts;
    this.books = stores.books;
    const atomically = <T>(fn: () => Promise<T>) => stores.ledger.atomically(fn);
    this.money = new MoneyService(stores.books, stores.cash, stores.payments, stores.bills, stores.debts, stores.shifts, this.directory, stores.staff, atomically, () => this.now());
    this.bills = new BillService(stores.bills, stores.stock, this.directory, stores.staff, stores.debts, this.money, atomically, () => this.now(), {
      // The assistant is made below; by the time anyone lists bills, it's there.
      mode: () => this.assistant?.mode ?? "off",
      documents: stores.assistant,
    });
    this.debts = new DebtService(stores.debts, stores.bills, this.bills, this.money, stores.shifts, this.directory, stores.staff, atomically, () => this.now());
    this.shiftStore = stores.shifts;
    this.staffStore = stores.staff;
    this.shifts = new ShiftService(stores.shifts, stores.staff, this.money, this.directory, (ctx, week, shifts, people) => this.tellShifts(ctx, week, shifts, people), () => this.now());
    this.pay = new PayService(stores.shifts, stores.staff, this.money, this.directory, atomically, () => this.now());
    this.taskStore = stores.tasks;
    this.tasks = new TaskService(stores.tasks, stores.shifts, stores.staff, this.directory, () => this.now());
    this.orderStore = stores.orders;
    this.paymentStore = stores.payments;
    this.salesReports = new SalesReportService(stores.orders, stores.payments, stores.bills, stores.shifts, stores.stock, this.menu, this.directory, () => this.now());
    this.jobs = new JobRunner(stores.assistant, () => this.now());
    const ai =
      options.ai ??
      (options.demo
        ? { model: demoModel(() => localDateKey(this.now(), "Europe/Istanbul")), mode: "demo" as const, transcriber: demoTranscriber() }
        : { model: null, mode: "off" as const });
    const checks = new ChecksService(stores.assistant, this.money, stores.payments, stores.bills, stores.debts, this.directory, () => this.now());
    this.assistant = new AssistantService(stores.assistant, this.jobs, this.bills, stores.bills, stores.stock, stores.staff, this.directory, checks, ai, () => this.now());
    this.askedReports = new AskedReportService(stores.orders, stores.payments, stores.bills, stores.shifts, stores.stock, this.menu, this.directory, () => this.now());
    this.insights = new InsightsService({ ledger: stores.ledger, directory: this.directory, community: stores.community, orders: stores.orders, now: () => this.now() });
    this.chat = new ChatService(
      stores.chat,
      stores.assistant,
      this.askedReports,
      this.salesReports,
      stores.bills,
      this.debts,
      this.stock,
      this.money,
      this.directory,
      (ids) => this.staffNames(ids),
      ai,
      () => this.now(),
      this.insights,
    );
    this.inbox = new InboxService(
      stores.assistant,
      this.assistant,
      this.directory,
      { domain: options.inboxDomain ?? (options.demo ? DEMO_INBOX_DOMAIN : null), demo: options.demo },
      () => this.now(),
    );
    this.alerts = new AlertService({
      stock: this.stock,
      debts: this.debts,
      pay: this.pay,
      tasks: this.tasks,
      sales: this.salesReports,
      drafts: this.assistant,
      store: stores.tasks,
      staff: stores.staff,
      directory: this.directory,
      cafes: () => this.identity.listCafes(),
      email: () => this.options.auth?.email ?? null,
      publicUrl: () => this.options.publicUrl ?? null,
      letter: (cafeId) => this.letters.latest(cafeId),
      watch: (cafeId, permissions) => this.watch.attention(cafeId, permissions),
      now: () => this.now(),
    });
    this.monthPackage = new MonthPackageService(stores.bills, stores.assistant, stores.payments, this.money, this.directory, () => this.now());
    this.letters = new LetterService({
      store: stores.letters,
      log: stores.assistant,
      jobs: this.jobs,
      sales: this.salesReports,
      alerts: this.alerts,
      bills: stores.bills,
      stock: stores.stock,
      menu: this.menu,
      staff: stores.staff,
      muted: stores.tasks,
      directory: this.directory,
      cafes: () => this.identity.listCafes(),
      email: () => this.options.auth?.email ?? null,
      publicUrl: () => this.options.publicUrl ?? null,
      ai,
      now: () => this.now(),
    });
    this.watch = new WatchService({
      store: stores.watch,
      bills: stores.bills,
      stock: stores.stock,
      menu: this.menu,
      orders: stores.orders,
      payments: stores.payments,
      cash: stores.cash,
      shifts: stores.shifts,
      staff: stores.staff,
      debts: this.debts,
      money: this.money,
      directory: this.directory,
      now: () => this.now(),
    });
    this.till.peniMemberName = async (membershipId) => firstNameAndInitial(await this.nameForMembership(membershipId)) || "İsimsiz üye";
  }

  /** The app's clock. Everything time-based (ledger, gifts, events) reads it. */
  now(): Date {
    return this.clockOverride ? new Date(this.clockOverride) : (this.options.clock?.() ?? new Date());
  }

  /** Demo seeding only: runs `fn` as if the time were `when`, so history lands on past days. */
  async at<T>(when: Date, fn: () => Promise<T>): Promise<T> {
    const previous = this.clockOverride;
    this.clockOverride = when;
    try {
      return await fn();
    } finally {
      this.clockOverride = previous;
    }
  }

  // ─────────────────────────────────────────────── sessions

  async customerForToken(token: string | null): Promise<CustomerRecord | null> {
    if (!token) return null;
    const id = await this.identity.customerIdForSession(sha256(token), this.now());
    return id ? this.identity.getCustomer(id) : null;
  }

  /** A new 90-day session. Sign-in calls it; so does the demo's one-tap sign-in as a seeded customer. */
  async createSessionFor(customerId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.identity.createSession(customerId, sha256(token), new Date(this.now().getTime() + SESSION_MS));
    return token;
  }

  async signOut(token: string | null): Promise<void> {
    if (token) await this.identity.revokeSession(sha256(token), this.now());
  }

  /** Signs in with the 6-digit code from the email. [plan piece 3] */
  async signInWithEmailCode(email: string, code: string): Promise<SessionDTO> {
    return this.session(await this.auth.verifyEmail(email, code));
  }

  /** Signs in with an ID token from Google or Apple. */
  async signInWithIdToken(provider: "google" | "apple", idToken: string, name?: string): Promise<SessionDTO> {
    return this.session(await this.auth.verifyIdToken(provider, idToken, name));
  }

  private async session({ customer, isNew }: { customer: CustomerRecord; isNew: boolean }): Promise<SessionDTO> {
    return {
      token: await this.createSessionFor(customer.id),
      customer: toCustomerDTO(customer),
      isNew,
      staffCafes: await this.staff.cafesForCustomer(customer.id),
    };
  }

  // ─────────────────────────────────────────────── me (profile, staff cafés)

  async me(customer: CustomerRecord): Promise<MeDTO> {
    return { customer: toCustomerDTO(customer), staffCafes: await this.staff.cafesForCustomer(customer.id) };
  }

  /** "Adın" and "Profilim görünsün". [G18] */
  async updateProfile(customer: CustomerRecord, input: { displayName?: string; profileVisible?: boolean }): Promise<MeDTO> {
    const updated = { ...customer };
    const name = input.displayName?.trim();
    if (name) updated.displayName = name;
    if (input.profileVisible !== undefined) updated.profileVisible = input.profileVisible;
    await this.identity.saveCustomer(updated);
    return this.me(updated);
  }

  /** "Verilerimi indir" (KVKK m. 11): what Peni keeps about the customer, in one file. (plan piece 34) */
  async exportAccount(customer: CustomerRecord): Promise<AccountExportDTO> {
    const wallet = await this.wallet(customer);
    const posts: AccountExportDTO["posts"] = [];
    const cafes: AccountExportDTO["cafes"] = [];
    for (const m of await this.directory.listMemberships({ customerId: customer.id })) {
      const cafe = await this.cafeById(m.cafeId);
      cafes.push({ cafe: cafe.name, joinedAt: m.joinedAt.toISOString(), balancePeni: await this.peni.walletBalance(m.id) });
      for (const p of await this.community.listPosts(cafe.id, { hiddenComments: true, hiddenPosts: true })) {
        if (p.hostCustomerId === customer.id) posts.push({ cafe: cafe.name, at: p.publishedAt.toISOString(), kind: "event", text: [p.title, p.body].filter(Boolean).join("\n") });
        for (const c of p.comments) if (c.customerId === customer.id) posts.push({ cafe: cafe.name, at: c.createdAt.toISOString(), kind: "comment", text: c.body });
      }
    }
    return {
      exportedAt: this.now().toISOString(),
      profile: { displayName: customer.displayName, email: customer.email, phone: customer.phone, profileVisible: customer.profileVisible },
      signIns: (await this.identity.loginsOf(customer.id)).map((l) => ({ provider: l.provider, email: l.email })),
      cafes,
      peniHistory: wallet.ledger,
      gifts: wallet.gifts,
      posts: posts.sort((a, b) => a.at.localeCompare(b.at)),
    };
  }

  /**
   * "Hesabımı sil" (plan piece 34): the person is forgotten and signed out everywhere. What
   * cafés need for their books stays under "Silinmiş üye": peni earned and spent, treats,
   * askı. Peni left at cafés is given up. Their place at events still to come is freed, and
   * events they opened that haven't happened are taken down.
   */
  async deleteAccount(customer: CustomerRecord): Promise<{ ok: true }> {
    const at = this.now();
    for (const m of await this.directory.listMemberships({ customerId: customer.id })) {
      for (const p of await this.community.listPosts(m.cafeId)) {
        if (!p.eventStartsAt || p.eventStartsAt <= at) continue;
        if (p.hostCustomerId === customer.id) {
          const { reactions: _r, rsvps: _v, comments: _c, ...post } = p;
          await this.community.savePost({ ...post, hiddenAt: at });
        } else if (p.rsvps.includes(customer.id)) await this.community.removeRsvp(p.id, customer.id);
      }
    }
    const staff = await this.staffStore.accountForCustomer(customer.id);
    if (staff) await this.staffStore.saveAccount({ ...staff, customerId: null });
    await this.identity.forgetCustomer(customer.id, DELETED_NAME, at);
    return { ok: true };
  }

  // ─────────────────────────────────────────────── cafés

  async listCafes(customer: CustomerRecord | null): Promise<CafeSummaryDTO[]> {
    return Promise.all((await this.identity.listCafes()).map((c) => this.cafeSummary(c, customer)));
  }

  async cafeDetail(slug: string, customer: CustomerRecord | null): Promise<CafeDetailDTO> {
    const cafe = await this.requireCafe(slug);
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.menu.listMenu(cafe.id);
    const membership = customer ? await this.directory.findMembership(customer.id, cafe.id) : null;

    return {
      ...(await this.cafeSummary(cafe, customer)),
      address: cafe.address,
      earnRatePercent: settings.earnRateBps / 100,
      maxRedeemSharePercent: settings.maxRedeemShareBps / 100,
      menu: menu.map((m) => toMenuDTO(m, settings)),
      askida: await this.askida(cafe, settings, menu, { membershipId: membership?.id ?? null }),
      posts: await this.postsFor(cafe.id, customer, settings.timeZone),
      membership: membership
        ? {
            id: membership.id,
            balancePeni: await this.peni.walletBalance(membership.id),
            joinedAt: membership.joinedAt.toISOString(),
            memberCode: await this.memberCodeFor(membership.id),
            paused: !!membership.pausedAt,
          }
        : null,
    };
  }

  async join(slug: string, customer: CustomerRecord): Promise<CafeDetailDTO> {
    const cafe = await this.requireCafe(slug);
    await this.ensureMembership(customer.id, cafe.id);
    return this.cafeDetail(slug, customer);
  }

  async ensureMembership(customerId: string, cafeId: string, joinedAt = this.now()): Promise<string> {
    const existing = await this.directory.findMembership(customerId, cafeId);
    if (existing) return existing.id;
    const id = `mem_${crypto.randomUUID()}`;
    await this.directory.saveMembership({ id, cafeId, customerId, joinedAt, blocked: false });
    await this.memberCodeFor(id);
    return id;
  }

  /** The Peni kodu of a membership: derived from its id, re-rolled only on a collision. [G7b] */
  async memberCodeFor(membershipId: string): Promise<string> {
    const known = await this.identity.memberCodeOf(membershipId);
    if (known) return known;
    for (let attempt = 0; ; attempt++) {
      const code = memberCode(membershipId, attempt);
      if (await this.identity.setMemberCode(membershipId, code)) return code;
    }
  }

  /** Which membership a Peni kodu belongs to, however the till typed it. */
  async membershipForCode(code: string): Promise<string | null> {
    const normalized = normalizeMemberCode(code);
    return normalized ? this.identity.membershipIdForCode(normalized) : null;
  }

  /**
   * Gift recipient check [G6]: by phone or Peni kodu, reveals only "Mehmet K.", only to
   * members of the same café, and only 20 times an hour per customer. Every lookup
   * counts, hits or not.
   */
  async lookupMember(customer: CustomerRecord, slug: string, by: RecipientRef): Promise<MemberLookupDTO> {
    const cafe = await this.requireCafe(slug);
    await this.requireMembershipId(customer.id, cafe.id);
    await this.consumeLookup(customer.id);
    const membership = await this.recipientAt(cafe, by);
    if (membership.customerId === customer.id) throw new AppError("GIFT_INVALID", "You cannot treat yourself", 400);
    const recipient = await this.identity.getCustomer(membership.customerId);
    const { firstName, lastInitial } = nameParts(recipient?.displayName ?? "");
    return { firstName, lastInitial };
  }

  /**
   * "Kafenin üyeleri" [D28]: members of this café who show their profile, to pick whom
   * to treat. Hidden profiles, blocked members and the customer themself are left out.
   */
  async cafeMembers(customer: CustomerRecord, slug: string, q?: string): Promise<CafeMembersDTO> {
    const cafe = await this.requireCafe(slug);
    await this.requireMembershipId(customer.id, cafe.id);
    const memberships = (await this.directory.listMemberships({ cafeId: cafe.id })).filter(
      (m) => !m.blocked && m.customerId !== customer.id,
    );
    const people = new Map((await this.identity.getCustomers(memberships.map((m) => m.customerId))).map((c) => [c.id, c]));
    const needle = q?.trim().toLocaleLowerCase("tr");
    const members = memberships
      .map((m) => ({ m, c: people.get(m.customerId) }))
      .filter((x): x is { m: Membership; c: CustomerRecord } => !!x.c?.profileVisible && !!x.c.displayName.trim())
      .filter(({ c }) => !needle || c.displayName.toLocaleLowerCase("tr").split(/\s+/).some((w) => w.startsWith(needle)))
      .sort((a, b) => a.c.displayName.localeCompare(b.c.displayName, "tr"))
      .slice(0, 50)
      .map(({ m, c }) => ({ memberId: m.id, ...nameParts(c.displayName), initials: initialsOf(c.displayName), avatarUrl: c.avatarUrl }));
    return { members };
  }

  // ─────────────────────────────────────────────── wallet & gifts

  async wallet(customer: CustomerRecord): Promise<FullWalletDTO> {
    // Stand-in for the background job: unaccepted gifts go home after 24 hours.
    await this.peni.expireGifts();

    const cafes: WalletDTO["cafes"] = [];
    const gifts: GiftDTO[] = [];
    const ledger: LedgerEntryDTO[] = [];
    const recents: { cafe: Cafe; recipientId: string; at: Date }[] = [];

    for (const membership of await this.directory.listMemberships({ customerId: customer.id })) {
      const membershipId = membership.id;
      const cafe = await this.cafeById(membership.cafeId);
      const settings = await this.directory.getSettings(cafe.id);
      const menu = await this.menu.listMenu(cafe.id);
      cafes.push({
        cafeSlug: cafe.slug,
        cafeName: cafe.name,
        membershipId,
        balancePeni: await this.peni.walletBalance(membershipId),
        district: cafe.district,
        refItems: refItemsFor(cafe, settings, menu),
        memberCode: await this.memberCodeFor(membershipId),
        hue: cafe.hue as CafeHue | null,
      });

      for (const g of await this.directory.listGifts({ membershipId })) {
        const dto = await this.giftDTO(g, membershipId);
        // A gift the sender took back never reaches the recipient's wallet.
        if (dto.direction === "in" && dto.cancelledBySender) continue;
        gifts.push(dto);
        if (dto.direction === "out") recents.push({ cafe, recipientId: g.toMembershipId, at: g.createdAt });
      }

      for (const entry of await this.peni.memberHistory(membershipId)) {
        const gift = entry.giftId ? await this.directory.getGift(entry.giftId) : null;
        ledger.push({
          id: entry.id,
          at: entry.at.toISOString(),
          cafeSlug: cafe.slug,
          cafeName: cafe.name,
          kind: entry.kind,
          peni: entry.peni,
          orderId: entry.orderId,
          giftId: entry.giftId,
          counterpartName: gift
            ? await this.nameForMembership(entry.kind === "gift_in" ? gift.fromMembershipId : gift.toMembershipId)
            : null,
        });
      }
    }

    gifts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    ledger.sort((a, b) => b.at.localeCompare(a.at));
    return {
      totalPeni: cafes.reduce((s, c) => s + c.balancePeni, 0),
      cafes,
      gifts,
      recentRecipients: await this.recentRecipients(recents),
      ledger,
    };
  }

  async sendGift(
    customer: CustomerRecord,
    input: {
      cafeSlug: string;
      toPhone?: string;
      toCode?: string;
      toMemberId?: string;
      peni: number;
      message?: string;
      idempotencyKey: string;
    },
  ): Promise<GiftDTO> {
    const cafe = await this.requireCafe(input.cafeSlug);
    const from = await this.requireMembershipId(customer.id, cafe.id);
    const to = await this.recipientAt(cafe, recipientRef(input));
    if (to.id === from) throw new PeniError("GIFT_INVALID", "You cannot send a gift to yourself");
    const key = `${customer.id}:${input.idempotencyKey}`;
    const retried = !!(await this.ledger.findByIdempotencyKey(`gift:${key}`));
    const gift = await this.peni.sendGift({
      fromMembershipId: from,
      toMembershipId: to.id,
      peni: input.peni,
      message: input.message,
      idempotencyKey: key,
    });
    if (!retried) await this.tellRecipient(gift, cafe);
    return this.giftDTO(gift, from);
  }

  /**
   * Emails the recipient the gift's link, when they have an address and the site's own
   * address is set (PENI_PUBLIC_URL, never the request's Host). A failed email never
   * fails the gift: the sender can still share the link.
   */
  private async tellRecipient(gift: Gift, cafe: Cafe): Promise<void> {
    const email = this.options.auth?.email;
    const base = this.options.publicUrl;
    if (!email || !base) return;
    const to = await this.customerForMembership(gift.toMembershipId);
    if (!to?.email) return;
    try {
      await email.send(
        giftEmail({
          to: to.email,
          fromName: firstNameAndInitial(await this.nameForMembership(gift.fromMembershipId)) || "Bir arkadaşın",
          peni: gift.peni,
          cafeName: cafe.name,
          message: gift.message,
          link: `${base.replace(/\/+$/, "")}/hediye/${encodeURIComponent(gift.id)}`,
          expiresInHours: Math.round((gift.expiresAt.getTime() - gift.createdAt.getTime()) / HOUR_MS),
        }),
      );
    } catch (error) {
      console.error("Gift email not sent", gift.id, error);
    }
  }

  /**
   * Emails each person on a published week their shifts, when the site's own address is
   * set. One person's failed email doesn't stop the others.
   */
  private async tellShifts(ctx: StaffContext, weekStart: string, shifts: Shift[], people: Map<string, ShiftPersonDTO>): Promise<void> {
    const email = this.options.auth?.email;
    const base = this.options.publicUrl;
    if (!email || !base) return;
    const link = `${base.replace(/\/+$/, "")}/panel/vardiyalar?kafe=${encodeURIComponent(ctx.cafe.slug)}&hafta=${weekStart}`;
    for (const [memberId, person] of people) {
      const mine = shifts.filter((s) => s.memberIds.includes(memberId));
      const member = mine.length ? await this.staffStore.getMember(memberId) : null;
      const account = member && (await this.staffStore.getAccount(member.accountId));
      if (!account?.email) continue;
      try {
        await email.send(shiftEmail({ to: account.email, name: person.name, cafeName: ctx.cafe.name, shifts: mine, link }));
      } catch (error) {
        console.error("Shift email not sent", memberId, weekStart, error);
      }
    }
  }

  async resolveGift(customer: CustomerRecord, giftId: string, action: "accept" | "decline"): Promise<GiftDTO> {
    const gift = await this.directory.getGift(giftId);
    if (!gift) throw new AppError("NOT_FOUND", "Gift not found", 404);
    const membershipId = await this.requireMembershipId(customer.id, gift.cafeId);
    const resolved =
      action === "accept"
        ? await this.peni.acceptGift(giftId, membershipId)
        : await this.peni.declineGift(giftId, membershipId);
    return this.giftDTO(resolved, membershipId);
  }

  /** "Geri al": the sender takes back a pending gift. [G17] */
  async cancelGift(customer: CustomerRecord, giftId: string): Promise<GiftDTO> {
    const gift = await this.directory.getGift(giftId);
    if (!gift) throw new AppError("NOT_FOUND", "Gift not found", 404);
    const membershipId = await this.requireMembershipId(customer.id, gift.cafeId);
    return this.giftDTO(await this.peni.cancelGift(giftId, membershipId), membershipId);
  }

  /** "Teşekkür et": once per accepted gift; asking again changes nothing. [G15] */
  async thankGift(customer: CustomerRecord, giftId: string): Promise<GiftDTO> {
    const gift = await this.directory.getGift(giftId);
    if (!gift) throw new AppError("NOT_FOUND", "Gift not found", 404);
    const membershipId = await this.requireMembershipId(customer.id, gift.cafeId);
    if (gift.toMembershipId !== membershipId) throw new AppError("FORBIDDEN", "Only the recipient can say thanks", 403);
    if (gift.status !== "accepted") throw new AppError("GIFT_NOT_ACCEPTED", "Accept the gift first", 409);
    if (!gift.thankedAt) {
      gift.thankedAt = this.now();
      await this.directory.saveGift(gift);
    }
    return this.giftDTO(gift, membershipId);
  }

  /** Public view of a shared gift link, personalised when the visitor is signed in. [G11] */
  async giftPreview(giftId: string, viewer: CustomerRecord | null): Promise<GiftPreviewDTO> {
    await this.peni.expireGifts();
    const gift = await this.directory.getGift(giftId);
    if (!gift) throw new AppError("NOT_FOUND", "Gift not found", 404);
    const cafe = await this.cafeById(gift.cafeId);
    const settings = await this.directory.getSettings(cafe.id);
    const refItems = refItemsFor(cafe, settings, await this.menu.listMenu(cafe.id));
    const viewerMembership = viewer ? (await this.directory.findMembership(viewer.id, cafe.id))?.id : undefined;
    const party = viewerMembership === gift.toMembershipId || viewerMembership === gift.fromMembershipId;
    return {
      id: gift.id,
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      fromFirstName: nameParts(await this.nameForMembership(gift.fromMembershipId)).firstName,
      peni: gift.peni,
      goods: goods(gift.peni, refItems),
      refItems,
      status: gift.status,
      expiresAt: gift.expiresAt.toISOString(),
      viewer: !viewer
        ? "signed_out"
        : viewerMembership === gift.toMembershipId
          ? "recipient"
          : viewerMembership === gift.fromMembershipId
            ? "sender"
            : viewerMembership
              ? "member"
              : "guest",
      hue: cafe.hue as CafeHue | null,
      gift: party ? await this.giftDTO(gift, viewerMembership!) : null,
    };
  }

  // ─────────────────────────────────────────────── earning peni (plan piece 10)

  /** What the customer screen's QR opens: public, and personal once signed in. */
  async claimPreview(token: string, viewer: CustomerRecord | null): Promise<ClaimDTO> {
    const claim = await this.claims.getClaimByToken(token);
    if (!claim) throw new AppError("CLAIM_NOT_FOUND", "No such penny code", 404);
    return this.claimDTO(claim, viewer, false);
  }

  /**
   * "Peni'yi al": by the QR's token, or the 4-digit code typed for a café. The customer
   * joins the café if they weren't a member yet. Wrong codes are counted, a few an hour
   * allowed, so nobody can try codes until they hit someone else's peni.
   */
  async takeClaim(customer: CustomerRecord, input: TakeClaimInput): Promise<ClaimDTO> {
    let claim: PeniClaim | null;
    if ("token" in input) {
      claim = await this.claims.getClaimByToken(input.token);
      if (!claim) throw new AppError("CLAIM_NOT_FOUND", "No such penny code", 404);
    } else {
      const cafe = await this.requireCafe(input.cafeSlug);
      const now = this.now();
      if ((await this.claims.countMisses(customer.id, new Date(now.getTime() - HOUR_MS))) >= CLAIM_MISSES_PER_HOUR) {
        throw new AppError("CLAIM_CODE_LIMITED", "Too many wrong codes; try again later", 429);
      }
      const day = localDateKey(now, (await this.directory.getSettings(cafe.id)).timeZone);
      claim = await this.claims.getClaimByCode(cafe.id, day, input.code.trim());
      const own = claim?.claimedByMembershipId && claim.claimedByMembershipId === (await this.directory.findMembership(customer.id, cafe.id))?.id;
      // Someone else's taken code counts as a miss too: it's what a guess would hit.
      if (!claim || (claim.claimedAt && !own)) {
        await this.claims.recordMiss(customer.id, now);
        if (!claim) throw new AppError("CLAIM_CODE_WRONG", "No open penny code like that here", 404);
      }
    }
    const before = await this.directory.findMembership(customer.id, claim.cafeId);
    // Only peni that can still be taken make someone a member.
    const state = claimState(claim, this.now());
    if (!before && state !== "open") throw new PeniError(CLOSED_CLAIM[state], "This penny code is closed");
    const membershipId = before?.id ?? (await this.ensureMembership(customer.id, claim.cafeId));
    const { claim: taken } = await this.peni.takeClaim(claim.id, membershipId);
    return this.claimDTO(taken, customer, !before);
  }

  /** "Ödeme kodum" (plan piece 11): a fresh code to spend peni at the café's till. */
  async spendCode(customer: CustomerRecord, cafeSlug: string): Promise<SpendCodeDTO> {
    const cafe = await this.requireCafe(cafeSlug);
    const membershipId = await this.requireMembershipId(customer.id, cafe.id);
    const code = await this.peni.issueSpendCode(membershipId, () => randomInt(1_000_000) / 1_000_000);
    return {
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      hue: cafe.hue as CafeHue | null,
      code: code.code,
      expiresAt: code.expiresAt.toISOString(),
      balancePeni: await this.peni.walletBalance(membershipId),
    };
  }

  private async claimDTO(claim: PeniClaim, viewer: CustomerRecord | null, joined: boolean): Promise<ClaimDTO> {
    const cafe = await this.cafeById(claim.cafeId);
    const settings = await this.directory.getSettings(cafe.id);
    const refItems = refItemsFor(cafe, settings, await this.menu.listMenu(cafe.id));
    const membership = viewer ? await this.directory.findMembership(viewer.id, cafe.id) : null;
    const state = claimState(claim, this.now());
    const yours = state === "claimed" && !!membership && claim.claimedByMembershipId === membership.id;
    return {
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      hue: cafe.hue as CafeHue | null,
      peni: claim.peni,
      goods: goods(claim.peni, refItems),
      state: yours ? "yours" : state === "claimed" ? "taken" : state,
      expiresAt: claim.expiresAt.toISOString(),
      balancePeni: yours ? await this.peni.walletBalance(membership.id) : null,
      joined,
    };
  }

  // ─────────────────────────────────────────────── askıda kahve

  async donateToAskida(
    customer: CustomerRecord,
    input: { cafeSlug: string; peni: number; showName: boolean; idempotencyKey: string },
  ) {
    const cafe = await this.requireCafe(input.cafeSlug);
    const membershipId = await this.requireMembershipId(customer.id, cafe.id);
    const { matchedPeni } = await this.peni.donateToAskida({
      membershipId,
      peni: input.peni,
      showName: input.showName,
      idempotencyKey: `${customer.id}:${input.idempotencyKey}`,
    });
    return { balancePeni: await this.peni.walletBalance(membershipId), matchedPeni };
  }

  async tillDonation(staff: Pick<StaffContext, "cafe" | "member">, input: { peni: number; idempotencyKey: string }) {
    const { cafe } = staff;
    await this.peni.recordTillDonation({
      cafeId: cafe.id,
      peni: input.peni,
      staffUserId: staff.member.id,
      idempotencyKey: input.idempotencyKey,
    });
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.menu.listMenu(cafe.id);
    return { balancePeni: (await this.askida(cafe, settings, menu, { wallSize: 0 })).balancePeni };
  }

  // ─────────────────────────────────────────────── staff dashboard

  async staffDashboard({ cafe, permissions }: Pick<StaffContext, "cafe"> & Partial<Pick<StaffContext, "permissions">>): Promise<StaffDashboardDTO> {
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.menu.listMenu(cafe.id);
    const now = this.now();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const previousSince = new Date(now.getTime() - 60 * DAY_MS);
    const report = await this.peni.cafeReport(cafe.id, since);
    const previous = await this.peni.cafeReport(cafe.id, previousSince, since);
    const members = await this.directory.listMemberships({ cafeId: cafe.id });

    return {
      cafe: { id: cafe.id, slug: cafe.slug, name: cafe.name },
      askida: await this.askida(cafe, settings, menu),
      report: {
        ...report,
        sinceIso: since.toISOString(),
        previous: {
          ...reportFields(previous, previousSince),
          untilIso: since.toISOString(),
          memberCount: members.filter((m) => m.joinedAt < since).length,
        },
      },
      memberCount: members.length,
      lowStock: permissions?.has("stock.view") ? await this.stock.lowStock(cafe.id) : null,
      billsOwed: permissions?.has("bills.view") ? await this.bills.owed(cafe.id) : null,
      debts: permissions?.has("debts.view") ? (await this.debts.overview(cafe.id, permissions)).totals : null,
    };
  }

  // ─────────────────────────────────────────────── community

  async react(customer: CustomerRecord, slug: string, postId: string) {
    await this.requirePost(slug, postId, customer);
    await this.community.toggleReaction(postId, customer.id, this.now());
    return { ok: true as const };
  }

  async rsvp(customer: CustomerRecord, slug: string, postId: string) {
    const post = await this.requirePost(slug, postId, customer);
    if (post.kind !== "event") throw new AppError("VALIDATION", "Only events take RSVPs");
    if (post.rsvps.includes(customer.id)) await this.community.removeRsvp(postId, customer.id);
    else {
      if (post.eventCapacity && post.rsvps.length >= post.eventCapacity) throw new AppError("EVENT_FULL", "Event is full", 409);
      await this.community.addRsvp(postId, customer.id, this.now());
    }
    return { ok: true as const };
  }

  async comment(customer: CustomerRecord, slug: string, postId: string, body: string) {
    await this.requirePost(slug, postId, customer);
    await this.community.addComment(postId, { id: `cmt_${crypto.randomUUID()}`, customerId: customer.id, body, createdAt: this.now() });
    return { ok: true as const };
  }

  /** Takes back the viewer's own comment, for good. Someone else's isn't theirs to take. */
  async deleteComment(customer: CustomerRecord, slug: string, postId: string, commentId: string) {
    // Taking a comment back is fine even while paused.
    const post = await this.requirePost(slug, postId, customer, false);
    const comment = post.comments.find((c) => c.id === commentId);
    if (!comment || comment.customerId !== customer.id) throw new AppError("COMMENT_NOT_FOUND", "No such comment of yours", 404);
    await this.community.deleteComment(postId, commentId);
    return { ok: true as const };
  }

  /** A member opens an event (D4): a topic, a time, maybe a limit. They're the first one going. */
  async openEvent(
    customer: CustomerRecord,
    slug: string,
    input: { createKey: string; title: string; body: string; startsAt: string; capacity: number | null },
  ): Promise<{ ok: true; postId: string }> {
    const cafe = await this.requireWriter(slug, customer);
    const id = `post_${input.createKey}`;
    const existing = await this.community.getPost(id, { hiddenPosts: true });
    if (existing) {
      if (existing.cafeId !== cafe.id || existing.hostCustomerId !== customer.id) throw new AppError("IDEMPOTENCY_CONFLICT", "This key is taken", 409);
      return { ok: true, postId: id };
    }
    const now = this.now();
    const startsAt = eventTime(input.startsAt, now);
    const upcoming = (await this.community.listPosts(cafe.id)).filter((p) => p.hostCustomerId === customer.id && p.eventStartsAt && p.eventStartsAt > now);
    if (upcoming.length >= MAX_OPEN_EVENTS) throw new AppError("EVENT_LIMIT", `At most ${MAX_OPEN_EVENTS} upcoming events each`, 409);
    await this.community.savePost({
      id,
      cafeId: cafe.id,
      kind: "event",
      title: input.title,
      body: input.body,
      imageUrls: [],
      pinned: false,
      publishedAt: now,
      eventStartsAt: startsAt,
      eventCapacity: input.capacity,
      authorId: null,
      hostCustomerId: customer.id,
      hiddenAt: null,
    });
    await this.community.addRsvp(id, customer.id, now);
    return { ok: true, postId: id };
  }

  /** The host changes their event's topic, words, time or limit. */
  async updateEvent(
    customer: CustomerRecord,
    slug: string,
    postId: string,
    input: { title?: string; body?: string; startsAt?: string; capacity?: number | null },
  ): Promise<{ ok: true }> {
    const post = await this.hostedEvent(slug, postId, customer);
    await this.community.savePost({
      ...bare(post),
      title: input.title ?? post.title,
      body: input.body ?? post.body,
      eventStartsAt: input.startsAt ? eventTime(input.startsAt, this.now()) : post.eventStartsAt,
      eventCapacity: input.capacity !== undefined ? eventCapacity(input.capacity, post.rsvps.length) : post.eventCapacity,
    });
    return { ok: true };
  }

  /** The host calls their event off: gone from the feed, and any reports on it are closed. */
  async cancelEvent(customer: CustomerRecord, slug: string, postId: string): Promise<{ ok: true }> {
    const post = await this.hostedEvent(slug, postId, customer, false);
    await this.community.savePost({ ...bare(post), hiddenAt: this.now() });
    await this.reports.resolve("post", post.id, "dismissed", customer.id, this.now());
    return { ok: true };
  }

  /** Reports another member's comment or event to the café's moderators, once. */
  async report(
    customer: CustomerRecord,
    slug: string,
    input: { targetType: ReportTargetType; targetId: string; reason: "spam" | "rude" | "unsafe" | "other"; note?: string },
  ): Promise<{ ok: true }> {
    const cafe = await this.requireWriter(slug, customer);
    const postId =
      input.targetType === "post"
        ? input.targetId
        : (await this.community.listPosts(cafe.id)).find((p) => p.comments.some((c) => c.id === input.targetId))?.id;
    if (!postId) throw new AppError("COMMENT_NOT_FOUND", "No such comment", 404);
    await this.feed.report(cafe.id, customer.id, { ...input, postId });
    return { ok: true };
  }

  /** Staff members' names, for who saved a report (piece 29). */
  private async staffNames(memberIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(memberIds)) {
      const member = await this.staffStore.getMember(id);
      const account = member && (await this.staffStore.getAccount(member.accountId));
      if (account) out.set(id, account.name);
    }
    return out;
  }

  private async publicNames(customerIds: string[]): Promise<Map<string, string>> {
    return new Map((await this.identity.getCustomers(customerIds)).map((c) => [c.id, publicName(c)]));
  }

  /** A Peni masası as an .ics file. Public, so a phone can hand the link to its calendar. [G22] */
  async eventIcs(slug: string, postId: string): Promise<{ filename: string; body: string }> {
    const cafe = await this.requireCafe(slug);
    const post = await this.community.getPost(postId);
    if (!post || post.cafeId !== cafe.id || post.kind !== "event" || !post.eventStartsAt) {
      throw new AppError("NOT_FOUND", "Event not found", 404);
    }
    const location = [cafe.name, cafe.address, cafe.district, cafe.city].filter(Boolean).join(", ");
    return {
      filename: `peni-masasi-${post.eventStartsAt.toISOString().slice(0, 10)}.ics`,
      body: buildIcs({
        uid: `${post.id}@peni`,
        stamp: this.now(),
        start: post.eventStartsAt,
        end: new Date(post.eventStartsAt.getTime() + EVENT_LENGTH_MS),
        summary: postTitle(post),
        location,
        description: post.title ? post.body : null,
      }),
    };
  }

  // ─────────────────────────────────────────────── internals

  private async cafeSummary(cafe: Cafe, customer: CustomerRecord | null): Promise<CafeSummaryDTO> {
    const settings = await this.directory.getSettings(cafe.id);
    const menu = await this.menu.listMenu(cafe.id);
    const reference = askidaReference(cafe, settings, menu);
    const snap = await this.peni.askidaSnapshot(cafe.id, reference?.priceKurus ?? 100);
    const membership = customer ? await this.directory.findMembership(customer.id, cafe.id) : null;
    return {
      id: cafe.id,
      slug: cafe.slug,
      name: cafe.name,
      district: cafe.district,
      city: cafe.city,
      coverImageUrl: cafe.coverImageUrl,
      askidaItemsAvailable: reference ? snap.itemsAvailable : 0,
      isMember: !!membership,
      balancePeni: membership ? await this.peni.walletBalance(membership.id) : null,
      earnRatePercent: settings.earnRateBps / 100,
      refItems: refItemsFor(cafe, settings, menu),
      nextEvent: await this.nextEvent(cafe.id),
      hue: cafe.hue as CafeHue | null,
    };
  }

  private async askida(
    cafe: Cafe,
    settings: CafePeniSettings,
    menu: MenuItem[],
    opts: { wallSize?: number; membershipId?: string | null } = {},
  ): Promise<AskidaDTO> {
    const wallSize = opts.wallSize ?? 15;
    const reference = askidaReference(cafe, settings, menu);
    const snap = await this.peni.askidaSnapshot(cafe.id, reference?.priceKurus ?? 100);
    // Claims are never listed, not even anonymously with a time: only donations reach the wall (§17).
    const wall =
      wallSize > 0
        ? (await this.peni.askidaWall(cafe.id, wallSize * 3))
            .filter((e): e is Exclude<AskidaWallEvent, { type: "claim" }> => e.type !== "claim")
            .slice(0, wallSize)
        : [];
    return {
      enabled: settings.askidaEnabled,
      balancePeni: snap.balancePeni,
      itemsAvailable: reference ? snap.itemsAvailable : 0,
      referenceItemName: reference?.name ?? null,
      claimedLast7Days: snap.claimedLast7Days,
      donatedLast7DaysPeni: snap.donatedLast7DaysPeni,
      claimsPerDay: settings.askidaClaimsPerDay,
      wall: await Promise.all(
        wall.map(async (e) => {
          const at = e.at.toISOString();
          if (e.type === "donation") {
            return { type: "donation" as const, at, peni: e.peni, donorName: await this.memberName(e.donorMembershipId) };
          }
          return { type: e.type, at, peni: e.peni };
        }),
      ),
      myEligibility: await this.peni.askidaEligibility(opts.membershipId ?? null),
      matchPercent: await this.peni.askidaMatchPercent(cafe.id),
    };
  }

  private async postsFor(cafeId: string, customer: CustomerRecord | null, timeZone: string): Promise<PostDTO[]> {
    const today = startOfLocalDay(this.now(), timeZone);
    const viewer = customer?.id ?? null;
    const posts = await this.community.listPosts(cafeId);
    const reported = viewer ? await this.reports.reportedBy(cafeId, viewer) : new Set<string>();
    const people = new Map(
      (
        await this.identity.getCustomers([
          ...new Set(posts.flatMap((p) => [...p.rsvps, ...p.comments.map((c) => c.customerId), ...(p.hostCustomerId ? [p.hostCustomerId] : [])])),
        ])
      ).map((c) => [c.id, c]),
    );
    return [...posts]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.getTime() - a.publishedAt.getTime())
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        body: p.body,
        publishedAt: p.publishedAt.toISOString(),
        pinned: p.pinned,
        eventStartsAt: p.eventStartsAt?.toISOString() ?? null,
        eventCapacity: p.eventCapacity,
        reactionCount: p.reactions.length,
        commentCount: p.comments.length,
        rsvpCount: p.rsvps.length,
        reactedByMe: !!viewer && p.reactions.includes(viewer),
        rsvpedByMe: !!viewer && p.rsvps.includes(viewer),
        comments: p.comments.map((c) => ({
          id: c.id,
          authorName: publicName(people.get(c.customerId)),
          body: c.body,
          createdAt: c.createdAt.toISOString(),
          mine: c.customerId === viewer,
          reportedByMe: reported.has(`comment:${c.id}`),
        })),
        imageUrls: p.imageUrls ?? [],
        title: p.title,
        attendees: p.rsvps.map((id) => {
          const c = people.get(id);
          const me = id === viewer;
          return { initials: c && (me || c.profileVisible) ? initialsOf(c.displayName) : null, me };
        }),
        answeredTodayByMe:
          p.kind === "question" && !!viewer && p.comments.some((c) => c.customerId === viewer && c.createdAt >= today),
        host: p.hostCustomerId ? { name: publicName(people.get(p.hostCustomerId)), mine: p.hostCustomerId === viewer } : null,
        reportedByMe: reported.has(`post:${p.id}`),
      }));
  }

  private async nextEvent(cafeId: string): Promise<CafeSummaryDTO["nextEvent"]> {
    const now = this.now();
    const next = (await this.community.listPosts(cafeId))
      .filter((p) => p.kind === "event" && p.eventStartsAt && p.eventStartsAt > now)
      .sort((a, b) => a.eventStartsAt!.getTime() - b.eventStartsAt!.getTime())[0];
    return next ? { postId: next.id, startsAt: next.eventStartsAt!.toISOString(), title: postTitle(next) } : null;
  }

  private async giftDTO(g: Gift, viewerMembershipId: string): Promise<GiftDTO> {
    const cafe = await this.cafeById(g.cafeId);
    const direction = g.toMembershipId === viewerMembershipId ? "in" : "out";
    return {
      id: g.id,
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      peni: g.peni,
      message: g.message,
      status: g.status,
      fromName: await this.nameForMembership(g.fromMembershipId),
      toName: await this.nameForMembership(g.toMembershipId),
      direction,
      createdAt: g.createdAt.toISOString(),
      expiresAt: g.expiresAt.toISOString(),
      canCancel: direction === "out" && g.status === "pending" && g.expiresAt > this.now(),
      cancelledBySender: g.status === "declined" && (await this.peni.giftCancelledBySender(g.id)),
      thankedAt: g.thankedAt?.toISOString() ?? null,
    };
  }

  /** "Son ısmarladıkların": per café, newest first, one row per person, at most 5 each. [G6] */
  private async recentRecipients(sent: { cafe: Cafe; recipientId: string; at: Date }[]): Promise<RecentRecipientDTO[]> {
    const seen = new Set<string>();
    const perCafe = new Map<string, number>();
    const out: RecentRecipientDTO[] = [];
    for (const s of [...sent].sort((a, b) => b.at.getTime() - a.at.getTime())) {
      const key = `${s.cafe.id}:${s.recipientId}`;
      const count = perCafe.get(s.cafe.id) ?? 0;
      if (seen.has(key) || count >= 5) continue;
      const customer = await this.customerForMembership(s.recipientId);
      if (!customer) continue;
      seen.add(key);
      perCafe.set(s.cafe.id, count + 1);
      const { firstName, lastInitial } = nameParts(customer.displayName);
      out.push({
        cafeSlug: s.cafe.slug,
        memberId: s.recipientId,
        phone: customer.phone,
        firstName,
        lastInitial,
        initials: initialsOf(customer.displayName),
        lastGiftAt: s.at.toISOString(),
      });
    }
    return out;
  }

  /** The membership at this café that a phone, a Peni kodu or a picked member points to. Blocked members can't be treated. */
  private async recipientAt(cafe: Cafe, to: RecipientRef): Promise<Membership> {
    let membership: Membership | null = null;
    if ("memberId" in to) {
      membership = await this.directory.getMembership(to.memberId);
    } else if ("code" in to) {
      const id = await this.membershipForCode(to.code);
      membership = id ? await this.directory.getMembership(id) : null;
    } else {
      const recipient = await this.identity.getCustomerByPhone(to.phone);
      membership = recipient ? await this.directory.findMembership(recipient.id, cafe.id) : null;
    }
    if (!membership || membership.cafeId !== cafe.id || membership.blocked) {
      throw new AppError("RECIPIENT_NOT_MEMBER", "No such member at this café", 404);
    }
    return membership;
  }

  private async consumeLookup(customerId: string): Promise<void> {
    const now = this.now();
    if ((await this.identity.countLookups(customerId, new Date(now.getTime() - HOUR_MS))) >= LOOKUP_LIMIT_PER_HOUR) {
      throw new AppError("LOOKUP_LIMITED", "Too many lookups; try again later", 429);
    }
    await this.identity.recordLookup(customerId, now);
  }

  private async customerForMembership(membershipId: string): Promise<CustomerRecord | null> {
    const m = await this.directory.getMembership(membershipId);
    return m ? this.identity.getCustomer(m.customerId) : null;
  }

  /** Gifts are between people who know each other, so the real display name is shown. */
  private async nameForMembership(membershipId: string): Promise<string> {
    return (await this.customerForMembership(membershipId))?.displayName ?? "Misafir";
  }

  private async memberName(membershipId: string | null): Promise<string | null> {
    if (!membershipId) return null;
    const c = await this.customerForMembership(membershipId);
    return c ? firstNameAndInitial(c.displayName) : null;
  }

  /** A post on this café's feed, for a member who may write there (`write`: not paused). */
  private async requirePost(slug: string, postId: string, customer: CustomerRecord, write = true): Promise<PostWithActivity> {
    const cafe = await this.requireCafe(slug);
    const post = await this.community.getPost(postId);
    if (!post || post.cafeId !== cafe.id) throw new AppError("NOT_FOUND", "Post not found", 404);
    if (write) await this.requireWriter(slug, customer);
    else await this.requireMembershipId(customer.id, cafe.id);
    return post;
  }

  /** The café, for a member the moderators haven't paused. */
  private async requireWriter(slug: string, customer: CustomerRecord): Promise<Cafe> {
    const cafe = await this.requireCafe(slug);
    const m = await this.directory.findMembership(customer.id, cafe.id);
    if (!m) throw new AppError("NOT_A_MEMBER", "Join the café first", 403);
    if (m.pausedAt) throw new AppError("MEMBER_PAUSED", "Paused in this café's community", 403);
    return cafe;
  }

  /** An event this member opened. */
  private async hostedEvent(slug: string, postId: string, customer: CustomerRecord, write = true): Promise<PostWithActivity> {
    const post = await this.requirePost(slug, postId, customer, write);
    if (post.hostCustomerId !== customer.id) throw new AppError("NOT_FOUND", "No such event of yours", 404);
    return post;
  }

  private async requireCafe(slug: string): Promise<Cafe> {
    const cafe = await this.identity.getCafeBySlug(slug);
    if (!cafe) throw new AppError("NOT_FOUND", "Café not found", 404);
    return cafe;
  }

  private async cafeById(id: string): Promise<Cafe> {
    const cafe = await this.identity.getCafe(id);
    if (!cafe) throw new AppError("NOT_FOUND", "Café not found", 404);
    return cafe;
  }

  private async requireMembershipId(customerId: string, cafeId: string): Promise<string> {
    const m = await this.directory.findMembership(customerId, cafeId);
    if (!m) throw new AppError("NOT_A_MEMBER", "Join the café first", 403);
    return m.id;
  }
}

/** Upcoming events one member can have open at a café at once. */
const MAX_OPEN_EVENTS = 3;

/** Who a gift goes to: a phone number, a Peni kodu, or a member picked from a list. [G6, D28] */
export type RecipientRef = { phone: string } | { code: string } | { memberId: string };

function recipientRef(input: { toPhone?: string; toCode?: string; toMemberId?: string }): RecipientRef {
  if (input.toMemberId !== undefined) return { memberId: input.toMemberId };
  if (input.toCode !== undefined) return { code: input.toCode };
  if (input.toPhone !== undefined) return { phone: input.toPhone };
  throw new AppError("VALIDATION", "Choose whom to treat", 400);
}

function toCustomerDTO(c: CustomerRecord): CustomerDTO {
  return {
    id: c.id,
    phone: c.phone,
    email: c.email,
    displayName: c.displayName,
    avatarUrl: c.avatarUrl,
    profileVisible: c.profileVisible,
  };
}

function toMenuDTO(m: MenuItem, settings: CafePeniSettings): MenuItemDTO {
  return {
    productId: m.productId,
    name: m.name,
    category: m.category,
    priceKurus: m.priceKurus,
    available: m.available,
    description: m.description ?? null,
    imageUrl: m.imageUrl ?? null,
    askida: settings.askidaEnabled && settings.askidaProductIds.includes(m.productId),
  };
}

/** The askı counts in this item: the café's first reference item that is on the askı, else the cheapest askı item. */
function askidaReference(cafe: Cafe, settings: CafePeniSettings, menu: MenuItem[]): MenuItem | null {
  const askidaItems = menu.filter((m) => settings.askidaProductIds.includes(m.productId));
  const preferred = cafe.referenceProductIds.map((id) => askidaItems.find((m) => m.productId === id)).find(Boolean);
  return preferred ?? [...askidaItems].sort((a, b) => a.priceKurus - b.priceKurus)[0] ?? null;
}

/** Up to two reference items, cheapest first: the café's own picks, else its cheapest askı items. [G1] */
function refItemsFor(cafe: Cafe, settings: CafePeniSettings, menu: MenuItem[]): RefItemDTO[] {
  const chosen = cafe.referenceProductIds.flatMap((id) => menu.filter((m) => m.productId === id));
  const pool = chosen.length > 0 ? chosen : menu.filter((m) => settings.askidaProductIds.includes(m.productId));
  return [...pool]
    .sort((a, b) => a.priceKurus - b.priceKurus)
    .slice(0, 2)
    .map((m) => ({ name: m.name, priceKurus: m.priceKurus }));
}

function postTitle(p: Post): string {
  return p.title?.trim() || p.body.split("\n")[0]!.trim();
}

/** In the community, hidden profiles show as "Bir üye"; visible ones as "Ayşe Y.". */
function publicName(c: CustomerRecord | undefined): string {
  return c?.profileVisible ? firstNameAndInitial(c.displayName) : "Bir üye";
}

function reportFields(r: CafePeniReport, since: Date): StaffReportFieldsDTO {
  return {
    sinceIso: since.toISOString(),
    issuedPeni: r.issuedPeni,
    redeemedPeni: r.redeemedPeni,
    askidaDonatedByMembersPeni: r.askidaDonatedByMembersPeni,
    askidaTillDonationsPeni: r.askidaTillDonationsPeni,
    askidaMatchedByCafePeni: r.askidaMatchedByCafePeni,
    askidaClaimedPeni: r.askidaClaimedPeni,
    askidaClaims: r.askidaClaims,
    outstandingPeni: r.outstandingPeni,
  };
}

function nameParts(name: string): { firstName: string; lastInitial: string | null } {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  const initial = last ? Array.from(last)[0] : undefined;
  return { firstName: first ?? name, lastInitial: initial ? trUpper(initial) : null };
}

function firstNameAndInitial(name: string): string {
  const { firstName, lastInitial } = nameParts(name);
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
