/**
 * Verifies outgoing mail configuration against the Brevo SMTP relay.
 * Prints setup details without secrets, then attempts a real authentication.
 *   npm run mail:check
 */
import { mailDiagnostics, mailConfigured, verifyMail } from "../src/core/mail.js";

const d = mailDiagnostics();
console.log("Mail configuration:");
console.log(`  configured:        ${d.configured}`);
console.log(`  host / port:       ${d.host}:${d.port}`);
console.log(`  user:              ${d.user}`);
console.log(`  from:              ${d.from}`);
console.log(`  key looks valid:   ${d.keyLooksLikeSmtpKey}`);

if (!mailConfigured()) {
  console.log("\nMail is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM.");
  process.exit(1);
}

const result = await verifyMail();
console.log(`\n${result.ok ? "OK" : "FAILED"}: ${result.message}`);
process.exit(result.ok ? 0 : 1);
