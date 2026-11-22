/**
 * Outgoing email via Brevo. The REST API is preferred when BREVO_API_KEY is set (one credential,
 * no relay port / IP allowlist issues); SMTP relay is kept as a fallback.
 */
import { config } from "../config.js";

const useBrevo = () => !!config.brevoApiKey;
const from = () => config.smtp.from;
export const mailConfigured = () => !!from() && (useBrevo() || !!(config.smtp.host && config.smtp.user && config.smtp.pass));

/** Test hook: captures messages instead of sending. */
export const outbox: { to: string; subject: string; text: string }[] = [];
let captureOnly = false;
export const captureMail = (on: boolean) => { captureOnly = on; };

type Transport = { sendMail: (m: object) => Promise<unknown>; verify?: () => Promise<unknown> };
let transport: Transport | null = null;

async function getTransport(): Promise<Transport> {
  if (transport) return transport;
  const nodemailer = await import("nodemailer");
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    requireTLS: config.smtp.port !== 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    tls: { minVersion: "TLSv1.2" },
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }) as Transport;
  return transport;
}

/** "Famous TechX <no-reply@example.com>" → sender object Brevo accepts. */
function sender() {
  const raw = from();
  const m = /^(.*?)\s*<([^>]+)>$/.exec(raw);
  return m ? { name: m[1]!.trim(), email: m[2]!.trim() } : { email: raw };
}

async function brevoFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: { message?: string; [k: string]: unknown } }> {
  const r = await fetch(`https://api.brevo.com/v3${path}`, {
    ...init,
    headers: { "api-key": config.brevoApiKey, accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await r.text();
  let body: { message?: string; [k: string]: unknown } = {};
  try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 200) }; }
  return { ok: r.ok, status: r.status, body };
}

/** Describes the current mail setup without printing secrets. */
export function mailDiagnostics() {
  return {
    configured: mailConfigured(),
    transport: useBrevo() ? "brevo-api" : "smtp",
    host: config.smtp.host || "(not set)",
    port: config.smtp.port,
    user: config.smtp.user ? `${config.smtp.user.slice(0, 3)}…` : "(not set)",
    from: from() || "(not set)",
    keyLooksLikeSmtpKey: /^xsmtpsib-/.test(config.smtp.pass),
    apiKeyLooksValid: /^xkeysib-/.test(config.brevoApiKey),
  };
}

/** Verifies credentials with Brevo. Returns a readable reason when it fails. */
export async function verifyMail(): Promise<{ ok: boolean; message: string }> {
  if (!mailConfigured()) return { ok: false, message: "MAIL_FROM and either BREVO_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS must be set." };
  if (useBrevo()) {
    try {
      const r = await brevoFetch("/account");
      if (r.ok) return { ok: true, message: `Brevo API accepted the key (account ${r.body.email ?? "unknown"}).` };
      const hint = /unrecognised IP|authorised_ips/i.test(r.body.message ?? "")
        ? " Brevo's IP allowlist is blocking this machine — add it in Brevo → Security → Authorised IPs." : "";
      return { ok: false, message: `Brevo API ${r.status}: ${r.body.message ?? "verification failed"}.${hint}` };
    } catch (e) {
      return { ok: false, message: `Brevo API error: ${(e as Error).message}` };
    }
  }
  try {
    const t = await getTransport();
    await t.verify?.();
    return { ok: true, message: `SMTP ${config.smtp.host}:${config.smtp.port} accepted the credentials.` };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const hint = /EAUTH|535|authentication/i.test(`${err.code} ${err.message}`)
      ? " Brevo rejects the login when the SMTP key is wrong, or when your IP is not in Brevo → Security → Authorised IPs (run `npm run mail:check` to see the exact reason)."
      : "";
    return { ok: false, message: `${err.code ?? "SMTP_ERROR"}: ${err.message ?? "verification failed"}.${hint}` };
  }
}

/** Sends a plain-text email. Returns false (and logs) when mail isn't set up or sending fails. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (captureOnly) { outbox.push({ to, subject, text }); return true; }
  if (!mailConfigured()) {
    console.warn(`[mail] not configured — not sending "${subject}" to ${to}`);
    return false;
  }
  try {
    if (useBrevo()) {
      const r = await brevoFetch("/smtp/email", {
        method: "POST",
        body: JSON.stringify({ sender: sender(), to: [{ email: to }], subject, textContent: text }),
      });
      if (!r.ok) throw Object.assign(new Error(r.body.message ?? `HTTP ${r.status}`), { code: `brevo_${r.status}` });
    } else {
      const t = await getTransport();
      await t.sendMail({ from: from(), to, subject, text });
    }
    return true;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error(`[mail] send failed to ${to}: ${err.code ?? "MAIL_ERROR"} ${err.message ?? e}`);
    return false;
  }
}
