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

const eventTitle = z.string().trim().min(3).max(120);
const eventStartsAt = z.iso.datetime({ offset: true });
/** Empty means no limit. */
const eventCapacity = z.number().int().min(2).max(200).nullable();

/** A café post (plan piece 14): words, photos or both; an event (piece 15) also has a topic and a time. */
export const createPostSchema = z
  .object({
    /** Made once per post on the device, so a retried tap posts once. */
    createKey: z.string().trim().min(8).max(100),
    kind: z.enum(["post", "question", "event"]).default("post"),
    body: z.string().trim().max(2000).default(""),
    imageUrls: z.array(z.string().max(200)).max(6).default([]),
    pinned: z.boolean().default(false),
    title: eventTitle.optional(),
    eventStartsAt: eventStartsAt.optional(),
    eventCapacity: eventCapacity.default(null),
  })
  .refine((p) => p.kind !== "event" || (p.title && p.eventStartsAt), { message: "Bir konu ve bir saat seç", path: ["title"] });

/** Send only what changes. Topic, time and capacity are for events. */
export const updatePostSchema = z.object({
  body: z.string().trim().max(2000).optional(),
  imageUrls: z.array(z.string().max(200)).max(6).optional(),
  pinned: z.boolean().optional(),
  title: eventTitle.optional(),
  eventStartsAt: eventStartsAt.optional(),
  eventCapacity: eventCapacity.optional(),
});

/** `POST /cafes/:slug/events`: a member opens an event (D4, plan piece 15). */
export const createEventSchema = z.object({
  createKey: z.string().trim().min(8).max(100),
  title: eventTitle,
  body: z.string().trim().max(1000).default(""),
  startsAt: eventStartsAt,
  capacity: eventCapacity.default(null),
});

/** The host changes their event. Send only what changes. */
export const updateEventSchema = z.object({
  title: eventTitle.optional(),
  body: z.string().trim().max(1000).optional(),
  startsAt: eventStartsAt.optional(),
  capacity: eventCapacity.optional(),
});

/** `POST /cafes/:slug/reports`: a member reports another member's comment or event. */
export const reportSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.string().min(1).max(120),
  reason: z.enum(["spam", "rude", "unsafe", "other"]),
  note: z.string().trim().max(300).optional(),
});

/** A moderator's answer to a report: take it down (and maybe pause the writer), or keep it. */
export const resolveReportSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.string().min(1).max(120),
  action: z.enum(["remove", "keep"]),
  pauseAuthor: z.boolean().default(false),
});

export const pauseMemberSchema = z.object({ paused: z.boolean() });

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

const spendCode = z.string().trim().regex(/^\d{3}\s?\d{3}$/, "Kod 6 rakam olmalı");

/** "Peni": whose wallet the customer's ödeme kodu opens. */
export const checkPeniSchema = z.object({ code: spendCode });

/** Takes `peni` from that wallet for the order; the same `payKey` again takes them once. */
export const usePeniSchema = z.object({ code: spendCode, peni: z.number().int().min(1).max(1_000_000), payKey: actionKey });

/** "Askıdan ver": the askı pays for `quantity` of an askı item on the order. */
export const giveAskidaSchema = z.object({ productId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20), payKey: actionKey });

/** `POST /me/spend-code` */
export const spendCodeSchema = z.object({ cafeSlug: z.string().min(1).max(100) });

/** Backing out of a payment still waiting; `declined` when the terminal said no. */
export const cancelPaymentSchema = z.object({ declined: z.boolean().optional() });

const cashCount = {
  key: actionKey,
  /** In kuruş; or give `counts` and the total is worked out. */
  countKurus: z.number().int().min(0).max(100_000_000).optional(),
  /** Pieces per note or coin, keyed by its value in kuruş. */
  counts: z.record(z.string(), z.number().int().min(0).max(10_000)).optional(),
  note: z.string().max(200, "En çok 200 karakter").optional(),
};
export const openCashSchema = z.object(cashCount);
export const closeCashSchema = z.object({ ...cashCount, sessionId: z.string().min(1) });
export const cashMoveSchema = z.object({
  key: actionKey,
  kind: z.enum(["in", "out"]),
  amountKurus: z.number().int().min(1).max(100_000_000),
  reason: z.string().trim().min(1, "Bir sebep yaz").max(200, "Sebep çok uzun"),
});

// ─────────────────────────────────────────────── stock (plan piece 17)

