// Response shapes. Dates are ISO strings; money is kuruş; peni is whole numbers.

export interface CustomerDTO {
  id: string;
  /** Null for customers who signed in with Google, Apple or email and haven't added one. */
  phone: string | null;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  profileVisible: boolean;
}

export type StaffRole = "owner" | "manager" | "chef" | "barista";

/** A café where this customer works. Only staff see a way into the café panel. [G19] */
export interface StaffCafeDTO {
  slug: string;
  name: string;
  role: StaffRole;
}

/** `GET /auth/providers`: which sign-in buttons to show. */
export interface AuthProvidersDTO {
  google: boolean;
  apple: boolean;
  email: boolean;
}

/** `POST /auth/email/verify`, `/auth/google`, `/auth/apple`. The web app uses the cookie; the app keeps `token`. */
export interface SessionDTO {
  token: string;
  customer: CustomerDTO;
  /** True until the customer has told us their name: show the "Adın ne?" step. [G8] */
  isNew: boolean;
  /** Empty for everyone who is not café staff. [G19] */
  staffCafes: StaffCafeDTO[];
}

/** `GET /me` and `POST /me/profile`. [G18, G19] */
export interface MeDTO {
  customer: CustomerDTO;
  staffCafes: StaffCafeDTO[];
}

/** A café's own colourway. Null until the café picks one; then the UI uses `cafeHue(slug)`. [G9] */
export type CafeHue = "zeytin" | "lacivert" | "murekkep" | "patlican";

/** A menu item used to read peni as goods: "3 çay · 1 Türk kahvesi". Cheapest first. [G1] */
export interface RefItemDTO {
  name: string;
  priceKurus: number;
}

export interface MenuItemDTO {
  productId: string;
  name: string;
  category: string;
  priceKurus: number;
  available: boolean;
  description: string | null;
  imageUrl: string | null;
  askida: boolean;
}

// ─────────────────────────────────────────────── café panel: Menü (plan piece 5)

export interface StaffMenuCategoryDTO {
  id: string;
  name: string;
  /** Products on the menu in it; removed ones don't count. */
  productCount: number;
}

export interface StaffMenuProductDTO {
  productId: string;
  name: string;
  /** Null only for a removed product whose category was deleted. */
  categoryId: string | null;
  category: string;
  priceKurus: number;
  /** On the till and the customer pages. */
  available: boolean;
  description: string | null;
  imageUrl: string | null;
  /** On the askı list (set in Peni ve askı). */
  askida: boolean;
}

/** `GET /staff/:slug/menu`, and the answer to every menu change. */
export interface StaffMenuDTO {
  /** Top to bottom, as on the till's tabs. */
  categories: StaffMenuCategoryDTO[];
  /** On the menu, by category then position. */
  products: StaffMenuProductDTO[];
  /** "Menüden kaldırılanlar": kept for past sales; can be brought back. */
  removed: StaffMenuProductDTO[];
}

// ─────────────────────────────────────────────── stock and recipes (plan piece 17)

export type StockUnitDTO = "kg" | "l" | "adet";
export type StockLevelDTO = "ok" | "low" | "out";
export type StockModeDTO = "recipe" | "counted" | "none";
export type WasteWhyDTO = "spilled" | "expired" | "broken" | "other";

/**
 * An ingredient or supply. Amounts are thousandths of the unit: grams for kg, ml for
 * litres, 1000 per piece. `qtyMilli` can be below zero when sales ran ahead of a count.
 */
export interface StockItemDTO {
  id: string;
  name: string;
  kind: "ingredient" | "supply";
  unit: StockUnitDTO;
  qtyMilli: number;
  /** 0: no warning. */
  minMilli: number;
  /** Per kg, litre or piece; null until entered (bills set it from piece 18). */
  costKurus: number | null;
  level: StockLevelDTO;
  /** Products on the menu that use it, by name. */
  usedBy: string[];
  /** Last counted, ISO. */
  countedAt: string | null;
  /** The unit can change only while nothing has used it yet. */
  unitLocked: boolean;
}

export interface StockMoveDTO {
  id: string;
  itemId: string;
  itemName: string;
  unit: StockUnitDTO;
  changeMilli: number;
  afterMilli: number;
  reason: "start" | "count" | "waste" | "sale" | "refund" | "bill";
  why: WasteWhyDTO | null;
  note: string | null;
  /** Who did it, when a person did. */
  by: string | null;
  at: string;
  /** What it was worth at the item's price; waste shows this as its cost. Null without a price. */
  valueKurus: number | null;
}

/** `GET /staff/:slug/stock`: Stok in the café panel. Needs "stock.view". */
export interface StockDTO {
  /** Out first, then low, then by name. */
  items: StockItemDTO[];
  /** "Stoktan kaldırılanlar": kept for history, can be brought back. */
  removed: StockItemDTO[];
  /** Counts, waste and the rest, newest first; sales are in each item's own history. */
  moves: StockMoveDTO[];
  /** Waste over the last 30 days at today's prices. */
  wasteKurus: number;
  /** The viewer can count, record waste and change items ("stock.edit"). */
  canEdit: boolean;
}

/** `GET /staff/:slug/stock/items/:id`: one item and every move it had, newest first. */
export interface StockItemHistoryDTO {
  item: StockItemDTO;
  moves: StockMoveDTO[];
}

export interface RecipeDTO {
  productId: string;
  /** The product, so a chef (recipes, no menu editing) can work from this alone. */
  name: string;
  category: string;
  priceKurus: number;
  imageUrl: string | null;
  mode: StockModeDTO;
  /** Per one of the product. */
  lines: { itemId: string; qtyMilli: number }[];
  /** What one costs from its recipe; null when not tracked or an item has no price (D30). */
  costKurus: number | null;
  /** Items in it with no price yet, by name. */
  unpriced: string[];
}

/** `GET /staff/:slug/menu/recipes`: how each product uses stock, and the items a recipe can use. Needs "menu.recipes". */
export interface RecipesDTO {
  /** Every product on the menu; "none" for one nobody set up yet. */
  recipes: RecipeDTO[];
  items: { id: string; name: string; unit: StockUnitDTO; kind: "ingredient" | "supply"; costKurus: number | null }[];
}

// ─────────────────────────────────────────────── suppliers and bills (plan piece 18)

export type BillCategoryDTO = "ingredients" | "supplies" | "rent" | "utilities" | "services" | "wages" | "other";
/** cash, card (the bank card) and bank settle it; credit, check and loan move it to Borçlar. */
export type BillPayMethodDTO = "cash" | "card" | "bank" | "credit" | "check" | "loan";
/** How a debt is paid back. */
export type MoneyMethodDTO = "cash" | "card" | "bank";
/** Where the café's money is (piece 20): the till's drawer, cash kept aside, the bank. */
export type MoneyAccountDTO = "drawer" | "reserve" | "bank";

/**
 * Where cash for a payment can come from, once the café keeps its money in Peni. Null
 * before that: cash isn't followed yet, so nothing to pick.
 */
export interface CashFromDTO {
  /** The drawer is open, so it can pay. */
  drawerOpen: boolean;
  /** The viewer may take it from the reserve ("cash.manage"). */
  reserve: boolean;
}
/** Overdue: unpaid and past its due date in the café's time zone. */
export type BillStateDTO = "unpaid" | "overdue" | "paid" | "voided";

