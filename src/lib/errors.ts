/** Errors whose message is safe to show to staff. The API already sends friendly messages; this adds network cases. */
export class AppError extends Error {
  constructor(message: string, public code?: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if ((e as { name?: string })?.name === "AbortError")
    return new AppError("The server took too long to respond. Check your connection and try again.", "network");
  const message = (e as { message?: string })?.message ?? String(e);
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(message))
    return new AppError("Can't reach the server. Check the internet connection and try again.", "network");
  return new AppError(message || "Something went wrong.", "unknown");
}
