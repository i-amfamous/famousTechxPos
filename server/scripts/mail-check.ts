/**
 * Verifies outgoing mail configuration against the Brevo SMTP relay and API.
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

/** The REST API reports useful causes (e.g. IP allowlisting) that SMTP hides behind 535. */
async function probeBrevoApi() {
  const key = (process.env.BREVO_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  if (!key) return;
  console.log("\nBrevo API probe:");
  try {
    const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": key, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      const body = (await r.json()) as { email?: string };
      console.log(`  OK — account ${body.email ?? "(unknown)"}`);
    } else {
      const body = (await r.json()) as { message?: string };
      console.log(`  ${r.status}: ${body.message ?? await r.text()}`);
      if (/unrecognised IP|authorised_ips/i.test(body.message ?? ""))
        console.log("  → Brevo's IP allowlist is blocking this machine. Add the IP in Brevo → Security → Authorised IPs (or disable the restriction).");
    }
  } catch (e) {
    console.log(`  probe failed: ${e}`);
  }
}

if (!mailConfigured()) {
  console.log("\nMail is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM.");
  await probeBrevoApi();
  process.exit(1);
}

const result = await verifyMail();
console.log(`\n${result.ok ? "OK" : "FAILED"}: ${result.message}`);
await probeBrevoApi();
process.exit(result.ok ? 0 : 1);
