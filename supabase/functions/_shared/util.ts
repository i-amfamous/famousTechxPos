// Shared helpers for Edge Functions (Deno).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const fail = (message: string, status = 400) => json({ error: message }, status);

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Full-access client. Never return its data to callers without checks. */
export const admin = (): SupabaseClient => createClient(URL_, SERVICE, noSession);
/** Public client (used to verify passwords / OTP tokens). */
export const anon = (): SupabaseClient => createClient(URL_, ANON, noSession);
/** Client acting as the caller, so RLS and RPC permission checks apply. */
export const asCaller = (req: Request): SupabaseClient =>
  createClient(URL_, ANON, { ...noSession, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });

/** Issues a normal Supabase session for a user WITHOUT their password (used after PIN check). */
export async function mintSession(email: string) {
  const link = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const verified = await anon().auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session) throw verified.error ?? new Error("could_not_create_session");
  const s = verified.data.session;
  return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at };
}

export function randomPassword() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const s = Array.from(bytes, (b) => a[b % a.length]).join("");
  return `Ftx-${s.slice(0, 4)}-${s.slice(4, 8)}${(bytes[8] % 10)}`;
}

/** Staff without email get a non-deliverable login email so every account has one identity. */
export const staffEmail = () => `staff-${crypto.randomUUID().slice(0, 12)}@${Deno.env.get("STAFF_EMAIL_DOMAIN") ?? "staff.famoustechx.invalid"}`;
export const isStaffEmail = (e?: string | null) => !!e && e.endsWith(`@${Deno.env.get("STAFF_EMAIL_DOMAIN") ?? "staff.famoustechx.invalid"}`);