/** Thousandths of the unit: grams, ml, or 1000 per piece. */
const milli = z.number().int().min(0).max(1_000_000_000);
const stockName = z.string().trim().min(1, "Bir ad yaz").max(60, "Ad en fazla 60 harf olabilir");
const stockCost = z.number().int().min(0).max(10_000_000).nullable();
const stockNote = z.string().trim().max(200, "En çok 200 karakter");

export const addStockItemSchema = z.object({
  key: actionKey,
  name: stockName,
  kind: z.enum(["ingredient", "supply"]),
  unit: z.enum(["kg", "l", "adet"]),
  /** What is there now. */
  startMilli: milli,
  minMilli: milli.optional(),
  costKurus: stockCost.optional(),
});

/** Send only what changes; `removed` takes it off Stok or brings it back. */
export const updateStockItemSchema = z.object({
  name: stockName.optional(),
  kind: z.enum(["ingredient", "supply"]).optional(),
  unit: z.enum(["kg", "l", "adet"]).optional(),
  minMilli: milli.optional(),
  costKurus: stockCost.optional(),
  removed: z.boolean().optional(),
});

/** "Sayım": what is there now, for one item or many. */
export const countStockSchema = z.object({
  key: actionKey,
  counts: z.array(z.object({ itemId: z.string().min(1).max(100), countedMilli: milli })).min(1).max(300),
  note: stockNote.optional(),
});

/** "Fire": how much went to waste, and why. */
export const wasteStockSchema = z.object({
  key: actionKey,
  itemId: z.string().min(1).max(100),
  qtyMilli: milli.refine((v) => v > 0, "Miktar yaz"),
  why: z.enum(["spilled", "expired", "broken", "other"]),
  note: stockNote.optional(),
});

/** "Stok nasıl düşsün?" and, by recipe, what goes into one. */
export const saveRecipeSchema = z.object({
  mode: z.enum(["recipe", "counted", "none"]),
  lines: z.array(z.object({ itemId: z.string().min(1).max(100), qtyMilli: milli.refine((v) => v > 0, "Miktar yaz") })).max(20),
});

// ─────────────────────────────────────────────── suppliers and bills (plan piece 18)

const billDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarihi kontrol et");
/** Empty text is sent as null. */
const optionalText = (max: number) => z.string().trim().max(max, `En çok ${max} karakter`).nullable().optional();

const supplierFields = {
  name: z.string().trim().min(1, "Bir ad yaz").max(80, "Ad en fazla 80 harf olabilir"),
  phone: optionalText(30),
  email: optionalText(200),
  taxNo: optionalText(20),
  iban: optionalText(40),
  note: optionalText(300),
};

export const addSupplierSchema = z.object({ key: actionKey, ...supplierFields });

/** Send only what changes; `removed` hides it from new bills or brings it back. */
export const updateSupplierSchema = z.object({
  name: supplierFields.name.optional(),
  phone: supplierFields.phone,
  email: supplierFields.email,
  taxNo: supplierFields.taxNo,
  iban: supplierFields.iban,
  note: supplierFields.note,
  removed: z.boolean().optional(),
});

/** A stock line has `itemId` and `qtyMilli`; any other line has `name` and `category`. */
const billLine = z.object({
  itemId: z.string().min(1).max(100).nullable(),
  name: z.string().trim().max(80, "En çok 80 karakter").optional(),
  category: z.enum(["ingredients", "supplies", "rent", "utilities", "services", "wages", "other"]).optional(),
  qtyMilli: milli.nullable().optional(),
  totalKurus: z.number().int().min(0).max(100_000_000),
});

const billFields = {
  supplierId: z.string().min(1).max(100).nullable(),
  number: optionalText(40),
  date: billDay,
  dueDate: billDay.nullable().optional(),
  note: optionalText(300),
  lines: z.array(billLine).min(1, "En az bir satır ekle").max(50),
};

const payMethod = z.enum(["cash", "card", "bank"]);
const amount = z.number().int().min(1, "Tutar yaz").max(100_000_000, "Tutarı kontrol et");
const lender = z.object({ memberId: z.string().min(1).max(100).nullable().optional(), name: z.string().trim().max(80, "En çok 80 karakter").optional() });

/** "Fatura ekle". `paid` marks it paid on the spot (needs "bills.manage"). */
/** Cash comes out of the drawer or the reserve (piece 20); left out, the drawer when it's open. */
const cashFrom = z.enum(["drawer", "reserve"]);

export const addBillSchema = z.object({ key: actionKey, ...billFields, paid: z.object({ method: payMethod, from: cashFrom.optional() }).optional() });

/** "Düzelt": the whole bill again, with the version it was read at. */
export const correctBillSchema = z.object({ version: z.number().int().min(1), ...billFields });

