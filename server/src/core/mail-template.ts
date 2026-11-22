/**
 * Branded letterhead for every outgoing Famous TechX POS email.
 *
 * Table layout + inline styles on purpose: Gmail, Outlook and Apple Mail strip <style> blocks and
 * ignore most modern CSS, so a simple, wide, fixed-width table is the reliable way to look the
 * same everywhere. Every dynamic value is HTML-escaped before it goes into the markup.
 */
import { config } from "../config.js";

export interface BrandedMailInput {
  /** The shop/business the message is about (shown in the letterhead and footer). */
  businessName?: string;
  greeting: string;
  title: string;
  paragraphs: string[];
  /** Short numbered "what happens next" list, rendered as a soft panel in the email. */
  steps?: string[];
  action?: { label: string; url: string; note?: string };
  footnote?: string;
}

const BRAND = "Famous TechX POS";
const TAGLINE = "Point of sale, made simple.";
const INDIGO = "#4f46e5";
const VIOLET = "#7c3aed";
const INK = "#14142b";
const MUTED = "#6b6b80";

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A small logo mark that doesn't depend on any hosted image (works offline / in strict clients). */
function logoMark() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,${INDIGO} 0%,${VIOLET} 100%);text-align:center;vertical-align:middle;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;color:#ffffff;line-height:42px;">F</td>
    <td style="padding-left:12px;vertical-align:middle;">
      <div style="font-family:Arial,sans-serif;font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${BRAND}</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#c7d2fe;padding-top:2px;">${TAGLINE}</div>
    </td>
  </tr></table>`;
}

export function brandedMail(i: BrandedMailInput): { html: string; text: string } {
  const appUrl = config.appUrl || "https://famoustechxpos.onrender.com";
  const business = i.businessName?.trim();
  const paragraphs = i.paragraphs.filter(Boolean).map((p) => `<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#37374a;">${esc(p)}</p>`).join("");

  const steps = (i.steps ?? []).filter(Boolean);
  const stepsHtml = steps.length
    ? `<tr><td style="padding:2px 44px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5ff;border-radius:12px;">
          <tr><td style="padding:18px 20px;font-family:Arial,sans-serif;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${INDIGO};">What happens next</p>
            ${steps.map((s, idx) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr>
              <td style="width:24px;height:24px;border-radius:50%;background:${INDIGO};text-align:center;vertical-align:middle;font-size:12px;font-weight:700;color:#ffffff;line-height:24px;">${idx + 1}</td>
              <td style="padding-left:10px;font-size:13px;line-height:1.55;color:#37374a;">${esc(s)}</td>
            </tr></table>`).join("")}
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const actionHtml = i.action
    ? `<tr><td style="padding:26px 44px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:${INDIGO};">
          <a href="${esc(i.action.url)}" style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(i.action.label)} &nbsp;&rarr;</a>
        </td></tr></table>
      </td></tr>
      ${i.action.note ? `<tr><td style="padding:8px 44px 0;font-family:Arial,sans-serif;font-size:12px;color:${MUTED};line-height:1.5;">${esc(i.action.note)}</td></tr>` : ""}
      <tr><td style="padding:14px 44px 0;font-family:Arial,sans-serif;font-size:12px;color:${MUTED};line-height:1.6;">If the button doesn't work, copy and paste this link into your browser:<br/><span style="color:${INDIGO};word-break:break-all;">${esc(i.action.url)}</span></td></tr>`
    : "";

  const footnoteHtml = i.footnote
    ? `<tr><td style="padding:18px 44px 0;font-family:Arial,sans-serif;font-size:12px;color:${MUTED};line-height:1.6;">${esc(i.footnote)}</td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(i.title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5fa;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(i.title)}${business ? ` · ${esc(business)}` : ""}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5fa;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(20,20,43,.08);">
        <!-- Letterhead -->
        <tr><td style="background:linear-gradient(135deg,${INDIGO} 0%,${VIOLET} 100%);padding:28px 44px;">
          ${logoMark()}
        </td></tr>
        <tr><td style="height:4px;background:linear-gradient(90deg,${INDIGO},${VIOLET});font-size:0;line-height:0;">&nbsp;</td></tr>
        ${business ? `<tr><td style="padding:18px 44px 0;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${INDIGO};">${esc(business)}</td></tr>` : ""}
        <!-- Body -->
        <tr><td style="padding:${business ? "14px" : "30px"} 44px 0;">
          <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:15px;color:${MUTED};">${esc(i.greeting)}</p>
          <h1 style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:24px;line-height:1.3;color:${INK};font-weight:700;">${esc(i.title)}</h1>
          ${paragraphs}
        </td></tr>
        ${stepsHtml}
        ${actionHtml}
        ${footnoteHtml}
        <tr><td style="padding:28px 44px 0;"><div style="height:1px;background:#e0e0ea;font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <!-- Footer -->
        <tr><td style="padding:18px 44px 32px;font-family:Arial,sans-serif;font-size:11px;line-height:1.7;color:${MUTED};">
          <p style="margin:0 0 6px;font-weight:700;color:${INK};font-size:12px;">${BRAND}</p>
          <p style="margin:0;">${business ? `Sent on behalf of ${esc(business)}. ` : ""}If you weren't expecting this message, you can safely ignore it - no changes have been made to your account.</p>
          <p style="margin:8px 0 0;"><a href="${esc(appUrl)}" style="color:${INDIGO};text-decoration:none;">${esc(appUrl)}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    BRAND,
    TAGLINE,
    business ? `--- ${business} ---` : "",
    "",
    i.greeting,
    i.title,
    "",
    ...i.paragraphs.filter(Boolean),
    "",
    ...(steps.length ? ["What happens next:", ...steps.map((s, idx) => `${idx + 1}. ${s}`)] : []),
    "",
    i.action ? `${i.action.label}: ${i.action.url}` : "",
    i.action?.note ? `(${i.action.note})` : "",
    "",
    i.footnote || "",
    "",
    `- ${BRAND}`,
    business ? `Sent on behalf of ${business}.` : "",
    `If you weren't expecting this message, you can safely ignore it. ${appUrl}`,
  ].filter((line) => line !== "").join("\n");

  return { html, text };
}
