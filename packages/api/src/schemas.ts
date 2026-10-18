import { z } from "zod";

// Requests are validated with these on the server. Responses are plain types (dto.ts).

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Telefon numarası +90… biçiminde olmalı");

const peniAmount = z.number().int().min(1).max(100_000);

/** A Peni kodu as typed or scanned ("m7k 42q"); the server normalises it. */
const memberCodeSchema = z.string().trim().min(6).max(12);

/**
 * Who a gift goes to [G6, D28]: a phone number, their Peni kodu, or a member picked
 * from the café's list or from recent recipients (`toMemberId`). Exactly one.
 */
const recipientFields = {
  toPhone: phoneSchema.optional(),
  toCode: memberCodeSchema.optional(),
  toMemberId: z.string().min(1).max(100).optional(),
};
const oneRecipient = (r: { toPhone?: string; toCode?: string; toMemberId?: string }) =>
  [r.toPhone, r.toCode, r.toMemberId].filter((x) => x !== undefined).length === 1;

export const sendGiftSchema = z
  .object({
    cafeSlug: z.string().min(1),
    ...recipientFields,
    peni: peniAmount,
    message: z.string().trim().max(140).optional(),
    idempotencyKey: z.string().min(8).max(100),
  })
  .refine(oneRecipient, "Telefon, Peni kodu veya üyeden birini seç");

export const donateAskidaSchema = z.object({
  cafeSlug: z.string().min(1),
  peni: peniAmount,
  showName: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(100),
});

export const tillDonationSchema = z.object({
  peni: peniAmount,
  idempotencyKey: z.string().min(8).max(100),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(500) });

/** `POST /cafes/:slug/members/lookup`: by phone or by Peni kodu, one of them. [G6, D28] */
export const memberLookupSchema = z
  .object({ phone: phoneSchema.optional(), code: memberCodeSchema.optional() })
  .refine((r) => (r.phone === undefined) !== (r.code === undefined), "Telefon veya Peni kodu gir");

/** `GET /cafes/:slug/members?q=`: the café's members who show their profile. [D28] */
export const cafeMembersQuerySchema = z.object({ q: z.string().trim().max(40).optional() });

/** `POST /me/profile` [G18]. Send only what changes. */
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  profileVisible: z.boolean().optional(),
});

// ─────────────────────────────────────────────── menu (plan piece 5)

const menuName = z.string().trim().min(1, "Bir ad yaz").max(60);
/** Kuruş, so 85,50 TL is 8550. Up to 100.000 TL. */
const priceKurus = z.number().int().min(0).max(10_000_000);
const menuDescription = z.string().trim().max(280).nullable();
const imageUrl = z.string().trim().url().startsWith("https://").max(2000).nullable();

export const menuCategorySchema = z.object({ name: menuName });

export const addProductSchema = z.object({
  name: menuName,
  categoryId: z.string().min(1),
  priceKurus,
  available: z.boolean().optional(),
  description: menuDescription.optional(),
  imageUrl: imageUrl.optional(),
});

/** Send only what changes. `removed: true` takes it off the menu; `false` brings it back. */
export const updateProductSchema = z.object({
  name: menuName.optional(),
  categoryId: z.string().min(1).optional(),
  priceKurus: priceKurus.optional(),
  available: z.boolean().optional(),
  description: menuDescription.optional(),
  imageUrl: imageUrl.optional(),
  removed: z.boolean().optional(),
});

/** Categories top to bottom, or one category's products top to bottom. */
export const menuOrderSchema = z
  .object({ categoryIds: z.array(z.string().min(1)).max(100).optional(), productIds: z.array(z.string().min(1)).max(500).optional() })
  .refine((o) => o.categoryIds || o.productIds, "Sıralama yok");

// ─────────────────────────────────────────────── till orders (plan piece 6)

/** A key the till makes once per action, so a retry never makes a second order or payment. */
const actionKey = z.string().trim().min(8).max(100);
const percent = z.number().int("Tam sayı yüzde yaz").min(0).max(100, "İndirim en çok %100 olabilir");
const orderLine = z.object({
  productId: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(99, "Bir üründen en çok 99 adet"),
  discountPercent: percent.optional(),
});

export const createOrderSchema = z.object({
  createKey: actionKey,
  lines: z.array(orderLine).min(1, "Sipariş boş").max(100),
  discountPercent: percent.optional(),
});

export const updateOrderSchema = z.object({
  lines: z.array(orderLine).min(1, "Sipariş boş").max(100),
  discountPercent: percent.optional(),
});

export const payOrderSchema = z.object({
  method: z.enum(["cash", "card"]),
  payKey: actionKey,
  /** Cash handed over, in kuruş; optional. */
  tenderedKurus: z.number().int().min(0).max(100_000_000).optional(),
});

