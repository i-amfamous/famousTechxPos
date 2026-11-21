// POST { terminal_token, member_id, pin }                    → PIN unlock on a registered till
// POST { terminal_token, member_id, pin, password, mode:"setup" } → first-time PIN (proves identity with password)
// Returns a Supabase session for that employee. The session is NOT a password session, so
// back-office admin actions (which require is_password_session()) stay locked on tills.
import { admin, anon, cors, fail, json, mintSession } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  try {
    const { terminal_token, member_id, pin, password, mode } = await req.json();
    if (!terminal_token || !member_id || !pin) return fail("missing_fields");
    const db = admin();

    if (mode === "setup") {
      if (!password) return fail("password_required");
      const { data: m } = await db.from("business_members").select("user_id").eq("id", member_id).single();
      if (!m) return fail("not_allowed", 403);
      const { data: u } = await db.auth.admin.getUserById(m.user_id);
      const email = u.user?.email;
      if (!email) return fail("not_allowed", 403);
      const check = await anon().auth.signInWithPassword({ email, password });
      if (check.error) return fail("wrong_password", 401);
      const { data, error } = await db.rpc("pos_setup_pin", { p_token: terminal_token, p_member: member_id, p_pin: pin });
      if (error) return fail(error.message.split(":")[0], 400);
      if (!data?.ok) return fail(data?.reason ?? "not_allowed", 403);
      return json({ session: await mintSession(data.email), member_id });
    }

    const { data, error } = await db.rpc("pos_pin_check", { p_token: terminal_token, p_member: member_id, p_pin: String(pin) });
    if (error) return fail("server_error", 500);
    if (!data?.ok) return json({ error: data?.reason ?? "not_allowed", attempts_left: data?.attempts_left ?? null }, 401);
    return json({ session: await mintSession(data.email), member_id });
  } catch (e) {
    console.error(e);
    return fail("server_error", 500);
  }
});
