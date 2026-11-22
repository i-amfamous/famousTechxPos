// POST { phone, password } - back-office sign-in for staff who have no email address.
// Looks up the employee's login identity by phone server-side (never exposed to the browser).
import { admin, anon, cors, fail, json } from "../_shared/util.ts";

const digits = (s: string) => s.replace(/\D/g, "").replace(/^233/, "0");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { phone, password } = await req.json();
    if (!phone || !password) return fail("missing_fields");
    const db = admin();
    const { data: members } = await db.from("business_members").select("user_id, phone, status").in("status", ["active", "invited"]);
    const match = (members ?? []).find((m) => m.phone && digits(m.phone) === digits(phone));
    // Same response for "no such phone" and "wrong password" to avoid revealing who works here.
    if (!match) return fail("invalid_credentials", 401);
    const { data: u } = await db.auth.admin.getUserById(match.user_id);
    if (!u.user?.email) return fail("invalid_credentials", 401);
    const res = await anon().auth.signInWithPassword({ email: u.user.email, password });
    if (res.error || !res.data.session) return fail("invalid_credentials", 401);
    const s = res.data.session;
    return json({ session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at } });
  } catch (e) {
    console.error(e);
    return fail("server_error", 500);
  }
});
