export type PeniErrorCode =
  | "INVALID_TRANSACTION"
  | "INSUFFICIENT_BALANCE"
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CROSS_CAFE"
  | "MEMBERSHIP_BLOCKED"
  | "GIFT_INVALID"
  | "GIFT_LIMIT"
  | "GIFT_NOT_PENDING"
  | "ASKIDA_DISABLED"
  | "ASKIDA_EMPTY"
  | "ASKIDA_LIMIT"
  | "ASKIDA_TOO_NEW"
  | "PRODUCT_NOT_ELIGIBLE"
  | "INVALID_TRANSITION"
  | "ORDERING_CLOSED"
  | "PREORDER_DISABLED";

/** Domain error. `code` is stable and safe to show to clients; UI maps it to localized text. */
export class PeniError extends Error {
  constructor(
    readonly code: PeniErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PeniError";
  }
}

export function isPeniError(error: unknown): error is PeniError {
  return error instanceof PeniError;
}