/** A bill in a list. Money is in kuruş, KDV included. */
export interface BillSummaryDTO {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  number: string | null;
  /** The bill's own date, "2026-10-18". */
  date: string;
  dueDate: string | null;
  totalKurus: number;
  paidKurus: number;
  state: BillStateDTO;
  /** What it was for: the first lines' names. */
  summary: string;
  lineCount: number;
  /** It brought stock. */
  stock: boolean;
}

export interface BillLineDTO {
  /** The stock item it added to; null for a line that isn't stock. */
  itemId: string | null;
  name: string;
  category: BillCategoryDTO;
  qtyMilli: number | null;
  /** The item's unit, for stock lines. */
  unit: StockUnitDTO | null;
  totalKurus: number;
  /** Per kg, litre or piece, for stock lines with an amount. */
  unitKurus: number | null;
}

/** `GET /staff/:slug/bills/:id`: one bill with its lines and payments. */
export interface BillDTO extends BillSummaryDTO {
  lines: BillLineDTO[];
  note: string | null;
  /** Send it back when correcting, so two people don't overwrite each other. */
  version: number;
  createdBy: string | null;
  createdAt: string;
  payments: BillPaymentDTO[];
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  /** The viewer can correct, pay and void it ("bills.manage"). */
  canManage: boolean;
  /** What the viewer can pay the rest with; null when nothing is left or they can't pay. */
  payWith: PayOptionsDTO | null;
  /** The bill's month is closed (piece 20): it can't be corrected, voided or paid on that month any more. */
  closed: boolean;
  /** The KDV printed on it, per rate (piece 25); empty when nobody entered it. */
  kdv: BillKdvDTO[];
  /** The scan it was confirmed from (piece 25). */
  document: DocumentRefDTO | null;
}

export interface BillKdvDTO {
  ratePct: number;
  amountKurus: number;
}

export interface BillPaymentDTO {
  id: string;
  amountKurus: number;
  method: BillPayMethodDTO;
  paidOn: string;
  by: string | null;
  /** The check it wrote, for "check". */
  check: { id: string; number: string; dueDate: string; cashedOn: string | null } | null;
  /** Who is owed, for "loan". */
  lender: string | null;
  /** Why "Geri al" can't undo it: the check was cashed, or the debt paid back. Null when it can. */
  locked: "CHECK_CASHED" | "LOAN_REPAID" | null;
  /** Where the money came from; null for credit, checks and loans, or when it wasn't followed. */
  account: MoneyAccountDTO | null;
  /** The viewer may undo it (bills.manage, plus debts.card or debts.edit for those methods), and its month isn't closed. */
  canRemove: boolean;
}

/** For the pay form. Cash, card and bank are always there. */
export interface PayOptionsDTO {
  leftKurus: number;
  /** The credit card's name; null when the viewer can't use it ("debts.card") or it isn't set up. */
  credit: string | null;
  /** The viewer could use the card but nobody has set it up yet. */
  creditNotSet: boolean;
  /** Checks and loans need "debts.edit". */
  check: boolean;
  loan: boolean;
  /** Who can be the lender: the team, and people named on earlier loans. */
  team: { memberId: string; name: string }[];
  lenderNames: string[];
  cashFrom: CashFromDTO | null;
  /** Payments can't be dated on or before this day: its month is closed. */
  closedThrough: string | null;
}

/** `GET /staff/:slug/bills?month=2026-10` or `?show=owed`: Faturalar. Needs "bills.view". */
export interface BillsDTO {
  /** The month shown ("2026-10"), or null when showing everything still owed. */
  month: string | null;
  /** Newest first. Voided bills show in their month, not under "owed". */
  bills: BillSummaryDTO[];
  /** The month's bills that aren't voided, and how they split by category. */
  monthTotalKurus: number;
  byCategory: { category: BillCategoryDTO; totalKurus: number }[];
  /** Everything owed across all months. */
  owed: { count: number; totalKurus: number; overdueCount: number; overdueKurus: number };
  /** The café's date today. */
  today: string;
  /** For the form: suppliers and stock items that can go on a new bill. */
  suppliers: { id: string; name: string }[];
  items: { id: string; name: string; unit: StockUnitDTO; kind: "ingredient" | "supply"; costKurus: number | null }[];
  canAdd: boolean;
  canManage: boolean;
  /** Can add a supplier from the bill form ("suppliers.edit"). */
  canAddSupplier: boolean;
  /** Can send a photo or PDF for the assistant to read ("bills.add", with the assistant on). */
  canScan: boolean;
  /** Can see Taslaklar, where scans wait to be checked ("assistant.use"). */
  canSeeDrafts: boolean;
}

export interface SupplierSummaryDTO {
  id: string;
  name: string;
  phone: string | null;
  /** Unpaid bills, and the part of it past due. */
  owedKurus: number;
  overdueKurus: number;
  lastBillDate: string | null;
  /** Bills over the last 30 days, not voided. */
  monthKurus: number;
}

/** `GET /staff/:slug/suppliers`: Tedarikçiler. Needs "suppliers.view". */
export interface SuppliersDTO {
  /** Owed most first, then by name. */
  suppliers: SupplierSummaryDTO[];
  removed: SupplierSummaryDTO[];
  owedKurus: number;
  canEdit: boolean;
}

/** How the price of one item changed on this supplier's bills, newest first. */
export interface SupplierPriceDTO {
  itemId: string;
  name: string;
  unit: StockUnitDTO;
  points: { date: string; unitKurus: number; billId: string }[];
}

/** `GET /staff/:slug/suppliers/:id`: one supplier, what you owe them, their bills and prices. */
export interface SupplierDTO {
  supplier: { id: string; name: string; phone: string | null; email: string | null; taxNo: string | null; iban: string | null; note: string | null; removed: boolean };
  owedKurus: number;
  overdueKurus: number;
  /** Newest first, at most 50. */
  bills: BillSummaryDTO[];
  prices: SupplierPriceDTO[];
  canEdit: boolean;
  /** The viewer can open Faturalar. */
  canSeeBills: boolean;
}

// ─────────────────────────────────────────────── till: Satış ekranı (plan piece 6)

/** `GET /staff/:slug/till-menu`: the till's tabs and tiles, only what can be sold now. */
export interface TillMenuDTO {
  categories: {
    id: string;
    name: string;
    products: { productId: string; name: string; priceKurus: number; imageUrl: string | null }[];
  }[];
}

export type OrderStatusDTO = "open" | "paid" | "voided" | "refunded";
/** "peni": from the customer's wallet, with their ödeme kodu (piece 11). */
export type PaymentMethodDTO = "cash" | "card" | "peni" | "askida";

export interface OrderLineDTO {
  productId: string;
  name: string;
  unitPriceKurus: number;
  quantity: number;
  discountPercent: number;
  /** After the line's discount. */
  totalKurus: number;
  /** "Askıya bırak" (plan piece 13): paid for now, left on the askı for someone else. */
  hang: boolean;
}