/** Backing out of a payment still waiting; `declined` when the terminal said no. */
export const cancelPaymentSchema = z.object({ declined: z.boolean().optional() });

export const orderReasonSchema = z.object({ reason: z.string().trim().min(1, "Bir sebep yaz").max(200, "Sebep çok uzun") });

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const orderListQuerySchema = z.object({
  day: isoDay.optional(),
  status: z.enum(["open", "paid", "voided", "refunded"]).optional(),
});

// ─────────────────────────────────────────────── staff (plan piece 2)

export const staffRoleSchema = z.enum(["owner", "manager", "chef", "barista"]);
const email = z.string().trim().toLowerCase().pipe(z.email("Geçerli bir e-posta yaz")).pipe(z.string().max(200));
export const emailSchema = email;
/** Long enough to resist guessing; no other rules, so people can use a passphrase. */
const newPassword = z.string().min(8, "Şifre en az 8 karakter olmalı").max(200);

export const staffSignInSchema = z.object({ email, password: z.string().min(1).max(200) });

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword });

/** `POST /staff/:slug/team`. An email that already has an account joins with its own password. */
export const addStaffSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email,
  role: staffRoleSchema,
  password: newPassword.optional(),
});

/** `POST /staff/:slug/team/:memberId`. Send only what changes. */
export const updateStaffSchema = z.object({
  role: staffRoleSchema.optional(),
  removed: z.literal(true).optional(),
  /** They set a new PIN themselves, signed in with their password. */
  clearPin: z.literal(true).optional(),
});

/** 4 to 6 digits. The server also refuses runs and repeats such as 1234 or 1111. */
export const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN 4-6 rakam olmalı");

/** `POST /staff/:slug/pin`: the caller's own till PIN at this café. */
export const setPinSchema = z.object({ pin: pinSchema });

/** `POST /staff/:slug/devices`: makes this computer a till. */
export const registerDeviceSchema = z.object({ name: z.string().trim().min(1).max(40) });

/** `POST /till/pin`, on a computer set up as a till. */
export const pinSignInSchema = z.object({ memberId: z.string().min(1).max(100), pin: pinSchema });

/** `POST /staff/:slug/team/:memberId/password`: the owner sets a new password for someone. */
export const resetStaffPasswordSchema = z.object({ password: newPassword });

/** `POST /staff/:slug/roles`: role to permission to on/off. Missing switches keep their defaults. */
export const saveRolesSchema = z.object({
  roles: z.record(z.string(), z.record(z.string(), z.boolean())),
});

// ─────────────────────────────────────────────── customer sign-in (plan piece 3)

/** `POST /auth/email/start`: sends a 6-digit code. */
export const emailStartSchema = z.object({ email: emailSchema });

/** `POST /auth/email/verify` */
export const emailVerifySchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Kod 6 rakam olmalı"),
});

/** `POST /auth/google`: the ID token from Google's sign-in on the web or in the app. */
export const googleSignInSchema = z.object({ idToken: z.string().min(20).max(8000) });

/** `POST /auth/apple`: Apple sends the name to the app only the first time, so the app passes it on. */
export const appleSignInSchema = z.object({
  idToken: z.string().min(20).max(8000),
  name: z.string().trim().max(40).optional(),
});

export type SendGiftInput = z.input<typeof sendGiftSchema>;
export type DonateAskidaInput = z.input<typeof donateAskidaSchema>;
export type TillDonationInput = z.input<typeof tillDonationSchema>;
export type MemberLookupInput = z.input<typeof memberLookupSchema>;
export type MenuCategoryInput = z.input<typeof menuCategorySchema>;
export type AddProductInput = z.input<typeof addProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type MenuOrderInput = z.input<typeof menuOrderSchema>;
export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type UpdateOrderInput = z.input<typeof updateOrderSchema>;
export type PayOrderInput = z.input<typeof payOrderSchema>;
export type CancelPaymentInput = z.input<typeof cancelPaymentSchema>;
export type OrderListQuery = z.input<typeof orderListQuerySchema>;
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export type StaffSignInInput = z.input<typeof staffSignInSchema>;
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type AddStaffInput = z.input<typeof addStaffSchema>;
export type UpdateStaffInput = z.input<typeof updateStaffSchema>;
export type ResetStaffPasswordInput = z.input<typeof resetStaffPasswordSchema>;
export type SaveRolesInput = z.input<typeof saveRolesSchema>;
export type SetPinInput = z.input<typeof setPinSchema>;
export type RegisterDeviceInput = z.input<typeof registerDeviceSchema>;
export type PinSignInInput = z.input<typeof pinSignInSchema>;
export type EmailStartInput = z.input<typeof emailStartSchema>;
export type EmailVerifyInput = z.input<typeof emailVerifySchema>;
export type GoogleSignInInput = z.input<typeof googleSignInSchema>;
export type AppleSignInInput = z.input<typeof appleSignInSchema>;
