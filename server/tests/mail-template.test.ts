/** The shared Famous TechX POS letterhead must be branded, useful in plain text, and safe. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { brandedMail } from "../src/core/mail-template.js";

const sample = {
  businessName: "Kwame's Shop",
  greeting: "Hi Kwame,",
  title: "Reset your password",
  paragraphs: ["Use the button below to choose a new password."],
  action: { label: "Reset my password", url: "https://famoustechxpos.onrender.com/reset?token=abc", note: "Valid for 1 hour." },
};

describe("branded email letterhead", () => {
  it("puts Famous TechX POS and the business in the header", () => {
    const { html } = brandedMail(sample);
    assert.match(html, /Famous TechX POS/);
    assert.match(html, /Point of sale, made simple\./);
    assert.match(html, /Kwame&#39;s Shop/);
    assert.match(html, /linear-gradient\(135deg/);
  });

  it("renders a real call-to-action and the plain-text fallback", () => {
    const { html, text } = brandedMail(sample);
    assert.match(html, /Reset my password/);
    assert.match(html, /https:\/\/famoustechxpos\.onrender\.com\/reset\?token=abc/);
    assert.match(text, /Famous TechX POS/);
    assert.match(text, /Reset my password: https:\/\//);
    assert.match(text, /Kwame's Shop/);
  });

  it("escapes HTML injected via names and links", () => {
    const { html } = brandedMail({ ...sample, greeting: "Hi <script>alert(1)</script>,", title: `Welcome & "join"` });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Welcome &amp; &quot;join&quot;/);
  });
});