export interface OrderDTO {
  id: string;
  /** Per café, from 1 each local day. */
  number: number;
  businessDay: string;
  status: OrderStatusDTO;
  lines: OrderLineDTO[];
  /** Whole-order discount, after line discounts. */
  discountPercent: number;
  subtotalKurus: number;
  discountKurus: number;
  totalKurus: number;
  itemCount: number;
  createdAt: string;
  takenBy: string;
  paidAt: string | null;
  paymentMethod: PaymentMethodDTO | null;
  tenderedKurus: number | null;
  changeKurus: number | null;
  voided: { at: string; by: string; reason: string } | null;
  refunded: { at: string; by: string; reason: string; amountKurus: number } | null;
  /** What's left to pay on an open order, after any peni on it; 0 otherwise. */
  dueKurus: number;
  /** Peni on the order, and whose wallet they came from ("Ayşe Y."). */
  peni: { peni: number; name: string } | null;
  /** What the askı paid for on the order (plan piece 13): "1 Çay", in kuruş. */
  askida: { kurus: number; items: { productId: string; name: string; quantity: number }[] } | null;
  /** What the viewer may do with it now. */
  canVoid: boolean;
  canRefund: boolean;
  canDelete: boolean;
  /** Every payment and refund tried on it, oldest first, declined and cancelled ones included. */
  payments: PaymentDTO[];
  /**
   * Only in the answers about a payment: the peni the customer can take, for the customer
   * screen. Null when the café has peni off or the order earns nothing.
   */
  claim: OrderClaimDTO | null;
}

export type PaymentKindDTO = "sale" | "refund";
export type PaymentStatusDTO = "pending" | "approved" | "declined" | "cancelled";

export interface PaymentDTO {
  id: string;
  kind: PaymentKindDTO;
  method: PaymentMethodDTO;
  status: PaymentStatusDTO;
  amountKurus: number;
  tenderedKurus: number | null;
  changeKurus: number | null;
  /** "manual" until the till bridge drives the Ingenico. */
  terminal: string;
  /**
   * While pending, who says it's done: the barista taps "approved" ("staff"), or the
   * till waits for the terminal's own answer ("terminal"). Null once settled.
   */
  confirmBy: "staff" | "terminal" | null;
  startedAt: string;
  startedBy: string;
  settledAt: string | null;
  /** Null when the terminal answered on its own. */
  settledBy: string | null;
  /** The terminal's approval code and fiscal receipt number, when it sends them. */
  reference: string | null;
  receiptNo: string | null;
  /** The terminal's reason for a decline; "TERMINAL_UNREACHABLE" when it couldn't be reached. */
  failure: string | null;
  /** A refund's reason. */
  reason: string | null;
}

/** The answer to starting, confirming, cancelling or checking a payment. */
export interface PaymentAnswerDTO {
  payment: PaymentDTO;
  /** Paid once a sale is approved, with `claim` for the customer screen. */
  order: OrderDTO;
}

export interface OrderClaimDTO {
  /** Four digits to type in the app. */
  code: string;
  /** What the QR carries, as `<origin>/p/<token>`. */
  token: string;
  peni: number;
  expiresAt: string;
}

/** A drawer count at opening or closing. */
export interface CashCountDTO {
  at: string;
  by: string;
  /** What should have been there; null the first time a café opens its drawer. */
  expectedKurus: number | null;
  countKurus: number;
  /** Counted minus expected: negative is missing money. */
  differenceKurus: number;
  /** Notes and coins by value in kuruş, when counted that way. */
  counts: Record<string, number> | null;
  note: string | null;
}

export interface CashMoveDTO {
  id: string;
  kind: "in" | "out";
  amountKurus: number;
  reason: string;
  at: string;
  by: string;
}

export interface CashSessionDTO {
  id: string;
  opening: CashCountDTO;
  closing: CashCountDTO | null;
  totals: {
    cashSalesKurus: number;
    cashRefundsKurus: number;
    inKurus: number;
    outKurus: number;
    /** To check against the card terminal's own end-of-day total. */
    cardSalesKurus: number;
    cardRefundsKurus: number;
    /** What the drawer should hold now, or held at closing. */
    expectedKurus: number;
  };
  moves: CashMoveDTO[];
}

/** `GET /staff/:slug/cash`: the open drawer, or the last one closed. */
export interface CashStateDTO {
  open: CashSessionDTO | null;
  last: CashSessionDTO | null;
  /** Notes and coins to count with, in kuruş, largest first. */
  denominations: number[];
}

/** `GET /staff/:slug/orders`: one day's orders, newest first, and the day's sums. */
export interface OrderListDTO {
  businessDay: string;
  orders: OrderDTO[];
  summary: {
    paidCount: number;
    /** Paid and not refunded. */
    salesKurus: number;
    cashKurus: number;
    cardKurus: number;
    /** Paid with peni: what the café gave in goods. */
    peniKurus: number;
    /** Paid by the askı. */
    askidaKurus: number;
    refundedCount: number;
    refundedKurus: number;
    voidedCount: number;
    openCount: number;
  };
}

export interface AskidaDTO {
  enabled: boolean;
  balancePeni: number;
  itemsAvailable: number;
  referenceItemName: string | null;
  claimedLast7Days: number;
  donatedLast7DaysPeni: number;
  claimsPerDay: number;
  wall: AskidaWallEventDTO[];
  /** What the take sheet should say for the viewer. Signed out (and the staff dashboard) read not_member. [G3] */
  myEligibility: AskidaEligibilityDTO;
  /** "Kafe her bağışa %50 ekliyor." Null when no match would be added (none, or this month's cap is used). [G12] */
  matchPercent: number | null;
}

export type AskidaEligibilityStatus = "ok" | "claimed_today" | "too_new" | "blocked" | "not_member";

export interface AskidaEligibilityDTO {
  status: AskidaEligibilityStatus;
  /** Only with `too_new`: whole days, rounded up ("3 gün kaldı"). */
  daysLeft?: number;
}

export type AskidaWallEventDTO =
  | { type: "donation"; at: string; peni: number; donorName: string | null }
  | { type: "till_donation"; at: string; peni: number }
  | { type: "cafe_match"; at: string; peni: number }
  | { type: "claim"; at: string; itemName: string };

export interface CafeSummaryDTO {
  id: string;
  slug: string;
  name: string;
  district: string | null;
  city: string | null;
  coverImageUrl: string | null;
  askidaItemsAvailable: number;
  isMember: boolean;
  /** The viewer's balance here; null when not a member or signed out. [G1] */
  balancePeni: number | null;
  earnRatePercent: number;
  /** Up to two items, cheapest first, for "3 çay". [G1] */
  refItems: RefItemDTO[];
  /** The next upcoming Peni masası. [G2] */
  nextEvent: { postId: string; startsAt: string; title: string } | null;
  /** [G9] The café's colourway; null until it picks one (the UI then derives it from the slug). */
  hue: CafeHue | null;
}

export interface MembershipDTO {
  id: string;
  balancePeni: number;
  joinedAt: string;
  /** Peni kodu for the till, e.g. "M7K-42Q". Encode exactly this string in the QR code. [G7b] */
  memberCode: string;
  /** Paused in the community by the café (plan piece 15): reads, but can't write. */
  paused: boolean;
}

/** One chair at the long table. Initials only when that member's profile is visible. [G4] */
export interface AttendeeDTO {
  initials: string | null;
  me: boolean;
}

