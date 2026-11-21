/** Outgoing email over SMTP (Gmail app password, Zoho, Brevo, …). */
import { config } from "../config.js";

export const mailConfigured = () => !!(config.smtp.host && config.smtp.user && config.smtp.pass);

/** Test hook: captures messages instead of sending. */
export const outbox: { to: string; subject: string; text: string }[] = [];
let captureOnly = false;
export const captureMail = (on: boolean) => { captureOnly = on; };

let transport: { sendMail: (m: object) => Promise<unknown> } | null = null;

/** Sends a plain-text email. Returns false (and logs) when SMTP isn't set up or sending fails. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (captureOnly) { outbox.push({ to, subject, text }); return true; }
  if (!mailConfigured()) {
    console.warn(`[mail] SMTP not configured — not sending "${subject}" to ${to}`);
    return false;
  }
  try {
    if (!transport) {
      const nodemailer = await import("nodemailer");
      transport = nodemailer.createTransport({
        host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });
    }
    await transport.sendMail({ from: config.smtp.from, to, subject, text });
    return true;
  } catch (e) {
    console.error("[mail] send failed:", e);
    return false;
  }
}
