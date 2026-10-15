// Response shapes. Dates are ISO strings; money is kuruş; peni is whole numbers.

export type FulfillmentStatus = "submitted" | "accepted" | "ready" | "collected" | "rejected" | "cancelled" | "no_show";

export interface CustomerDTO {
  id: string;
  phone: string;
  displayName: string;
  avatarUrl: string | null;
  profileVisible: boolean;
}

export interface SessionDTO {
  token: string;
  customer: CustomerDTO;
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
  acceptingOrders: boolean;
  askidaItemsAvailable: number;
  isMember: boolean;
}

export interface MembershipDTO {
  id: string;
  balancePeni: number;
  preorderEnabled: boolean;
  joinedAt: string;
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
  comments: { id: string; authorName: string; body: string; createdAt: string }[];
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
}

export interface WalletDTO {
  totalPeni: number;
  cafes: { cafeSlug: string; cafeName: string; membershipId: string; balancePeni: number }[];
  gifts: GiftDTO[];
}

export interface OrderLineDTO {
  productId: string;
  name: string;
  unitPriceKurus: number;
  quantity: number;
  note: string | null;
  fromAskida: boolean;
}

export interface OrderDTO {
  id: string;
  cafeSlug: string;
  cafeName: string;
  orderNumber: string | null;
  status: FulfillmentStatus;
  customerName: string;
  lines: OrderLineDTO[];
  subtotalKurus: number;
  peniDiscountKurus: number;
  askidaKurus: number;
  dueKurus: number;
  customerNote: string | null;
  rejectionReason: string | null;
  submittedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  closedAt: string | null;
}

export interface StaffDashboardDTO {
  cafe: {
    id: string;
    slug: string;
    name: string;
    /** Shelby cafés close orders from the Shelby till, not from the Peni panel. */
    posKind: "standalone" | "shelby";
    acceptingOrders: boolean;
    appOrderingPaused: boolean;
  };
  orders: OrderDTO[];
  askida: AskidaDTO;
  report: {
    sinceIso: string;
    issuedPeni: number;
    redeemedPeni: number;
    askidaDonatedByMembersPeni: number;
    askidaTillDonationsPeni: number;
    askidaMatchedByCafePeni: number;
    askidaClaimedPeni: number;
    askidaClaims: number;
    outstandingPeni: number;
  };
  memberCount: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