export interface PostDTO {
  id: string;
  kind: "post" | "question" | "event";
  body: string;
  publishedAt: string;
  pinned: boolean;
  eventStartsAt: string | null;
  eventCapacity: number | null;
  reactionCount: number;
  commentCount: number;
  rsvpCount: number;
  reactedByMe: boolean;
  rsvpedByMe: boolean;
  /** Photos, in order (plan piece 14). */
  imageUrls: string[];
  /** "Bir üye" for hidden profiles, otherwise "Ayşe Y.". `mine` when the viewer wrote it and can delete it. */
  comments: { id: string; authorName: string; body: string; createdAt: string; mine: boolean; reportedByMe: boolean }[];
  /** Event topic. Null for posts and questions. [G4] */
  title: string | null;
  /** RSVPs in arrival order. Declines are never listed. [G4] */
  attendees: AttendeeDTO[];
  /** Questions only: the viewer already answered today ("Bugünkü cevabın masada."). [G13] */
  answeredTodayByMe: boolean;
  /** The member who opened this event (D4); null when the café posted it. `mine` can edit and cancel it. */
  host: { name: string; mine: boolean } | null;
  /** Members can report a member's event, once. */
  reportedByMe: boolean;
}

/** `GET /staff/:slug/feed`: the café's own feed, as its Topluluk page shows it (plan piece 14). */
export interface StaffFeedDTO {
  /** "posts.write": post, edit, pin and take down. */
  canWrite: boolean;
  /** "posts.moderate": hide comments, take down members' events, handle reports and pause members. */
  canModerate: boolean;
  posts: StaffPostDTO[];
  /** Open reports, one per reported thing, oldest first. Empty without "posts.moderate". */
  reports: StaffReportDTO[];
  /** Members paused in the community. Empty without "posts.moderate". */
  paused: { customerId: string; name: string; pausedAt: string }[];
}

/** Everything members reported about one comment or event (plan piece 15). */
export interface StaffReportDTO {
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  /** The event's topic, or the post a comment is under. */
  postTitle: string;
  /** What was written: the event's words, or the comment. */
  body: string;
  authorName: string;
  authorCustomerId: string;
  authorPaused: boolean;
  /** Hidden until someone looks, because enough members reported it. */
  hidden: boolean;
  reasons: { reason: "spam" | "rude" | "unsafe" | "other"; count: number }[];
  notes: string[];
  firstReportedAt: string;
}

export interface StaffPostDTO {
  id: string;
  kind: "post" | "question" | "event";
  title: string | null;
  body: string;
  imageUrls: string[];
  pinned: boolean;
  publishedAt: string;
  eventStartsAt: string | null;
  eventCapacity: number | null;
  /** The staff member who posted it; null for older posts and members' events. */
  authorName: string | null;
  /** The member who opened this event; the café can take it down or pin it, not edit it. */
  hostName: string | null;
  reactionCount: number;
  rsvpCount: number;
  /** Every comment, hidden ones too, oldest first. Names as customers see them. */
  comments: { id: string; authorName: string; body: string; createdAt: string; hidden: boolean }[];
  /** Open reports on the post itself. */
  openReports: number;
}

export interface CafeDetailDTO extends CafeSummaryDTO {
  address: string | null;
  earnRatePercent: number;
  maxRedeemSharePercent: number;
  menu: MenuItemDTO[];
  askida: AskidaDTO;
  posts: PostDTO[];
  membership: MembershipDTO | null;
}

export interface GiftDTO {
  id: string;
  cafeSlug: string;
  cafeName: string;
  peni: number;
  message: string | null;
  status: "pending" | "accepted" | "declined" | "expired";
  fromName: string;
  toName: string;
  direction: "in" | "out";
  createdAt: string;
  expiresAt: string;
  /** The viewer sent it and it is still pending: show "Geri al". [G17] */
  canCancel: boolean;
  /** The sender took it back (status is "declined"). Recipients never see such gifts in their wallet. [G17] */
  cancelledBySender: boolean;
  /** When the recipient said thanks. [G15] */
  thankedAt: string | null;
}

/** `POST /staff/:slug/orders/:id/peni/check`: whose wallet an ödeme kodu opens. */
export interface PeniCheckDTO {
  /** "Ayşe Y.", for the barista to check against the customer. */
  name: string;
  balancePeni: number;
  /** The most that can go on this order now: within the balance and the café's rules. */
  maxPeni: number;
}

/** `GET /staff/:slug/askida`: the askı as the till sees it (plan piece 13). */
export interface TillAskidaDTO {
  enabled: boolean;
  balancePeni: number;
  /** The café's askı items, cheapest first, with how many the pool pays for now. */
  items: { productId: string; name: string; priceKurus: number; peni: number; available: number }[];
}

/** `POST /me/spend-code`: the ödeme kodu to show at the till, for one café. */
export interface SpendCodeDTO {
  cafeSlug: string;
  cafeName: string;
  hue: CafeHue | null;
  code: string;
  expiresAt: string;
  balancePeni: number;
}

/**
 * A paid order's peni, as its QR link or typed code shows it (plan piece 10).
 * "taken": someone else took it. "yours": the viewer did.
 */
export type ClaimStateDTO = "open" | "yours" | "taken" | "expired" | "cancelled";

/** `GET /claims/:token` (public) and `POST /claims`. */
export interface ClaimDTO {
  cafeSlug: string;
  cafeName: string;
  hue: CafeHue | null;
  peni: number;
  /** "1 çay": the peni read as goods, or null below one item. */
  goods: string | null;
  state: ClaimStateDTO;
  /** The end of the café's day. */
  expiresAt: string;
  /** Once it's the viewer's: their balance at the café. */
  balancePeni: number | null;
  /** Signed in and wasn't a member of the café before taking it. */
  joined: boolean;
}

/** `GET /gifts/:id/preview`, public: what a shared link may show. [G11] */
export interface GiftPreviewDTO {
  id: string;
  cafeSlug: string;
  cafeName: string;
  fromFirstName: string;
  peni: number;
  /** "1 çay": the peni read as goods, or null below one item. */
  goods: string | null;
  refItems: RefItemDTO[];
  status: GiftDTO["status"];
  expiresAt: string;
  /** Who is looking, for the CTA: guest = signed in but not a member of the café. */
  viewer: "signed_out" | "recipient" | "sender" | "member" | "guest";
  hue: CafeHue | null;
  /** The whole gift, message included, only for its sender and its recipient. */
  gift: GiftDTO | null;
}

/** `POST /cafes/:slug/members/lookup`: only "Mehmet K.", only for members of that café. [G6] */
export interface MemberLookupDTO {
  firstName: string;
  lastInitial: string | null;
}

/** `GET /cafes/:slug/members`: someone to treat, picked by name. Only members who show their profile. [D28] */
export interface CafeMemberDTO {
  /** Send it back as `toMemberId`. */
  memberId: string;
  firstName: string;
  lastInitial: string | null;
  initials: string;
  avatarUrl: string | null;
}

export interface CafeMembersDTO {
  /** By name, at most 50. */
  members: CafeMemberDTO[];
}