/**
 * "Öde": the rest of it unless `amountKurus` says less, today unless `paidOn` says
 * otherwise. A check needs its number and date; a loan says who paid.
 */
export const payBillSchema = z.object({
  key: actionKey,
  method: z.enum(["cash", "card", "bank", "credit", "check", "loan"]),
  amountKurus: amount.optional(),
  paidOn: billDay.optional(),
  check: z.object({ number: z.string().trim().min(1, "Çek numarasını yaz").max(30), bankName: optionalText(60), dueDate: billDay }).optional(),
  lender: lender.optional(),
  loanDueDate: billDay.nullable().optional(),
  from: cashFrom.optional(),
});

export const voidBillSchema = z.object({ reason: z.string().trim().min(1, "Bir sebep yaz").max(200, "Sebep çok uzun") });

// ─────────────────────────────────────────────── debts (plan piece 19)

/** A check written on its own, not for a bill entered in Peni. */
export const addCheckSchema = z.object({
  key: actionKey,
  number: z.string().trim().min(1, "Çek numarasını yaz").max(30),
  bankName: optionalText(60),
  payee: optionalText(80),
  supplierId: z.string().min(1).max(100).nullable().optional(),
  amountKurus: amount,
  writtenOn: billDay.optional(),
  dueDate: billDay,
  note: optionalText(300),
});

/** "Tahsil edildi", or undo it. */
export const cashCheckSchema = z.object({ cashed: z.boolean(), cashedOn: billDay.optional() });

/** Money someone put in, not for a bill entered in Peni. */
export const addLoanSchema = z.object({
  key: actionKey,
  lender,
  amountKurus: amount,
  borrowedOn: billDay.optional(),
  dueDate: billDay.nullable().optional(),
  note: optionalText(300),
});

/** Paid back to a lender (their key from Borçlar); pays their oldest loans first. */
export const repayLenderSchema = z.object({ key: actionKey, lender: z.string().min(1).max(200), amountKurus: amount, method: payMethod, paidOn: billDay.optional(), from: cashFrom.optional() });

export const cardSettingsSchema = z.object({
  name: z.string().trim().min(1, "Bir ad yaz").max(80),
  limitKurus: z.number().int().min(0).max(100_000_000_000),
  statementDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
});

export const payCardSchema = z.object({ key: actionKey, amountKurus: amount, method: z.enum(["cash", "bank"]), paidOn: billDay.optional(), from: cashFrom.optional() });

// ─────────────────────────────────────────────── money and month close (plan piece 20)

const moneyNote = z.string().trim().max(200, "Not çok uzun");

/** "Başla": what the reserve and the bank hold today. */
export const startMoneySchema = z.object({ reserveKurus: z.number().int().min(0).max(1_000_000_000), bankKurus: z.number().int().min(-1_000_000_000).max(1_000_000_000) });

/**
 * "Aktar" from `account` to `to`; "Para koy" and "Para çek" on the reserve or the bank; "Düzelt"
 * sets the reserve or the bank to `amountKurus` (what was counted or the statement says).
 */
export const moneyMoveSchema = z.object({
  key: actionKey,
  kind: z.enum(["transfer", "deposit", "withdraw", "correction"]),
  account: z.enum(["drawer", "reserve", "bank"]),
  to: z.enum(["drawer", "reserve", "bank"]).optional(),
  amountKurus: z.number().int().min(0).max(1_000_000_000),
  note: moneyNote.optional(),
});

export const closeMonthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), note: moneyNote.optional() });
export const reopenMonthSchema = z.object({ reason: z.string().trim().min(1, "Bir sebep yaz").max(200, "Sebep çok uzun") });

export const billListQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  show: z.enum(["month", "owed"]).optional(),
});

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

/** `POST /claims`: the QR's token, or the 4-digit code typed at a café. */
export const takeClaimSchema = z.union([
  z.object({ token: z.string().trim().min(10).max(100) }),
  z.object({ cafeSlug: z.string().min(1).max(100), code: z.string().trim().regex(/^\d{4}$/, "Kod 4 rakam olmalı") }),
]);

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
export type OpenCashInput = z.input<typeof openCashSchema>;
export type CloseCashInput = z.input<typeof closeCashSchema>;
export type CashMoveInput = z.input<typeof cashMoveSchema>;
export type OrderListQuery = z.input<typeof orderListQuerySchema>;
export type AddStockItemInput = z.input<typeof addStockItemSchema>;
export type UpdateStockItemInput = z.input<typeof updateStockItemSchema>;
export type AddSupplierInput = z.input<typeof addSupplierSchema>;
export type UpdateSupplierInput = z.input<typeof updateSupplierSchema>;
export type AddBillInput = z.input<typeof addBillSchema>;
export type CorrectBillInput = z.input<typeof correctBillSchema>;
export type PayBillInput = z.input<typeof payBillSchema>;
export type VoidBillInput = z.input<typeof voidBillSchema>;
export type BillListQuery = z.input<typeof billListQuerySchema>;
export type AddCheckInput = z.input<typeof addCheckSchema>;
export type CashCheckInput = z.input<typeof cashCheckSchema>;
export type AddLoanInput = z.input<typeof addLoanSchema>;
export type RepayLenderInput = z.input<typeof repayLenderSchema>;
export type CardSettingsInput = z.input<typeof cardSettingsSchema>;
export type PayCardInput = z.input<typeof payCardSchema>;

