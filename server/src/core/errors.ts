/** An error whose message is safe to show to staff. */
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const bad = (code: string, message: string, extra?: Record<string, unknown>) => new AppError(400, code, message, extra);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (what = "Not found") => new AppError(404, "not_found", what);
export const unauthorized = (message = "Please sign in again.") => new AppError(401, "unauthorized", message);
