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

/** Also matches by name, so it survives module reloading in dev (two copies of the class). */
export function isPeniError(error: unknown): error is PeniError {
  if (error instanceof PeniError) return true;
  return error instanceof Error && error.name === "PeniError" && typeof (error as Partial<PeniError>).code === "string";
}
