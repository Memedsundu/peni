import { z } from "zod";

// Requests are validated with these on the server. Responses are plain types (dto.ts).

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Telefon numarası +90… biçiminde olmalı");

export const requestCodeSchema = z.object({ phone: phoneSchema });

export const verifyCodeSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/),
  displayName: z.string().trim().min(1).max(40).optional(),
});

const peniAmount = z.number().int().min(1).max(100_000);

export const createOrderSchema = z.object({
  cafeSlug: z.string().min(1),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
        note: z.string().trim().max(100).optional(),
      }),
    )
    .min(1)
    .max(30),
  /** How much of the wallet to use. The server applies the café's caps. */
  usePeni: z.number().int().min(0).max(100_000).default(0),
  /** Take this one item from the askı. Must also appear in `lines`. */
  askidaProductId: z.string().min(1).nullable().default(null),
  customerNote: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().min(8).max(100),
});

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

export const staffTransitionSchema = z.object({
  action: z.enum(["accept", "reject", "ready", "collect", "no_show"]),
  reason: z.string().trim().max(200).optional(),
});

export const tillDonationSchema = z.object({
  peni: peniAmount,
  idempotencyKey: z.string().min(8).max(100),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(500) });

export type RequestCodeInput = z.input<typeof requestCodeSchema>;
export type VerifyCodeInput = z.input<typeof verifyCodeSchema>;
export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type SendGiftInput = z.input<typeof sendGiftSchema>;
export type DonateAskidaInput = z.input<typeof donateAskidaSchema>;
export type StaffTransitionInput = z.input<typeof staffTransitionSchema>;
export type TillDonationInput = z.input<typeof tillDonationSchema>;

/** Parsed (server-side) shapes, with defaults applied. */
export type CreateOrderRequest = z.output<typeof createOrderSchema>;
