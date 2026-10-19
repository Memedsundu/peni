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

export type SendGiftInput = z.input<typeof sendGiftSchema>;
export type DonateAskidaInput = z.input<typeof donateAskidaSchema>;
export type TillDonationInput = z.input<typeof tillDonationSchema>;
export type MemberLookupInput = z.input<typeof memberLookupSchema>;
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

