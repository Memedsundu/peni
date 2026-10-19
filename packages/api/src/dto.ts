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
