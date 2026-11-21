/** One-time links for invites (7 days) and password resets (1 hour). Only the SHA-256 of the token is stored. */
import { config } from "../config.js";
import type { Db } from "../core/db.js";
import { addMinutes, nowSql } from "../core/time.js";
import { randomToken, sha256 } from "./crypto.js";

/** Creates a one-time link token (invite: 7 days, reset: 1 hour). Returns the full link. */
export async function issueLinkToken(db: Db, userId: string, purpose: "invite" | "reset", memberId?: string | null) {
  const token = randomToken(32);
  await db.run("INSERT INTO auth_tokens (token_hash, user_id, member_id, purpose, expires_at, created_at) VALUES (?,?,?,?,?,?)",
    [sha256(token), userId, memberId ?? null, purpose, addMinutes(purpose === "invite" ? 7 * 24 * 60 : 60), nowSql()]);
  return `${config.appUrl}/accept-invite?token=${encodeURIComponent(token)}${purpose === "reset" ? "&type=recovery" : ""}`;
}