// ─────────────────────────────────────────────── Vardiyalar and Puantaj ve maaş (piece 21)

const weekDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarihi kontrol et");
const minutesOfDay = z.number().int().min(0).max(1440);
const shiftNote = z.string().trim().max(200, "Not çok uzun");
const shiftPeople = z.array(z.string().min(1).max(100)).min(1, "Vardiyaya en az bir kişi seç").max(20);

/** A new shift. The same `key` adds one. */
export const addShiftSchema = z.object({ key: actionKey, day: weekDay, start: minutesOfDay, end: minutesOfDay, memberIds: shiftPeople, note: shiftNote.nullish() });
/** Only what changes. */
export const updateShiftSchema = z.object({ day: weekDay.optional(), start: minutesOfDay.optional(), end: minutesOfDay.optional(), memberIds: shiftPeople.optional(), note: shiftNote.nullish() });
/** "Geçen haftayı kopyala" into `week` (a Monday). */
export const copyWeekSchema = z.object({ week: weekDay });
/** "Yayınla" or back to a draft. */
export const publishWeekSchema = z.object({ week: weekDay, published: z.boolean() });

/** Hours for several people and days at once; null clears a day. */
export const setHoursSchema = z.object({
  days: z
    .array(z.object({ memberId: z.string().min(1).max(100), day: weekDay, minutes: minutesOfDay.nullable() }))
    .min(1)
    .max(400),
});
export const setRateSchema = z.object({ memberId: z.string().min(1).max(100), kurusPerHour: z.number().int().min(1).max(1_000_000), fromDay: weekDay });
export const payoutSchema = z.object({
  key: actionKey,
  memberId: z.string().min(1).max(100),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amountKurus: z.number().int().min(1).max(100_000_000),
  method: z.enum(["cash", "bank"]),
  from: z.enum(["drawer", "reserve"]).optional(),
  paidOn: weekDay.optional(),
  note: moneyNote.optional(),
});
export const closePaySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), note: moneyNote.optional() });

export type StartMoneyInput = z.input<typeof startMoneySchema>;
export type MoneyMoveInput = z.input<typeof moneyMoveSchema>;
export type CloseMonthInput = z.input<typeof closeMonthSchema>;
export type ReopenMonthInput = z.input<typeof reopenMonthSchema>;
export type AddShiftInput = z.input<typeof addShiftSchema>;
export type UpdateShiftInput = z.input<typeof updateShiftSchema>;
export type CopyWeekInput = z.input<typeof copyWeekSchema>;
export type PublishWeekInput = z.input<typeof publishWeekSchema>;
export type SetHoursInput = z.input<typeof setHoursSchema>;
export type SetRateInput = z.input<typeof setRateSchema>;
export type PayoutInput = z.input<typeof payoutSchema>;
export type ClosePayInput = z.input<typeof closePaySchema>;
export type CountStockInput = z.input<typeof countStockSchema>;
export type WasteStockInput = z.input<typeof wasteStockSchema>;
export type SaveRecipeInput = z.input<typeof saveRecipeSchema>;
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
export type TakeClaimInput = z.input<typeof takeClaimSchema>;
export type CheckPeniInput = z.input<typeof checkPeniSchema>;
export type UsePeniInput = z.input<typeof usePeniSchema>;
export type GiveAskidaInput = z.input<typeof giveAskidaSchema>;
export type CreatePostInput = z.input<typeof createPostSchema>;
export type UpdatePostInput = z.input<typeof updatePostSchema>;
export type CreateEventInput = z.input<typeof createEventSchema>;
export type UpdateEventInput = z.input<typeof updateEventSchema>;
export type ReportInput = z.input<typeof reportSchema>;
export type ResolveReportInput = z.input<typeof resolveReportSchema>;