/** Someone this customer treated before, at one café. Newest first. [G6] */
export interface RecentRecipientDTO {
  cafeSlug: string;
  /** To send again as `toMemberId`. */
  memberId: string;
  /** Only when the recipient has one; people who sign in by email may not. */
  phone: string | null;
  firstName: string;
  lastInitial: string | null;
  initials: string;
  lastGiftAt: string;
}

export type LedgerEntryKind =
  | "earn"
  | "redeem"
  | "gift_out"
  | "gift_in"
  | "gift_return"
  | "askida_donate"
  | "refund";

/**
 * One line of "HAREKETLER". Askı claims never appear, for anyone. [G16]
 * `peni` is signed: positive into the wallet, negative out (a refund that takes
 * earned peni back is a negative refund).
 */
export interface LedgerEntryDTO {
  id: string;
  at: string;
  cafeSlug: string;
  cafeName: string;
  kind: LedgerEntryKind;
  peni: number;
  /** The till order this line belongs to, for earn, redeem and refund lines. */
  orderId: string | null;
  giftId: string | null;
  /** The other person of a gift line (display name, as in GiftDTO). */
  counterpartName: string | null;
}

export interface WalletCafeDTO {
  cafeSlug: string;
  cafeName: string;
  membershipId: string;
  balancePeni: number;
  district: string | null;
  /** [G1] */
  refItems: RefItemDTO[];
  /** [G7b] */
  memberCode: string;
  /** [G9] */
  hue: CafeHue | null;
}

export interface WalletDTO {
  totalPeni: number;
  cafes: WalletCafeDTO[];
  gifts: GiftDTO[];
  /**
   * [G6] The server always sends this and `ledger`; they are optional in the type
   * only so older code that builds an empty WalletDTO literal still compiles.
   */
  recentRecipients?: RecentRecipientDTO[];
  /** All memberships, newest first (at most 100 per café). Askı claims never appear. [G16] */
  ledger?: LedgerEntryDTO[];
}

/** What `GET /me/wallet` actually returns: both history arrays are always there. */
export type FullWalletDTO = WalletDTO & { recentRecipients: RecentRecipientDTO[]; ledger: LedgerEntryDTO[] };

export interface StaffReportFieldsDTO {
  sinceIso: string;
  issuedPeni: number;
  redeemedPeni: number;
  askidaDonatedByMembersPeni: number;
  askidaTillDonationsPeni: number;
  askidaMatchedByCafePeni: number;
  askidaClaimedPeni: number;
  askidaClaims: number;
  outstandingPeni: number;
}

export interface StaffDashboardDTO {
  cafe: {
    id: string;
    slug: string;
    name: string;
  };
  askida: AskidaDTO;
  report: StaffReportFieldsDTO & {
    /**
     * The 30 days before, for "±%". `outstandingPeni` is what was owed at its end;
     * `memberCount` is how many members the café had then. [G21]
     */
    previous: StaffReportFieldsDTO & { untilIso: string; memberCount: number };
  };
  memberCount: number;
  /** Items out or running low, worst first; null when the viewer can't see stock. */
  lowStock: Pick<StockItemDTO, "id" | "name" | "unit" | "qtyMilli" | "minMilli" | "level">[] | null;
  /** Bills still owed, for Bugün; null without "bills.view". */
  billsOwed: BillsDTO["owed"] | null;
  /** Everything owed (bills, checks, loans, the card), for Bugün; null without "debts.view". */
  debts: DebtsDTO["totals"] | null;
}

// ─────────────────────────────────────────────── debts (plan piece 19)

export type DebtKindDTO = "bill" | "check" | "loan" | "card" | "wages";

/** One line of "what we owe": an open bill, a check not cashed yet, a lender, or the card. */
export interface DebtRowDTO {
  kind: DebtKindDTO;
  /** The bill's or check's id, the lender's key, "card", or the staff member's id for wages. */
  id: string;
  /** Supplier, payee, lender or card name. */
  name: string;
  /** What it is: the bill's lines, the check's number, how many loans, the statement. */
  detail: string | null;
  amountKurus: number;
  /** When it has to be paid: due date, check date, the card's statement due day. */
  dueDate: string | null;
  overdue: boolean;
}

export type CheckStateDTO = "open" | "due" | "cashed";

export interface CheckDTO {
  id: string;
  number: string;
  bankName: string | null;
  /** Who it was written to (the supplier's name when none was typed). */
  payee: string;
  amountKurus: number;
  writtenOn: string;
  dueDate: string;
  note: string | null;
  /** The bill it paid, when it paid one. */
  billId: string | null;
  cashedOn: string | null;
  cashedBy: string | null;
  /** due: its date has come and the bank hasn't paid it out yet (or nobody said so). */
  state: CheckStateDTO;
  /** Written on its own and not cashed: "Sil" can take it away. A bill's check goes with the bill's payment. */
  removable: boolean;
}

export interface LenderDTO {
  /** Send this back when paying them. */
  key: string;
  name: string;
  /** Set when the lender is on the team. */
  memberId: string | null;
  owedKurus: number;
  borrowedKurus: number;
  repaidKurus: number;
  /** The earliest due date among loans not paid back yet. */
  dueDate: string | null;
  /** Oldest first: the order repayments pay them off in. */
  loans: {
    id: string;
    amountKurus: number;
    leftKurus: number;
    borrowedOn: string;
    dueDate: string | null;
    note: string | null;
    /** The bill it paid and what that was. */
    billId: string | null;
    billName: string | null;
    /** Given on its own, and taking it away leaves no repayment without a loan. */
    removable: boolean;
  }[];
  /** Newest first. */
  repayments: { id: string; amountKurus: number; method: MoneyMethodDTO; paidOn: string; by: string | null; account: MoneyAccountDTO | null }[];
}

export interface CardDTO {
  name: string;
  limitKurus: number;
  statementDay: number;
  dueDay: number;
  /** Charged and not yet paid. */
  balanceKurus: number;
  /** Limit minus balance; below zero when over the limit. */
  remainingKurus: number;
  /** The last statement and its due day. */
  lastClose: string;
  dueDate: string;
  /** What the last statement asks for, less what was paid since. */
  statementKurus: number;
  /** The part of a statement whose due day has passed. */
  overdueKurus: number;
  nextClose: string;
  /** Bills paid with it, newest first (the last 30). */
  charges: { paymentId: string; billId: string; name: string; amountKurus: number; paidOn: string }[];
  /** Newest first. */
  payments: { id: string; amountKurus: number; method: "cash" | "bank"; paidOn: string; by: string | null; account: MoneyAccountDTO | null }[];
}

/** `GET /staff/:slug/debts`: Borçlar. Needs "debts.view"; the card needs "debts.card". */
export interface DebtsDTO {
  today: string;
  /** Overdue first, then by due date; those with no date last. */
  rows: DebtRowDTO[];
  totals: { totalKurus: number; overdueKurus: number; /** Due in the next 7 days. */ weekKurus: number };
  /** Open checks by date, then the last 60 days' cashed ones. */
  checks: CheckDTO[];
  /** Owed most first, then those paid back. */
  lenders: LenderDTO[];
  /** Null when the viewer can't see it or it isn't set up (see cardNotSet). */
  card: CardDTO | null;
  cardNotSet: boolean;
  /** For the forms. */
  team: { memberId: string; name: string }[];
  suppliers: { id: string; name: string }[];
  /** Checks and loans ("debts.edit"), the card ("debts.card"), paying bills ("bills.manage"). */
  canEdit: boolean;
  canCard: boolean;
  canPayBills: boolean;
  cashFrom: CashFromDTO | null;
  /** Nothing dated on or before this day can change: its month is closed. */
  closedThrough: string | null;
}

