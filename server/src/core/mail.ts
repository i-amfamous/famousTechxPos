/** Outgoing email over Brevo's SMTP relay (configurable through SMTP_* env vars). */
import { config } from "../config.js";

export const mailConfigured = () => !!(config.smtp.host && config.smtp.user && config.smtp.pass && config.smtp.from);

/** Test hook: captures messages instead of sending. */
export const outbox: { to: string; subject: string; text: string }[] = [];
let captureOnly = false;
export const captureMail = (on: boolean) => { captureOnly = on; };

type Transport = { sendMail: (m: object) => Promise<unknown>; verify?: () => Promise<unknown>; close?: () => void };
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

/** Describes the current SMTP setup without printing secrets. */
export function mailDiagnostics() {
  return {
    configured: mailConfigured(),
    host: config.smtp.host || "(not set)",
    port: config.smtp.port,
    user: config.smtp.user ? `${config.smtp.user.slice(0, 3)}…` : "(not set)",
    from: config.smtp.from || "(not set)",
    keyLooksLikeSmtpKey: /^xsmtpsib-/.test(config.smtp.pass),
  };
}

/** Verifies credentials with the relay. Returns a readable reason when it fails. */
export async function verifyMail(): Promise<{ ok: boolean; message: string }> {
  if (!mailConfigured()) return { ok: false, message: "SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM must all be set." };
  try {
    const t = await getTransport();
    await t.verify?.();
    return { ok: true, message: `SMTP ${config.smtp.host}:${config.smtp.port} accepted the credentials.` };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const hint = /EAUTH|535|authentication/i.test(`${err.code} ${err.message}`)
      ? " The Brevo SMTP key is wrong — use the SMTP key from Brevo → SMTP & API → SMTP (starts with xsmtpsib-), not an API key or your login password."
      : "";
    return { ok: false, message: `${err.code ?? "SMTP_ERROR"}: ${err.message ?? "verification failed"}.${hint}` };
  }
}

/** Sends a plain-text email. Returns false (and logs) when SMTP isn't set up or sending fails. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (captureOnly) { outbox.push({ to, subject, text }); return true; }
  if (!mailConfigured()) {
    console.warn(`[mail] SMTP not configured — not sending "${subject}" to ${to}`);
    return false;
  }
  try {
    const t = await getTransport();
    await t.sendMail({ from: config.smtp.from, to, subject, text });
    return true;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error(`[mail] send failed to ${to}: ${err.code ?? "SMTP_ERROR"} ${err.message ?? e}`);
    return false;
  }
}
