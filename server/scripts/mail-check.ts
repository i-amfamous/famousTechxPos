/**
 * Verifies outgoing mail against Brevo, then optionally sends a real test email.
 *   npm run mail:check                  # configuration + credential check
 *   MAIL_TEST_TO=you@example.com npm run mail:check   # also sends a test email
 */
import { mailDiagnostics, mailConfigured, sendBrandedMail, verifyMail } from "../src/core/mail.js";

const d = mailDiagnostics();
console.log("Mail configuration:");
console.log(`  configured:        ${d.configured}`);
console.log(`  transport:         ${d.transport}`);
console.log(`  host / port:       ${d.host}:${d.port}`);
console.log(`  user:              ${d.user}`);
console.log(`  from:              ${d.from}`);
console.log(`  key looks valid:   ${d.keyLooksLikeSmtpKey}`);
console.log(`  api key valid:     ${d.apiKeyLooksValid}`);

if (!mailConfigured()) {
  console.log("\nMail is not configured. Set MAIL_FROM and either BREVO_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS.");
  process.exit(1);
}

const result = await verifyMail();
console.log(`\n${result.ok ? "OK" : "FAILED"}: ${result.message}`);

const testTo = (process.env.MAIL_TEST_TO ?? "").trim();
if (result.ok && testTo) {
  const sent = await sendBrandedMail(testTo, "Famous TechX POS - test email", {
    greeting: "Hello,",
    title: "Your branded letterhead is ready",
    paragraphs: ["This is a test of the Famous TechX POS email template. Password resets, invitations and account notices all use this letterhead so your team hears from one consistent brand."],
    action: { label: "Open Famous TechX POS", url: "https://famoustechxpos.onrender.com", note: "No action is needed - this is just a test." },
    footnote: "If you can read this, Brevo mail is configured correctly.",
  });
  console.log(sent ? `Test email sent to ${testTo}` : `Test email FAILED to ${testTo} - check the sender is verified in Brevo.`);
  process.exit(sent ? 0 : 1);
}

process.exit(result.ok ? 0 : 1);