// ─────────────────────────────────────────────── money and month close (plan piece 20)

/**
 * One line on Nakit ve banka. The reserve's and the bank's lines are their movements; the
 * bank also gets each day's card sales, and the drawer each day's cash sales, the cash put
 * in or taken out at Kasa, and count differences.
 */
export type MoneyLineKindDTO =
  | "opening"
  | "transfer"
  | "deposit"
  | "withdraw"
  | "correction"
  | "bill"
  | "check"
  | "repayment"
  | "card"
  /** Pay to a staff member (Puantaj ve maaş); the label is their name. */
  | "wages"
  | "sales"
  /** Cash put in or taken out at Kasa, with its reason as the label. */
  | "drawer"
  /** A count that didn't match, with why as the label. */
  | "difference";

export interface MoneyLineDTO {
  id: string;
  day: string;
  at: string;
  account: MoneyAccountDTO;
  kind: MoneyLineKindDTO;
  /** In is positive, out negative. */
  amountKurus: number;
  /** The other account of a transfer. */
  counterpart: MoneyAccountDTO | null;
  /** Who or what: the supplier, the check's number, the lender, the card, the reason. */
  label: string | null;
  note: string | null;
  by: string | null;
  /** Put back because the payment was undone after its drawer day was closed. */
  reversal: boolean;
  /** The bill a payment was for. */
  billId: string | null;
  /** "Geri al": made here, in an open month, and its drawer day (if any) still open. Send `undoId`. */
  undoId: string | null;
}

/** `GET /staff/:slug/money`: Nakit ve banka. Needs "cash.manage". */
export interface MoneyDTO {
  today: string;
  /** Null until the café starts with what the reserve and the bank hold. */
  started: { on: string; by: string | null } | null;
  drawer: {
    /** The open drawer's expected cash, or the last closing count; null before the first count. */
    balanceKurus: number | null;
    open: boolean;
    sessionId: string | null;
  };
  reserveKurus: number | null;
  bankKurus: number | null;
  totalKurus: number | null;
  /** The last 60 days since the start, newest first. */
  lines: MoneyLineDTO[];
  closedThrough: string | null;
  canManage: boolean;
  /** "cash.periods": closing and reopening months (the owner). */
  canClose: boolean;
}

export interface MonthSummaryDTO {
  month: string;
  from: string;
  to: string;
  sales: { cashKurus: number; cardKurus: number; totalKurus: number };
  bills: { count: number; totalKurus: number; paidKurus: Record<string, number> };
  /** Pay earned for hours in the month, and paid out in it. */
  wages: { earnedKurus: number; paidKurus: number };
  money: { drawerKurus: number | null; reserveKurus: number | null; bankKurus: number | null };
  owed: { billsKurus: number; checksKurus: number; loansKurus: number; cardKurus: number; wagesKurus: number; totalKurus: number };
}

export interface MonthCloseDTO {
  id: string;
  month: string;
  closedAt: string;
  by: string | null;
  note: string | null;
  summary: MonthSummaryDTO;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  /** The latest close still standing, and the viewer may reopen it. */
  canReopen: boolean;
}

/** `GET /staff/:slug/money/months`: Ay kapanışı. Needs "cash.manage"; closing needs "cash.periods". */
export interface MonthsDTO {
  today: string;
  closedThrough: string | null;
  /** The month that can be closed now, with its numbers so far; null when the next one isn't over yet. */
  next: { month: string; summary: MonthSummaryDTO } | null;
  /** Newest first, reopened ones too. */
  closes: MonthCloseDTO[];
  canClose: boolean;
}

// ─────────────────────────────────────────────── staff (plan piece 2)

export interface TextDTO {
  tr: string;
  en: string;
}

export interface StaffAccountDTO {
  id: string;
  name: string;
  email: string;
}

/** A café the staff member works at, and what their role lets them do there. */
export interface StaffCafeAccessDTO {
  slug: string;
  name: string;
  role: StaffRole;
  /** Permission keys from @peni/core's PERMISSIONS, e.g. "till.use". */
  permissions: string[];
}

/** `GET /staff-session` */
export interface StaffMeDTO {
  account: StaffAccountDTO;
  /** "pin" at the till: one café, only the till's own work. */
  signedInWith: "password" | "pin";
  cafes: StaffCafeAccessDTO[];
}

/** `POST /staff/auth/sign-in`. The web app uses the httpOnly cookie; the app keeps `token`. */
export interface StaffSessionDTO extends StaffMeDTO {
  token: string;
}

export interface TeamMemberDTO {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  sinceIso: string;
  isYou: boolean;
  /** False until a password is set. */
  canSignIn: boolean;
  /** Has set a PIN for the till. */
  hasPin: boolean;
}

/** `GET /staff/:slug/team` */
export interface TeamDTO {
  members: TeamMemberDTO[];
}

export interface TillDeviceDTO {
  id: string;
  name: string;
  createdIso: string;
  lastSeenIso: string | null;
}

/** `GET /till`: the till's sign-in screen, for a computer set up as a till. */
export interface TillDTO {
  cafe: { slug: string; name: string };
  device: TillDeviceDTO;
  /** Everyone whose role takes orders. Tap a name, then type the PIN. */
  staff: { memberId: string; name: string; role: StaffRole; hasPin: boolean; lockedUntilIso: string | null }[];
}

export interface RolePermissionDTO {
  key: string;
  label: TextDTO;
  hint: TextDTO;
  /** Same for every café: money, reports, the assistant and the team. */
  locked: boolean;
  roles: Record<StaffRole, boolean>;
}

