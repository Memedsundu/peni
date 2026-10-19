import { z } from "zod";

// Requests are validated with these on the server. Responses are plain types (dto.ts).

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Telefon numarası +90… biçiminde olmalı");

const peniAmount = z.number().int().min(1).max(100_000);

export const sendGiftSchema = z.object({
  cafeSlug: z.string().min(1),
  toPhone: phoneSchema,
  peni: peniAmount,
  message: z.string().trim().max(140).optional(),
  idempotencyKey: z.string().min(8).max(100),
});

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

/** `POST /cafes/:slug/members/lookup` [G6] */
export const memberLookupSchema = z.object({ phone: phoneSchema });

/** `POST /me/profile` [G18]. Send only what changes. */
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  profileVisible: z.boolean().optional(),
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
