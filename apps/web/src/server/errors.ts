export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * `instanceof AppError` fails after a dev hot reload: the app singleton keeps
 * throwing errors built from the old copy of this module. Match the shape too.
 */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  if (!(error instanceof Error) || error.name !== "AppError") return false;
  const { code, status } = error as Partial<AppError>;
  return typeof code === "string" && typeof status === "number";
}
