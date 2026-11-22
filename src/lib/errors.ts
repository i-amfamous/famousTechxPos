/**
 * Errors shown to staff are written in plain English. The API already sends friendly
 * messages; this file keeps network and unexpected errors just as readable.
 */
const BY_CODE: Record<string, string> = {
  server_error: "Something went wrong. Please try again.",
  bad_json: "That request couldn't be read. Please try again.",
  branch_required: "Choose a branch and try again.",
  idempotency_key_required: "We couldn't start this sale. Please try again.",
  paystack_not_configured: "Payments aren't set up yet. Please try again later.",
  paystack_init_failed: "We couldn't start the payment. Please try again.",
  paystack_not_paid: "The payment isn't confirmed yet. Finish the payment prompt and try again.",
  paystack_amount_mismatch: "The payment amount didn't match this sale. Please try again.",
  invalid_paystack_signature: "We couldn't confirm this payment. Please try again.",
  demo: "This demo isn't connected to a live server.",
};

const TECHNICAL = /\b(?:HTTP\s*\d+|TypeError|ReferenceError|SyntaxError|undefined|NaN|JSON|API\s*error|signature|endpoint|payload|database|query failed|VITE_|MAIL_FROM|BREVO_|SMTP_)\b/i;

function plain(message: unknown): string {
  const text = String(message ?? "").trim();
  if (!text || TECHNICAL.test(text)) return "Something went wrong. Please try again.";
  return text;
}

/** Errors whose message is safe to show to staff. */
export class AppError extends Error {
  constructor(message: string, public code?: string, public details: Record<string, unknown> = {}) {
    super(code && BY_CODE[code] ? BY_CODE[code] : plain(message));
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
