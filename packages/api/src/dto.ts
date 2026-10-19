// Response shapes. Dates are ISO strings; money is kuruş; peni is whole numbers.

export interface CustomerDTO {
  id: string;
  phone: string;
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
  askida: boolean;
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
  /** "Bir üye" for hidden profiles, otherwise "Ayşe Y.". */
  comments: { id: string; authorName: string; body: string; createdAt: string }[];
  /** Event topic. Null for posts and questions. [G4] */
  title: string | null;
  /** RSVPs in arrival order. Declines are never listed. [G4] */
  attendees: AttendeeDTO[];
  /** Questions only: the viewer already answered today ("Bugünkü cevabın masada."). [G13] */
  answeredTodayByMe: boolean;
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
}

/** `POST /cafes/:slug/members/lookup`: only "Mehmet K.", only for members of that café. [G6] */
export interface MemberLookupDTO {
  firstName: string;
  lastInitial: string | null;
}

/** Someone this customer treated before, at one café. Newest first. [G6] */
export interface RecentRecipientDTO {
  cafeSlug: string;
  /** To send again. The sender typed it the first time. */
  phone: string;
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

/** `GET /staff/me` */
export interface StaffMeDTO {
  account: StaffAccountDTO;
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
}

/** `GET /staff/:slug/team` */
export interface TeamDTO {
  members: TeamMemberDTO[];
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