/** `GET /staff/:slug/roles`: what each role may do, grouped like the café panel. */
export interface RolesDTO {
  roles: { role: StaffRole; label: TextDTO }[];
  sections: { section: string; label: TextDTO; permissions: RolePermissionDTO[] }[];
  /** Whether the viewer may change it. */
  canEdit: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// ─────────────────────────────────────────────── Vardiyalar (piece 21)

export interface ShiftPersonDTO {
  memberId: string;
  name: string;
  role: StaffRole;
}

export interface ShiftDTO {
  id: string;
  day: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  people: ShiftPersonDTO[];
  note: string | null;
  /** The viewer is on it. */
  mine: boolean;
}

export interface ShiftWeekDTO {
  /** The Monday. */
  weekStart: string;
  /** Monday to Sunday. */
  days: string[];
  today: string;
  published: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  /** False for someone who doesn't plan, while the week is a draft: then `shifts` is empty. */
  visible: boolean;
  shifts: ShiftDTO[];
  /** Planned minutes per person this week, most first. */
  totals: (ShiftPersonDTO & { minutes: number })[];
  /** Who can be put on a shift; empty for those who can't plan. */
  team: ShiftPersonDTO[];
  /** The viewer's own staff member id. */
  me: string;
  canEdit: boolean;
  /** This week has no shifts and the one before has: "Geçen haftayı kopyala". */
  canCopy: boolean;
  /** Days on or before this are in a closed month. */
  closedThrough: string | null;
}

// ─────────────────────────────────────────────── Puantaj ve maaş (piece 21)

export type PayMethodDTO = "cash" | "bank";

export interface PayoutDTO {
  id: string;
  amountKurus: number;
  method: PayMethodDTO;
  account: MoneyAccountDTO | null;
  paidOn: string;
  note: string | null;
  by: string | null;
  /** Not in a closed month, and the viewer may record pay. */
  canRemove: boolean;
}

export interface PayRateDTO {
  id: string;
  fromDay: string;
  kurusPerHour: number;
  /** Starts after the last closed pay month, and the viewer may change hours. */
  canRemove: boolean;
}

export interface PayPersonDTO {
  memberId: string;
  name: string;
  role: StaffRole;
  /** Off the team now; shown for the month they worked or were paid in. */
  removed: boolean;
  /** Minutes worked each day of the month, null when not entered yet. */
  worked: (number | null)[];
  /** Minutes planned each day of the month. */
  planned: number[];
  minutes: number;
  plannedMinutes: number;
  /** Days up to today with a shift planned but no hours entered. */
  missingDays: number;
  /** The rate on the month's last day (or today, in the current month); null when none is set. */
  rateKurus: number | null;
  /** Every rate, oldest first: only for those who see pay, and for the person's own. */
  rates: PayRateDTO[];
  earnedKurus: number;
  paidKurus: number;
  leftKurus: number;
  payouts: PayoutDTO[];
}

export interface PaySummaryDTO {
  month: string;
  minutes: number;
  earnedKurus: number;
  paidKurus: number;
  people: { memberId: string; name: string; role: StaffRole; minutes: number; earnedKurus: number; paidKurus: number }[];
}

export interface PayCloseDTO {
  id: string;
  month: string;
  closedAt: string;
  by: string | null;
  note: string | null;
  summary: PaySummaryDTO;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  canReopen: boolean;
}

/** Why the month can't be closed now. */
export type PayCloseBlockDTO = "NOT_OVER" | "EARLIER_OPEN" | "MISSING_DAYS" | "ALREADY_CLOSED" | "NO_PERMISSION";

export interface PayMonthDTO {
  month: string;
  /** Every day of the month. */
  days: string[];
  today: string;
  /** The months that can be looked at, newest first. */
  months: string[];
  /** Only the viewer's own row: they don't see others' pay. */
  own: boolean;
  people: PayPersonDTO[];
  totals: { minutes: number; earnedKurus: number; paidKurus: number; leftKurus: number; missingDays: number };
  /** The close standing for this month, if any. */
  close: PayCloseDTO | null;
  /** Earlier closes of this month that were reopened, newest first. */
  history: PayCloseDTO[];
  canClose: boolean;
  closeBlock: PayCloseBlockDTO | null;
  canEditHours: boolean;
  canPay: boolean;
  /** The last day whose hours are kept by a closed pay month. */
  payClosedThrough: string | null;
  /** The last day of a closed month in Ay kapanışı: nothing dated then can change. */
  closedThrough: string | null;
  cashFrom: CashFromDTO | null;
}

// ─────────────────────────────────────────────── tasks and alerts (plan piece 22)

/** Who a list is for: everyone, a role, or whoever has the day's first or last shift. */
export type TaskAssignDTO = "all" | "first" | "last" | StaffRole;
/** Monday 1 … Sunday 7. */
export type WeekdayDTO = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TaskItemDTO {
  id: string;
  title: string;
  note: string | null;
  /** Not done yet, done, or skipped (with why, if given). */
  status: "open" | "done" | "skipped";
  checkNote: string | null;
  by: string | null;
  at: string | null;
}

export interface TaskDayListDTO {
  id: string;
  name: string;
  assign: TaskAssignDTO;
  /** The viewer is the one it's for that day. */
  mine: boolean;
  /** First names of who it's for, when that comes from the day's shifts. */
  people: string[];
  items: TaskItemDTO[];
  done: number;
  total: number;
}

/** `GET /staff/:slug/tasks?day=`: one day's lists, the viewer's first. */
export interface TaskDayDTO {
  day: string;
  today: string;
  lists: TaskDayListDTO[];
  /** Ticking on this day is allowed (today; earlier days with "tasks.edit"). */
  canCheck: boolean;
  /** "tasks.edit": earlier days, the week's history and changing the lists. */
  canEdit: boolean;
  /** The last 7 days before today, oldest first; only with "tasks.edit". */
  week: { day: string; done: number; total: number }[];
}

export interface TaskListItemDTO {
  id: string;
  title: string;
  note: string | null;
  days: WeekdayDTO[];
}

export interface TaskListDTO {
  id: string;
  name: string;
  assign: TaskAssignDTO;
  items: TaskListItemDTO[];
}

/** `GET /staff/:slug/tasks/lists`: the lists as they are set up ("tasks.edit"). */
export interface TaskListsDTO {
  lists: TaskListDTO[];
}

export type AlertTypeDTO =
  | "stockOut"
  | "stockLow"
  | "stockNoCost"
  | "debtsOverdue"
  | "debtsSoon"
  | "cardDue"
  | "hoursMissing"
  | "payClose"
  | "payLeft"
  | "tasksLate"
  | "draftsOpen";

/** Something that needs doing, worked out from the café's own numbers. One per kind. */
export interface AlertDTO {
  type: AlertTypeDTO;
  level: "warning" | "critical";
  count: number;
  amountKurus: number | null;
  /** What it's about, most pressing first; at most 5. */
  names: string[];
  /** A day it hinges on (the card's due day). */
  day: string | null;
  /** The month, for pay. */
  month: string | null;
  /** Where to fix it, a panel path. */
  href: string;
}

/** `GET /staff/:slug/today`: Bugün. What needs doing, and today's tasks. */
export interface TodayDTO {
  cafe: { slug: string; name: string };
  today: string;
  me: { name: string };
  alerts: AlertDTO[];
  /** Today's lists in short; null without "tasks.view". */
  tasks: { done: number; total: number; lists: { id: string; name: string; mine: boolean; done: number; total: number }[] } | null;
  /** The morning email: whether it can go to the viewer (they see alerts) and whether it's on. */
  email: { eligible: boolean; on: boolean };
  /** Today's sales by hour against the same weekday last week, up to this hour; null without "reports.view". */
  sales: TodaySalesDTO | null;
}

export interface TodaySalesDTO {
  salesKurus: number;
  orders: number;
  /** Last week's same weekday, up to the same time. */
  lastWeekKurus: number;
  lastWeekDay: string;
  /** Opening hours only: the first and last hour anything sold either day. */
  hours: { hour: string; salesKurus: number; lastWeekKurus: number }[];
}

// ─────────────────────────────────────────────── Raporlar (plan piece 23)

export type ReportStepDTO = "hour" | "day" | "week" | "month";
export type ExpenseKindDTO = "ingredients" | "supplies" | "rent" | "utilities" | "services" | "wages" | "other";

/** A period's headline numbers. Money is what came in by cash and card, refunds taken out. */
export interface ReportTotalsDTO {
  salesKurus: number;
  /** Paid orders on those days, refunded ones left out. */
  orders: number;
  /** Order totals (peni and askı included) over orders; null with none. */
  avgOrderKurus: number | null;
  /** Bills dated in the period and pay earned for hours worked in it. */
  expensesKurus: number;
  profitKurus: number;
}

/** One product's line in the ranking. Cost comes from its recipe at the latest bill prices (D30). */
export interface ReportProductDTO {
  productId: string;
  name: string;
  quantity: number;
  /** What it sold for, discounts taken off; peni and askı included. */
  salesKurus: number;
  /** Per piece; null when it isn't tracked or an ingredient has no price yet. */
  unitCostKurus: number | null;
  profitKurus: number | null;
  /** Profit over sales, whole percent. */
  marginPercent: number | null;
}

/** `GET /staff/:slug/reports?from&through`: Raporlar. Needs "reports.view". */
export interface SalesReportDTO {
  cafe: { slug: string; name: string };
  today: string;
  from: string;
  through: string;
  /** When the period runs to today, the period before is counted up to the same time of day, "HH:MM"; else null. */
  previous: { from: string; through: string; untilTime: string | null };
  totals: ReportTotalsDTO;
  previousTotals: ReportTotalsDTO;
  /** How the period's orders were paid, net of refunds. Peni and askı aren't money in. */
  paidWith: { cashKurus: number; cardKurus: number; peniKurus: number; askidaKurus: number };
  /** Money in over the period, bucket by bucket, with the previous period's bucket at the same place. */
  series: { step: ReportStepDTO; points: { key: string; salesKurus: number; previousKurus: number | null }[] };
  /** Paid orders by hour of the day, "07" to "22"; only hours with any. */
  hours: { hour: string; orders: number }[];
  /** Average money in per weekday (1 = Monday), whole days only; empty for periods under a week. */
  weekdays: { weekday: number; avgKurus: number }[];
  expenses: { kind: ExpenseKindDTO; kurus: number }[];
  /** Best profit first; products without a cost after the rest, by sales. */
  products: ReportProductDTO[];
  /** Products sold without a known cost. */
  unpriced: number;
  /** Month by month, up to this month, from the first month with numbers; at most 12. */
  months: { month: string; salesKurus: number; expensesKurus: number; profitKurus: number }[];
}

// ─────────────────────────────────────────────── the assistant (plan piece 24)

/** A bill as the assistant proposes it; anything it couldn't read is null. */
export interface BillProposalDTO {
  /** A supplier the café already has, when the name matched. */
  supplierId: string | null;
  /** The seller as printed; offered as a new supplier when nothing matched. */
  supplierName: string | null;
  supplierTaxNumber: string | null;
  number: string | null;
  date: string | null;
  dueDate: string | null;
  /** The total printed on the document, to compare the lines with. */
  totalKurus: number | null;
  lines: ProposalLineDTO[];
  /** The KDV printed on it, per rate (piece 25). */
  kdv: BillKdvDTO[];
}

export interface ProposalLineDTO {
  /** The stock item it was matched to (piece 25), or null for an expense line. */
  itemId: string | null;
  name: string;
  category: BillCategoryDTO;
  /** Stock lines: thousandths of the item's unit; null when it couldn't be worked out. */
  qtyMilli: number | null;
  totalKurus: number;
  /** The line as printed: "SÜT 1 LT", 24, "adet". */
  readName: string;
  readQtyMilli: number | null;
  readUnit: string | null;
  /** "learned": a person confirmed this line before; "model": the assistant's guess. */
  matchedBy: "model" | "learned" | null;
}

/** An earlier bill or draft a new one looks like (piece 25). */
export interface DuplicateRefDTO {
  kind: "bill" | "draft";
  id: string;
  title: string;
  /** The same file, the same bill number, or the same supplier, day and total. */
  why: "file" | "number" | "dayTotal";
}

export interface DocumentRefDTO {
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** Where the staff can see it; it needs their session. */
  url: string;
}

export type DraftStatusDTO = "open" | "confirmed" | "dismissed";

export interface DraftDTO {
  id: string;
  kind: "bill";
  status: DraftStatusDTO;
  title: string;
  createdAt: string;
  proposal: BillProposalDTO;
  /** What the assistant wasn't sure of, for the owner. */
  doubts: string[];
  document: DocumentRefDTO | null;
  decidedBy: string | null;
  decidedAt: string | null;
  /** The bill it became. */
  resultId: string | null;
  /** Fields changed before confirming. */
  changed: string[];
  dismissReason: string | null;
  /** It may repeat this; confirming needs `allowDuplicate`. */
  duplicateOf: DuplicateRefDTO | null;
}

/**
 * `POST /staff/:slug/documents`: either it's being read, or the same file came before and
 * nothing was done (send `?again=1` to read it anyway).
 */
export interface UploadDTO {
  reading: ReadingDTO | null;
  duplicate: { at: string; name: string; title: string | null; draftId: string | null; billId: string | null } | null;
}

/**
 * `GET /staff/:slug/documents/mine`: what the viewer sent in the last day and what became
 * of it, for the till and Faturalar ("bills.add").
 */
export interface UploadsDTO {
  ai: "on" | "demo" | "off";
  uploads: {
    jobId: string;
    documentName: string;
    at: string;
    /** Still reading, couldn't be read, not a bill, waiting to be checked, saved as a bill, or dismissed. */
    state: "reading" | "failed" | "notBill" | "waiting" | "saved" | "dismissed";
    /** The draft's title, once there is one. */
    title: string | null;
    error: string | null;
  }[];
}

/** A document being read, or one that couldn't become a draft. */
export interface ReadingDTO {
  jobId: string;
  documentName: string;
  at: string;
  state: "reading" | "failed" | "notBill";
  /** Why it failed, in the café's words. */
  error: string | null;
}

/** `GET /staff/:slug/drafts`: Taslaklar. */
export interface DraftsDTO {
  cafe: { slug: string; name: string };
  today: string;
  open: DraftDTO[];
  /** Confirmed or dismissed lately, newest first. */
  recent: DraftDTO[];
  /** Documents read in the last day that haven't become a draft yet. */
  reading: ReadingDTO[];
  /** Whether the assistant can read: off without an OpenAI key, "demo" in the demo without one. */
  ai: "on" | "demo" | "off";
  /** Can upload a document ("bills.add"). */
  canUpload: boolean;
  /** Can confirm bill drafts ("bills.add"). */
  canConfirm: boolean;
  /** Bills' form needs these to check a draft. */
  billForm: BillsDTO;
}

export type AiEventKindDTO = "document.uploaded" | "ai.call" | "draft.created" | "draft.confirmed" | "draft.dismissed" | "job.failed";

/** `GET /staff/:slug/assistant/log`: what the assistant did and what people did with it. */
export interface AiLogDTO {
  events: {
    id: string;
    at: string;
    kind: AiEventKindDTO;
    who: string | null;
    purpose: string | null;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    ms: number | null;
    ok: boolean;
    detail: string | null;
    draftId: string | null;
  }[];
  /** This calendar month so far. */
  month: { calls: number; inputTokens: number; outputTokens: number };
  /** Pass as `before` for older events; null when there are none. */
  next: string | null;
}
