// POST { action, organization_id, ... } - employee account operations that need the Auth admin API.
// The caller must be signed in WITH A PASSWORD and hold employees.manage; all DB changes go through
// RPCs that re-check permissions server-side.
//
// actions:
//   create          { full_name, display_name?, phone, email?, role_id, branch_ids[], invite_method: "email"|"temp_password", hire_date?, employee_code? }
//   resend_invite   { member_id }
//   reset_password  { member_id }
//   set_status      { member_id, status: "active"|"suspended"|"deactivated", reason? }
//   sign_out        { member_id }
import { admin, anon, asCaller, cors, fail, isStaffEmail, json, randomPassword, staffEmail } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const caller = asCaller(req);
    const { data: ctx, error: ctxErr } = await caller.rpc("my_context");
    if (ctxErr || !ctx) return fail("not_signed_in", 401);
    if (ctx.business.id !== body.organization_id) return fail("wrong_business", 403);
    if (!ctx.permissions.includes("employees.manage")) return fail("permission_denied", 403);
    if (!ctx.password_session) return fail("password_required", 403);

    const db = admin();
    const redirectTo = `${Deno.env.get("APP_URL") ?? req.headers.get("origin") ?? ""}/accept-invite`;

    const memberUser = async (memberId: string) => {
      const { data } = await db.from("business_members").select("id, user_id, email, organization_id, is_owner, full_name").eq("id", memberId).single();
      if (!data || data.organization_id !== body.organization_id) throw new Error("unknown_member");
      if (data.is_owner) throw new Error("owner_cannot_be_changed");
      const { data: u } = await db.auth.admin.getUserById(data.user_id);
      return { ...data, authEmail: u.user?.email ?? null };
    };

    switch (body.action) {
      case "create": {
        const email = (body.email ?? "").trim().toLowerCase();
        let userId: string;
        let tempPassword: string | undefined;
        if (body.invite_method === "email") {
          if (!email) return fail("email_required");
          const r = await db.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: body.full_name } });
          if (r.error) return fail(r.error.message.includes("already") ? "email_in_use" : r.error.message);
          userId = r.data.user.id;
        } else {
          tempPassword = randomPassword();
          const r = await db.auth.admin.createUser({
            email: email || staffEmail(), password: tempPassword, email_confirm: true,
            user_metadata: { full_name: body.full_name, must_change_password: true },
          });
          if (r.error) return fail(r.error.message.includes("already") ? "email_in_use" : r.error.message);
          userId = r.data.user.id;
        }
        const { data: memberId, error } = await db.rpc("create_member_record", {
          p_org: body.organization_id, p_user: userId, p_actor: ctx.member.id,
          p: { ...body, email: email || null },
        });
        if (error) {
          await db.auth.admin.deleteUser(userId); // roll back the auth user
          return fail(error.message.split(":")[0]);
        }
        return json({ member_id: memberId, temp_password: tempPassword });
      }

      case "resend_invite": {
        const m = await memberUser(body.member_id);
        if (!m.authEmail || isStaffEmail(m.authEmail)) return fail("no_email");
        const r = await db.auth.admin.inviteUserByEmail(m.authEmail, { redirectTo });
        if (r.error) {
          const r2 = await anon().auth.resetPasswordForEmail(m.authEmail, { redirectTo });
          if (r2.error) return fail(r2.error.message);
        }
        return json({ ok: true });
      }

      case "reset_password": {
        const m = await memberUser(body.member_id);
        if (m.authEmail && !isStaffEmail(m.authEmail)) {
          const r = await anon().auth.resetPasswordForEmail(m.authEmail, { redirectTo });
          if (r.error) return fail(r.error.message);
          await caller.rpc("force_sign_out", { p_member: m.id });
          return json({ ok: true, emailed: m.authEmail });
        }
        const temp = randomPassword();
        const r = await db.auth.admin.updateUserById(m.user_id, { password: temp, user_metadata: { must_change_password: true } });
        if (r.error) return fail(r.error.message);
        await caller.rpc("force_sign_out", { p_member: m.id });
        return json({ ok: true, temp_password: temp });
      }

      case "set_status": {
        const m = await memberUser(body.member_id);
        const { error } = await caller.rpc("set_member_status", { p_member: m.id, p_status: body.status, p_reason: body.reason ?? null });
        if (error) return fail(error.message.split(":")[0]);
        // Block (or unblock) sign-in at the Auth level too.
        await db.auth.admin.updateUserById(m.user_id, { ban_duration: body.status === "active" ? "none" : "876000h" });
        return json({ ok: true });
      }

      case "sign_out": {
        const { error } = await caller.rpc("force_sign_out", { p_member: body.member_id });
        if (error) return fail(error.message.split(":")[0]);
        return json({ ok: true });
      }

      default:
        return fail("unknown_action");
    }
  } catch (e) {
    console.error(e);
    return fail(e instanceof Error ? e.message : "server_error", 500);
  }
});
