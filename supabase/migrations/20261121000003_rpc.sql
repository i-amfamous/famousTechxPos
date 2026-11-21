-- ════════════════════════════════════════════════════════════════════════════
--  Business operations (RPCs). All run as SECURITY DEFINER and check the
--  caller's membership, permissions and branch access themselves. Clients
--  never write sales, payments, stock, shifts or approvals directly.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────── Small helpers ─────────────
create function round2(n numeric) returns numeric language sql immutable as $$ select round(coalesce(n, 0), 2) $$;

create function sha256_hex(t text) returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(t, 'sha256'), 'hex')
$$;

create function next_employee_code(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select 'FTX-' || lpad((coalesce(max(nullif(regexp_replace(employee_code, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
  from business_members where organization_id = p_org
$$;

create function member_org(p_member uuid) returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from business_members where id = p_member
$$;

-- ───────────── Business bootstrap ─────────────
create function seed_default_roles(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_role uuid;
  defs jsonb := '[
    {"key":"owner","name":"Owner","description":"Full control of the business.","d":100,"r":100000000,"n":true,"perms":"*"},
    {"key":"admin","name":"Administrator","description":"Day-to-day configuration and operations.","d":50,"r":20000,"n":true,"perms":"*-branches.manage"},
    {"key":"manager","name":"Manager","description":"Supervises staff, sales, stock and shifts.","d":25,"r":5000,"n":true,"perms":"*-roles.manage,branches.manage,settings.manage"},
    {"key":"cashier","name":"Cashier","description":"Sells, takes payments and prints receipts.","d":5,"r":0,"n":false,"perms":"pos.sell,pos.discount,shift.open_close,shift.cash_movement,sales.view_own,products.view,customers.manage"},
    {"key":"inventory_manager","name":"Inventory Manager","description":"Products, stock, suppliers and purchases.","d":0,"r":0,"n":false,"perms":"products.view,products.manage,inventory.adjust,inventory.transfer,purchases.manage"},
    {"key":"accountant","name":"Accountant","description":"Financial records, expenses and reports.","d":0,"r":0,"n":false,"perms":"sales.view_all,expenses.manage,expenses.void,reports.view,shift.view_all"}
  ]';
begin
  for r in select * from jsonb_array_elements(defs) as e(j) loop
    insert into roles (organization_id, key, name, description, is_system, max_discount_percent, max_refund_amount, allow_no_sale)
    values (p_org, r.j->>'key', r.j->>'name', r.j->>'description', true, (r.j->>'d')::numeric, (r.j->>'r')::numeric, (r.j->>'n')::boolean)
    returning id into v_role;

    if left(r.j->>'perms', 1) = '*' then
      insert into role_permissions (role_id, permission_key)
      select v_role, key from permissions
      where key <> all (string_to_array(nullif(substr(r.j->>'perms', 3), ''), ','));
    else
      insert into role_permissions (role_id, permission_key)
      select v_role, unnest(string_to_array(r.j->>'perms', ','));
    end if;
  end loop;
end $$;

-- Called once by a freshly signed-up user to create their business.
create function create_business(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid; v_branch uuid; v_owner_role uuid; v_member uuid;
  v_email text; v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if exists (select 1 from business_members where user_id = v_uid and status <> 'deactivated') then
    raise exception 'already_in_business';
  end if;
  select email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) into v_email, v_name from auth.users where id = v_uid;

  insert into businesses (name, category, phone, email, address, tin, registration_no, currency, timezone, owner_user_id, settings)
  values (p->>'name', p->>'category', p->>'phone', coalesce(p->>'email', v_email), p->>'address', p->>'tin', p->>'registration_no',
          coalesce(p->>'currency', 'GHS'), coalesce(p->>'timezone', 'Africa/Accra'), v_uid, coalesce(p->'settings', '{}'))
  returning id into v_org;

  insert into branches (organization_id, name, code, address, phone, is_default)
  values (v_org, coalesce(p->>'branch_name', 'Main branch'), upper(coalesce(nullif(p->>'branch_code', ''), 'MAIN')),
          coalesce(p->>'branch_address', p->>'address'), coalesce(p->>'branch_phone', p->>'phone'), true)
  returning id into v_branch;

  perform seed_default_roles(v_org);
  select id into v_owner_role from roles where organization_id = v_org and key = 'owner';

  insert into business_members (organization_id, user_id, role_id, full_name, display_name, email, phone, employee_code, status, is_owner)
  values (v_org, v_uid, v_owner_role, coalesce(p->>'owner_name', v_name), split_part(coalesce(p->>'owner_name', v_name), ' ', 1),
          v_email, p->>'owner_phone', 'FTX-001', 'active', true)
  returning id into v_member;
  insert into member_branch_access values (v_member, v_branch);
  insert into business_subscriptions (organization_id, plan_id) values (v_org, 'business');
  insert into profiles (id, full_name) values (v_uid, coalesce(p->>'owner_name', v_name)) on conflict (id) do nothing;

  perform audit(v_org, v_member, 'settings', 'Created business', p->>'name', null, v_branch);
  return v_org;
end $$;

-- Session bootstrap for the app: the caller's business, membership, role, permissions, branches.
create function my_context() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', to_jsonb(b) - 'settings' || jsonb_build_object('settings', app_settings(b.id)),
    'member', to_jsonb(m),
    'role', to_jsonb(r),
    'permissions', to_jsonb(my_permissions(b.id)),
    'branch_ids', coalesce((select jsonb_agg(branch_id) from member_branch_access where member_id = m.id), '[]'),
    'password_session', is_password_session(),
    'plan', (select to_jsonb(p) from business_subscriptions s join subscription_plans p on p.id = s.plan_id where s.organization_id = b.id)
  )
  from business_members m
  join businesses b on b.id = m.organization_id
  join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by m.is_owner desc, m.created_at
  limit 1
$$;

-- ───────────── PINs ─────────────
-- Verifies a PIN with lock-out. Returns 'ok' | 'wrong' | 'locked' | 'no_pin'. Internal.
create function check_pin(p_member uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pin member_pins%rowtype;
  v_org uuid := member_org(p_member);
  v_s jsonb := app_settings(v_org);
  v_name text;
begin
  select * into v_pin from member_pins where member_id = p_member for update;
  if not found then return 'no_pin'; end if;
  if v_pin.locked_until is not null and v_pin.locked_until > now() then return 'locked'; end if;

  if v_pin.pin_hash = extensions.crypt(p_pin, v_pin.pin_hash) then
    update member_pins set failed_attempts = 0, locked_until = null where member_id = p_member;
    return 'ok';
  end if;

  update member_pins set failed_attempts = failed_attempts + 1 where member_id = p_member returning * into v_pin;
  if v_pin.failed_attempts >= (v_s->>'pin_max_attempts')::int then
    update member_pins set locked_until = now() + make_interval(mins => (v_s->>'pin_lock_minutes')::int), failed_attempts = 0
    where member_id = p_member;
    select full_name into v_name from business_members where id = p_member;
    perform audit(v_org, p_member, 'auth', 'PIN locked', v_pin.failed_attempts || ' failed PIN attempts');
    if (v_s->>'notify_pin_lockouts')::boolean then
      perform notify(v_org, 'security', 'PIN locked: ' || v_name, 'Too many wrong PIN attempts. Reset the PIN from Employees if needed.', null, 'employees.manage');
    end if;
    return 'locked';
  end if;
  return 'wrong';
end $$;

create function set_pin_internal(p_member uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_len int := (app_settings(member_org(p_member))->>'pin_length')::int;
begin
  if p_pin !~ ('^\d{' || v_len || '}$') then raise exception 'pin_format: PIN must be % digits', v_len; end if;
  if p_pin ~ '^(\d)\1+$' or position(p_pin in '0123456789') > 0 or position(p_pin in '9876543210') > 0 then
    raise exception 'pin_too_simple: choose a PIN that is harder to guess';
  end if;
  insert into member_pins (member_id, pin_hash) values (p_member, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (member_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  update business_members set has_pin = true where id = p_member;
end $$;

-- Signed-in user changes their own PIN (profile page).
create function set_my_pin(p_org uuid, p_new_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := my_member_id(p_org);
begin
  if v_me is null then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not is_password_session() then raise exception 'password_required' using errcode = '42501'; end if;
  perform set_pin_internal(v_me, p_new_pin);
  perform audit(p_org, v_me, 'auth', 'Changed POS PIN', '');
end $$;

create function reset_member_pin(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := member_org(p_member); v_me uuid; v_name text;
begin
  v_me := require_perm(v_org, 'employees.manage', true);
  delete from member_pins where member_id = p_member;
  update business_members set has_pin = false where id = p_member returning full_name into v_name;
  perform audit(v_org, v_me, 'employee', 'Reset POS PIN', v_name, null, null, null, 'member', p_member);
end $$;

-- ───────────── Terminals (tills) ─────────────
create function register_terminal(p_org uuid, p_branch uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := require_perm(p_org, 'settings.manage', true);
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid; v_code text;
begin
  if not exists (select 1 from branches where id = p_branch and organization_id = p_org and status = 'active') then
    raise exception 'invalid_branch';
  end if;
  select 'T' || (count(*) + 1) into v_code from pos_terminals where branch_id = p_branch;
  insert into pos_terminals (organization_id, branch_id, name, code, token_hash, registered_by, last_seen_at)
  values (p_org, p_branch, coalesce(nullif(trim(p_name), ''), 'Till'), v_code, sha256_hex(v_token), v_me, now())
  returning id into v_id;
  perform audit(p_org, v_me, 'settings', 'Registered till', p_name, null, p_branch, v_id);
  -- The plain token is returned ONCE and stored only on the device.
  return jsonb_build_object('terminal_id', v_id, 'token', v_token);
end $$;

create function revoke_terminal(p_terminal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t pos_terminals%rowtype; v_me uuid;
begin
  select * into v_t from pos_terminals where id = p_terminal;
  v_me := require_perm(v_t.organization_id, 'settings.manage', true);
  update pos_terminals set status = 'revoked' where id = p_terminal;
  update terminal_sessions set ended_at = now(), end_reason = 'revoked' where terminal_id = p_terminal and ended_at is null;
  perform audit(v_t.organization_id, v_me, 'settings', 'Revoked till', v_t.name, null, v_t.branch_id, p_terminal);
end $$;

create function terminal_by_token(p_token text) returns pos_terminals
language sql stable security definer set search_path = public as $$
  select * from pos_terminals where token_hash = sha256_hex(p_token) and status = 'active'
$$;

-- Public (anon) — what a locked till shows: its identity and who can unlock it.
create function terminal_roster(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t pos_terminals%rowtype; v_s jsonb;
begin
  v_t := terminal_by_token(p_token);
  if v_t.id is null then return null; end if;
  update pos_terminals set last_seen_at = now() where id = v_t.id;
  v_s := app_settings(v_t.organization_id);
  return jsonb_build_object(
    'terminal', jsonb_build_object('id', v_t.id, 'name', v_t.name, 'code', v_t.code, 'branch_id', v_t.branch_id, 'organization_id', v_t.organization_id),
    'branch', (select jsonb_build_object('id', id, 'name', name) from branches where id = v_t.branch_id),
    'business', (select jsonb_build_object('id', id, 'name', name, 'logo_url', logo_url) from businesses where id = v_t.organization_id),
    'settings', jsonb_build_object('pin_length', v_s->'pin_length', 'auto_lock_minutes', v_s->'auto_lock_minutes'),
    'held_count', (select count(*) from held_carts where branch_id = v_t.branch_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'full_name', m.full_name, 'display_name', m.display_name, 'avatar_color', m.avatar_color,
        'role_name', r.name, 'has_pin', m.has_pin, 'status', m.status,
        'pin_locked', coalesce((select locked_until > now() from member_pins where member_id = m.id), false)
      ) order by m.display_name)
      from business_members m join roles r on r.id = m.role_id
      where m.organization_id = v_t.organization_id
        and m.status in ('active', 'suspended')
        and member_has_branch(m.id, v_t.branch_id)
        and (m.is_owner or member_has_perm(m.id, 'pos.sell'))
    ), '[]'::jsonb)
  );
end $$;

-- SERVICE ROLE ONLY (pos-pin-login Edge Function). Validates till + PIN, logs the attempt.
create function pos_pin_check(p_token text, p_member uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t pos_terminals%rowtype; v_m business_members%rowtype; v_res text; v_email text; v_left int;
begin
  v_t := terminal_by_token(p_token);
  if v_t.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown_terminal'); end if;
  select * into v_m from business_members where id = p_member and organization_id = v_t.organization_id;
  if v_m.id is null or v_m.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'not_allowed'); end if;
  if not member_has_branch(v_m.id, v_t.branch_id) or not (v_m.is_owner or member_has_perm(v_m.id, 'pos.sell')) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  v_res := check_pin(v_m.id, p_pin);
  insert into sign_in_events (organization_id, member_id, terminal_id, method, success, device)
  values (v_t.organization_id, v_m.id, v_t.id, 'pin', v_res = 'ok', v_t.name);

  if v_res <> 'ok' then
    select greatest(0, (app_settings(v_t.organization_id)->>'pin_max_attempts')::int - failed_attempts) into v_left
    from member_pins where member_id = v_m.id;
    return jsonb_build_object('ok', false, 'reason', v_res, 'attempts_left', v_left);
  end if;

  update terminal_sessions set ended_at = now(), end_reason = 'switch' where terminal_id = v_t.id and ended_at is null;
  insert into terminal_sessions (organization_id, terminal_id, member_id, auth_method) values (v_t.organization_id, v_t.id, v_m.id, 'pin');
  update business_members set last_sign_in_at = now() where id = v_m.id;
  update pos_terminals set last_seen_at = now() where id = v_t.id;
  perform audit(v_t.organization_id, v_m.id, 'auth', 'Signed in with PIN', v_t.name, null, v_t.branch_id, v_t.id);
  select email into v_email from auth.users where id = v_m.user_id;
  return jsonb_build_object('ok', true, 'user_id', v_m.user_id, 'email', v_email, 'member_id', v_m.id);
end $$;

-- SERVICE ROLE ONLY: first-time PIN setup after the Edge Function has verified the password.
create function pos_setup_pin(p_token text, p_member uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t pos_terminals%rowtype; v_m business_members%rowtype; v_email text;
begin
  v_t := terminal_by_token(p_token);
  select * into v_m from business_members where id = p_member and organization_id = v_t.organization_id and status = 'active';
  if v_t.id is null or v_m.id is null or not member_has_branch(v_m.id, v_t.branch_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  perform set_pin_internal(v_m.id, p_pin);
  insert into terminal_sessions (organization_id, terminal_id, member_id, auth_method) values (v_t.organization_id, v_t.id, v_m.id, 'pin');
  insert into sign_in_events (organization_id, member_id, terminal_id, method, success, device) values (v_t.organization_id, v_m.id, v_t.id, 'pin', true, v_t.name);
  perform audit(v_t.organization_id, v_m.id, 'auth', 'Created POS PIN', v_t.name, null, v_t.branch_id, v_t.id);
  select email into v_email from auth.users where id = v_m.user_id;
  return jsonb_build_object('ok', true, 'user_id', v_m.user_id, 'email', v_email, 'member_id', v_m.id);
end $$;

create function lock_terminal(p_terminal uuid, p_reason text default 'lock') returns void
language sql security definer set search_path = public as $$
  update terminal_sessions set ended_at = now(), end_reason = p_reason
  where terminal_id = p_terminal and ended_at is null
    and member_id = my_member_id((select organization_id from pos_terminals where id = p_terminal))
$$;

-- ───────────── Manager approval ─────────────
create function approvers(p_org uuid, p_branch uuid, p_perm text default 'pos.approve') returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'display_name', m.display_name,
                                               'avatar_color', m.avatar_color, 'role_name', r.name) order by m.display_name), '[]')
  from business_members m join roles r on r.id = m.role_id
  where is_member(p_org) and m.organization_id = p_org and m.status = 'active' and m.has_pin
    and m.id <> my_member_id(p_org)
    and member_has_branch(m.id, p_branch) and member_has_perm(m.id, p_perm)
$$;

-- The cashier (caller) asks a manager to approve on the same till. Returns a single-use approval id.
create function approve_action(p_org uuid, p_terminal uuid, p_approver uuid, p_pin text, p_action text,
                               p_amount numeric default null, p_detail text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := my_member_id(p_org); v_res text; v_id uuid; v_ap business_members%rowtype; v_role roles%rowtype;
begin
  if v_me is null then raise exception 'not_a_member' using errcode = '42501'; end if;
  if p_approver = v_me then raise exception 'self_approval_not_allowed'; end if;
  select * into v_ap from business_members where id = p_approver and organization_id = p_org and status = 'active';
  if v_ap.id is null or not member_has_perm(v_ap.id, 'pos.approve') then raise exception 'approver_not_allowed'; end if;
  if p_action = 'refund' and not v_ap.is_owner then
    select * into v_role from roles where id = v_ap.role_id;
    if not member_has_perm(v_ap.id, 'sales.refund') or coalesce(p_amount, 0) > v_role.max_refund_amount then
      raise exception 'approver_limit_exceeded';
    end if;
  end if;

  v_res := check_pin(v_ap.id, p_pin);
  if v_res <> 'ok' then raise exception 'approval_pin_%', v_res; end if;

  insert into approvals (organization_id, terminal_id, action, amount, detail, requested_by, approved_by)
  values (p_org, p_terminal, p_action, p_amount, p_detail, v_me, v_ap.id) returning id into v_id;
  perform audit(p_org, v_ap.id, 'approval', 'Approved ' || replace(p_action, '_', ' '),
                coalesce(p_detail, '') || ' — requested by ' || (select full_name from business_members where id = v_me),
                p_amount, null, p_terminal, 'approval', v_id);
  return v_id;
end $$;

-- Internal: validates + consumes an approval. Returns approver id.
create function consume_approval(p_approval uuid, p_org uuid, p_action text, p_amount numeric, p_ref uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_a approvals%rowtype;
begin
  select * into v_a from approvals where id = p_approval for update;
  if v_a.id is null or v_a.organization_id <> p_org or v_a.action <> p_action or v_a.used_at is not null
     or v_a.created_at < now() - interval '15 minutes' or v_a.requested_by <> my_member_id(p_org)
     or (p_amount is not null and coalesce(v_a.amount, 0) + 0.005 < abs(p_amount)) then
    raise exception 'approval_required: % (needs a valid manager approval)', p_action using errcode = '42501';
  end if;
  update approvals set used_at = now(), used_ref = p_ref where id = p_approval;
  return v_a.approved_by;
end $$;

-- ───────────── Shifts & cash drawer ─────────────
create function shift_expected_cash(p_shift uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round2(s.opening_float
    + coalesce((select sum(p.amount) from payments p join sales x on x.id = p.sale_id
                where x.shift_id = s.id and p.method = 'cash' and x.status <> 'voided'), 0)
    - coalesce((select sum(x.change_due) from sales x where x.shift_id = s.id and x.status <> 'voided'), 0)
    - coalesce((select sum(r.amount) from refunds r where r.shift_id = s.id and r.method = 'cash'), 0)
    + coalesce((select sum(case type when 'paid_in' then amount when 'paid_out' then -amount when 'drop' then -amount else 0 end)
                from cash_movements where shift_id = s.id), 0))
  from shifts s where s.id = p_shift
$$;

create function shift_summary(p_shift uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shift', to_jsonb(s),
    'sales_count', (select count(*) from sales where shift_id = s.id and status <> 'voided'),
    'sales_total', (select coalesce(sum(total), 0) from sales where shift_id = s.id and status <> 'voided'),
    'by_method', (select jsonb_build_object(
        'cash', coalesce(sum(p.amount) filter (where p.method = 'cash'), 0) - coalesce((select sum(change_due) from sales where shift_id = s.id and status <> 'voided'), 0),
        'momo', coalesce(sum(p.amount) filter (where p.method = 'momo'), 0),
        'card', coalesce(sum(p.amount) filter (where p.method = 'card'), 0),
        'bank', coalesce(sum(p.amount) filter (where p.method = 'bank'), 0))
      from payments p join sales x on x.id = p.sale_id where x.shift_id = s.id and x.status <> 'voided'),
    'refunds_cash', (select coalesce(sum(amount), 0) from refunds where shift_id = s.id and method = 'cash'),
    'movements', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from cash_movements c where c.shift_id = s.id), '[]'),
    'expected_cash', coalesce(s.expected_cash, shift_expected_cash(s.id))
  )
  from shifts s
  where s.id = p_shift
    and (s.member_id = my_member_id(s.organization_id) or has_perm(s.organization_id, 'shift.view_all'))
$$;

create function open_shift(p_terminal uuid, p_opening_float numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_t pos_terminals%rowtype; v_me uuid; v_id uuid;
begin
  select * into v_t from pos_terminals where id = p_terminal and status = 'active';
  if v_t.id is null then raise exception 'unknown_terminal'; end if;
  v_me := require_perm(v_t.organization_id, 'shift.open_close');
  if not member_has_branch(v_me, v_t.branch_id) then raise exception 'branch_not_allowed' using errcode = '42501'; end if;

  if (app_settings(v_t.organization_id)->>'shared_drawer')::boolean then
    select id into v_id from shifts where terminal_id = p_terminal and status = 'open' limit 1;
  else
    select id into v_id from shifts where terminal_id = p_terminal and member_id = v_me and status = 'open';
  end if;
  if v_id is not null then return v_id; end if;

  insert into shifts (organization_id, branch_id, terminal_id, member_id, opening_float)
  values (v_t.organization_id, v_t.branch_id, p_terminal, v_me, round2(p_opening_float)) returning id into v_id;
  perform audit(v_t.organization_id, v_me, 'cash', 'Opened shift', v_t.name || ' · float ' || round2(p_opening_float), p_opening_float, v_t.branch_id, p_terminal, 'shift', v_id);
  return v_id;
end $$;

-- Current open shift for the caller on a till (or the shared one).
create function my_open_shift(p_terminal uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from shifts s join pos_terminals t on t.id = s.terminal_id
  where s.terminal_id = p_terminal and s.status = 'open'
    and (s.member_id = my_member_id(t.organization_id) or (app_settings(t.organization_id)->>'shared_drawer')::boolean)
  order by s.opened_at desc limit 1
$$;

create function record_cash_movement(p_shift uuid, p_type cash_move_type, p_amount numeric, p_reason text, p_approval uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_s shifts%rowtype; v_me uuid; v_id uuid; v_role roles%rowtype;
begin
  select * into v_s from shifts where id = p_shift and status = 'open';
  if v_s.id is null then raise exception 'shift_not_open'; end if;
  v_me := require_perm(v_s.organization_id, 'shift.cash_movement');
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_type <> 'no_sale' and coalesce(p_amount, 0) <= 0 then raise exception 'amount_required'; end if;

  if p_type = 'no_sale' then
    select r.* into v_role from roles r join business_members m on m.role_id = r.id where m.id = v_me;
    if not (member_has_perm(v_me, 'pos.no_sale') or v_role.allow_no_sale) then
      perform consume_approval(p_approval, v_s.organization_id, 'no_sale', null, p_shift);
    end if;
  elsif p_type = 'drop' and not member_has_perm(v_me, 'pos.approve') then
    perform consume_approval(p_approval, v_s.organization_id, 'drop', p_amount, p_shift);
  end if;

  insert into cash_movements (organization_id, shift_id, type, amount, reason, actor_id, approval_id)
  values (v_s.organization_id, p_shift, p_type, round2(coalesce(p_amount, 0)), p_reason, v_me, p_approval) returning id into v_id;
  perform audit(v_s.organization_id, v_me, 'cash',
                case p_type when 'paid_in' then 'Cash in' when 'paid_out' then 'Cash out' when 'drop' then 'Cash drop' else 'Opened drawer (no sale)' end,
                p_reason, p_amount, v_s.branch_id, v_s.terminal_id, 'shift', p_shift);
  return v_id;
end $$;

create function close_shift(p_shift uuid, p_counts jsonb, p_note text default null, p_approval uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_s shifts%rowtype; v_me uuid; v_expected numeric; v_counted numeric := 0; v_var numeric; v_thr numeric; v_approver uuid; k text;
begin
  select * into v_s from shifts where id = p_shift and status = 'open' for update;
  if v_s.id is null then raise exception 'shift_not_open'; end if;
  v_me := require_perm(v_s.organization_id, 'shift.open_close');
  if v_s.member_id <> v_me and not member_has_perm(v_me, 'shift.view_all') then raise exception 'not_your_shift' using errcode = '42501'; end if;

  for k in select jsonb_object_keys(p_counts) loop
    v_counted := v_counted + k::numeric * greatest(0, coalesce((p_counts->>k)::numeric, 0));
  end loop;
  v_counted := round2(v_counted);
  v_expected := shift_expected_cash(p_shift);
  v_var := v_counted - v_expected;
  v_thr := (app_settings(v_s.organization_id)->>'variance_threshold')::numeric;

  if abs(v_var) > v_thr then
    if coalesce(trim(p_note), '') = '' then raise exception 'note_required: explain the cash difference'; end if;
    if not member_has_perm(v_me, 'pos.approve') then
      v_approver := consume_approval(p_approval, v_s.organization_id, 'shift_variance', abs(v_var), p_shift);
    else
      v_approver := v_me;
    end if;
    perform notify(v_s.organization_id, 'shift', 'Shift closed with variance',
                   (select full_name from business_members where id = v_s.member_id) || ': ' || v_var, null, 'shift.view_all');
  end if;

  update shifts set status = 'closed', closed_at = now(), closed_by = v_me, expected_cash = v_expected, counted_cash = v_counted,
                    denomination_counts = p_counts, variance = v_var, note = p_note, approved_by = v_approver
  where id = p_shift;
  update terminal_sessions set ended_at = now(), end_reason = 'shift_closed' where terminal_id = v_s.terminal_id and member_id = v_s.member_id and ended_at is null;
  perform audit(v_s.organization_id, v_me, 'cash', 'Closed shift',
                'Expected ' || v_expected || ' · counted ' || v_counted || ' · variance ' || v_var, v_var, v_s.branch_id, v_s.terminal_id, 'shift', p_shift);
  return shift_summary(p_shift);
end $$;

-- ───────────── Stock primitive ─────────────
-- Locks/creates the inventory row, applies a delta, records the movement. Returns quantity after.
create function apply_stock(p_org uuid, p_branch uuid, p_product uuid, p_variant uuid, p_delta numeric, p_type movement_type,
                            p_reason text, p_ref_type text, p_ref uuid, p_actor uuid, p_allow_negative boolean default true)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_inv inventory%rowtype; v_after numeric; v_p products%rowtype;
begin
  select * into v_p from products where id = p_product and organization_id = p_org;
  if v_p.id is null then raise exception 'unknown_product'; end if;
  if v_p.unit = 'job' then return 0; end if; -- services are not stock-tracked

  insert into inventory (organization_id, branch_id, product_id, variant_id, quantity)
  values (p_org, p_branch, p_product, p_variant, 0)
  on conflict (branch_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

  select * into v_inv from inventory
  where branch_id = p_branch and product_id = p_product and variant_id is not distinct from p_variant for update;

  v_after := v_inv.quantity + p_delta;
  if v_after < 0 and not p_allow_negative then
    raise exception 'insufficient_stock: % (% available)', v_p.name, v_inv.quantity using errcode = 'P0001';
  end if;
  update inventory set quantity = v_after, updated_at = now() where id = v_inv.id;
  insert into stock_movements (organization_id, branch_id, product_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, reference_type, reference_id, actor_id)
  values (p_org, p_branch, p_product, p_variant, p_type, p_delta, v_inv.quantity, v_after, p_reason, p_ref_type, p_ref, p_actor);

  if p_delta < 0 and v_p.reorder_level > 0 and v_inv.quantity > v_p.reorder_level and v_after <= v_p.reorder_level then
    perform notify(p_org, 'low_stock', case when v_after <= 0 then 'Out of stock: ' else 'Low stock: ' end || v_p.name,
                   greatest(v_after, 0) || ' left at ' || (select name from branches where id = p_branch) || ' (reorder level ' || v_p.reorder_level || ').',
                   null, 'inventory.adjust');
  end if;
  return v_after;
end $$;

-- ───────────── Checkout (atomic + idempotent) ─────────────
-- p: { terminal_id, customer_id?, idempotency_key, cart_discount?, discount_reason?, discount_approval_id?, price_approval_id?,
--      lines: [{ product_id, variant_id?, quantity, unit_price?, discount? }],
--      payments: [{ method, amount, reference? }] }
create function checkout(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t pos_terminals%rowtype; v_org uuid; v_me uuid; v_member business_members%rowtype; v_role roles%rowtype;
  v_s jsonb; v_shift uuid; v_sale uuid; v_existing sales%rowtype;
  l jsonb; pay jsonb; v_p products%rowtype; v_v product_variants%rowtype;
  v_price numeric; v_qty numeric; v_line_disc numeric; v_cart_disc numeric := round2((p->>'cart_discount')::numeric);
  v_sub numeric := 0; v_disc numeric := 0; v_tax numeric := 0; v_total numeric := 0; v_cost numeric := 0;
  v_paid numeric := 0; v_noncash numeric := 0; v_cash numeric := 0; v_change numeric;
  v_price_override boolean := false; v_seq bigint; v_receipt text; v_branch_code text; v_rate numeric; v_incl boolean;
  v_lines jsonb := '[]'; v_i int := 0; v_n int; v_alloc numeric; v_alloc_left numeric; v_net numeric; v_line_tax numeric;
  v_disc_approver uuid; v_needed numeric; r record;
begin
  -- Who / where
  select * into v_t from pos_terminals where id = (p->>'terminal_id')::uuid and status = 'active';
  if v_t.id is null then raise exception 'unknown_terminal'; end if;
  v_org := v_t.organization_id;
  v_me := require_perm(v_org, 'pos.sell');
  if not member_has_branch(v_me, v_t.branch_id) then raise exception 'branch_not_allowed' using errcode = '42501'; end if;
  select * into v_member from business_members where id = v_me;
  select * into v_role from roles where id = v_member.role_id;
  v_s := app_settings(v_org);
  v_rate := coalesce((v_s->>'tax_rate')::numeric, 0);
  v_incl := coalesce((v_s->>'prices_include_tax')::boolean, true);

  -- Idempotency: same key → same sale, no second charge
  if coalesce(p->>'idempotency_key', '') = '' then raise exception 'idempotency_key_required'; end if;
  select * into v_existing from sales where organization_id = v_org and idempotency_key = p->>'idempotency_key';
  if v_existing.id is not null then return sale_receipt(v_existing.id); end if;

  -- Shift
  v_shift := my_open_shift(v_t.id);
  if v_shift is null and (v_s->>'require_shift')::boolean then raise exception 'shift_required: open a shift before selling'; end if;

  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'empty_cart'; end if;
  v_n := jsonb_array_length(p->'lines');

  -- Pass 1: prices & subtotal
  for l in select * from jsonb_array_elements(p->'lines') loop
    select * into v_p from products where id = (l->>'product_id')::uuid and organization_id = v_org and status = 'active';
    if v_p.id is null then raise exception 'product_unavailable'; end if;
    v_qty := (l->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_quantity'; end if;
    v_v := null;
    if l->>'variant_id' is not null then
      select * into v_v from product_variants where id = (l->>'variant_id')::uuid and product_id = v_p.id;
    end if;
    v_price := coalesce(v_v.selling_price, v_p.selling_price);
    if l ? 'unit_price' and round2((l->>'unit_price')::numeric) <> v_price then
      v_price_override := true; v_price := round2((l->>'unit_price')::numeric);
      if v_price < 0 then raise exception 'invalid_price'; end if;
    end if;
    v_line_disc := round2(coalesce((l->>'discount')::numeric, 0));
    if v_line_disc < 0 or v_line_disc > v_price * v_qty then raise exception 'invalid_discount'; end if;
    v_sub := v_sub + round2(v_price * v_qty);
    v_disc := v_disc + v_line_disc;
    v_lines := v_lines || jsonb_build_object('p', to_jsonb(v_p), 'v', to_jsonb(v_v), 'qty', v_qty, 'price', v_price, 'disc', v_line_disc);
  end loop;

  if v_cart_disc < 0 or v_disc + v_cart_disc > v_sub then raise exception 'invalid_discount'; end if;
  v_disc := v_disc + v_cart_disc;

  -- Price override & discount authority
  if v_price_override and not member_has_perm(v_me, 'pos.price_override') then
    perform consume_approval((p->>'price_approval_id')::uuid, v_org, 'price_override', null, null);
  end if;
  if v_disc > 0 then
    if not v_member.is_owner and (not member_has_perm(v_me, 'pos.discount') or (v_disc / nullif(v_sub, 0)) * 100 > v_role.max_discount_percent + 0.0001) then
      v_disc_approver := consume_approval((p->>'discount_approval_id')::uuid, v_org, 'discount', v_disc, null);
    end if;
  end if;

  -- Pass 2: allocate cart discount, tax, totals
  v_alloc_left := v_cart_disc;
  for l in select * from jsonb_array_elements(v_lines) loop
    v_i := v_i + 1;
    v_net := round2((l->>'price')::numeric * (l->>'qty')::numeric) - (l->>'disc')::numeric;
    if v_i = v_n then v_alloc := v_alloc_left;
    else v_alloc := round2(v_cart_disc * v_net / nullif(v_sub - (v_disc - v_cart_disc), 0)); v_alloc_left := v_alloc_left - v_alloc; end if;
    v_net := v_net - coalesce(v_alloc, 0);
    v_line_tax := 0;
    if (l->'p'->>'taxable')::boolean and v_rate > 0 then
      v_line_tax := case when v_incl then round2(v_net * v_rate / (100 + v_rate)) else round2(v_net * v_rate / 100) end;
    end if;
    v_tax := v_tax + v_line_tax;
    v_cost := v_cost + round2((l->'p'->>'cost_price')::numeric * (l->>'qty')::numeric);
    v_lines := jsonb_set(v_lines, array[(v_i - 1)::text], l || jsonb_build_object('alloc', coalesce(v_alloc, 0), 'tax', v_line_tax,
                          'line_total', v_net + case when v_incl then 0 else v_line_tax end));
  end loop;
  v_total := round2(v_sub - v_disc + case when v_incl then 0 else v_tax end);

  -- Payments
  for pay in select * from jsonb_array_elements(coalesce(p->'payments', '[]')) loop
    if (pay->>'amount')::numeric <= 0 then raise exception 'invalid_payment'; end if;
    v_paid := v_paid + round2((pay->>'amount')::numeric);
    if pay->>'method' = 'cash' then v_cash := v_cash + round2((pay->>'amount')::numeric);
    else v_noncash := v_noncash + round2((pay->>'amount')::numeric); end if;
  end loop;
  if v_paid < v_total then raise exception 'payment_short: % still due', v_total - v_paid; end if;
  if v_noncash > v_total then raise exception 'overpaid_non_cash: only cash can be more than the total'; end if;
  v_change := v_paid - v_total;
  if v_change > v_cash then raise exception 'invalid_change'; end if;

  -- Receipt number (per till sequence)
  update pos_terminals set receipt_seq = receipt_seq + 1, last_seen_at = now() where id = v_t.id returning receipt_seq into v_seq;
  select code into v_branch_code from branches where id = v_t.branch_id;
  v_receipt := v_branch_code || '-' || v_t.code || '-' || lpad(v_seq::text, 6, '0');

  insert into sales (organization_id, branch_id, terminal_id, shift_id, cashier_id, customer_id, receipt_number, idempotency_key,
                     subtotal, discount_total, tax_total, total, paid_total, change_due, cost_total, discount_approval_id)
  values (v_org, v_t.branch_id, v_t.id, v_shift, v_me, nullif(p->>'customer_id', '')::uuid, v_receipt, p->>'idempotency_key',
          round2(v_sub), round2(v_disc), round2(v_tax), v_total, v_paid, v_change, v_cost, (p->>'discount_approval_id')::uuid)
  returning id into v_sale;

  if v_disc_approver is not null then update approvals set used_ref = v_sale where id = (p->>'discount_approval_id')::uuid; end if;

  -- Items + stock (aggregate per item to check availability once)
  for l in select * from jsonb_array_elements(v_lines) loop
    insert into sale_items (organization_id, sale_id, product_id, variant_id, name_snapshot, sku_snapshot, quantity, unit_price,
                            cost_snapshot, discount, tax, line_total)
    values (v_org, v_sale, (l->'p'->>'id')::uuid, nullif(l->'v'->>'id', '')::uuid,
            (l->'p'->>'name') || coalesce(' — ' || (l->'v'->>'label'), ''), coalesce(l->'v'->>'sku', l->'p'->>'sku'),
            (l->>'qty')::numeric, (l->>'price')::numeric, (l->'p'->>'cost_price')::numeric,
            (l->>'disc')::numeric + (l->>'alloc')::numeric, (l->>'tax')::numeric, (l->>'line_total')::numeric);
  end loop;

  for r in
    select (x->'p'->>'id')::uuid as product_id, nullif(x->'v'->>'id', '')::uuid as variant_id, sum((x->>'qty')::numeric) as qty
    from jsonb_array_elements(v_lines) x group by 1, 2
  loop
    perform apply_stock(v_org, v_t.branch_id, r.product_id, r.variant_id, -r.qty, 'sale', null, 'sale', v_sale, v_me,
                        not (v_s->>'block_negative_stock')::boolean);
  end loop;

  for pay in select * from jsonb_array_elements(p->'payments') loop
    insert into payments (organization_id, sale_id, method, amount, status, provider_reference, recorded_by)
    values (v_org, v_sale, (pay->>'method')::payment_method, round2((pay->>'amount')::numeric), 'recorded', nullif(pay->>'reference', ''), v_me);
  end loop;

  if p->>'customer_id' is not null then
    update customers set total_spend = total_spend + v_total, visits = visits + 1, last_visit_at = now()
    where id = (p->>'customer_id')::uuid and organization_id = v_org;
  end if;

  perform audit(v_org, v_me, 'sale', 'Completed sale', v_receipt, v_total, v_t.branch_id, v_t.id, 'sale', v_sale);
  if v_disc > 0 then
    perform audit(v_org, v_me, 'discount', 'Gave discount', v_receipt || coalesce(' · ' || nullif(p->>'discount_reason', ''), ''),
                  v_disc, v_t.branch_id, v_t.id, 'sale', v_sale, jsonb_build_object('approved_by', v_disc_approver));
  end if;
  return sale_receipt(v_sale);
end $$;

-- Receipt / detail payload for a sale (used after checkout and for reprints).
create function sale_receipt(p_sale uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object(
    'branch_name', b.name, 'terminal_name', t.name, 'cashier_name', m.display_name, 'cashier_full_name', m.full_name,
    'customer_name', c.name, 'business', jsonb_build_object('name', biz.name, 'phone', biz.phone, 'tin', biz.tin, 'address', biz.address,
      'footer', app_settings(biz.id)->>'receipt_footer'),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.name_snapshot), '[]') from sale_items i where i.sale_id = s.id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(pm) order by pm.created_at), '[]') from payments pm where pm.sale_id = s.id),
    'refunds', (select coalesce(jsonb_agg(to_jsonb(rf) || jsonb_build_object('actor_name', am.full_name) order by rf.created_at), '[]')
                from refunds rf join business_members am on am.id = rf.actor_id where rf.original_sale_id = s.id)
  )
  from sales s
  join branches b on b.id = s.branch_id
  join businesses biz on biz.id = s.organization_id
  left join pos_terminals t on t.id = s.terminal_id
  join business_members m on m.id = s.cashier_id
  left join customers c on c.id = s.customer_id
  where s.id = p_sale
    and (has_perm(s.organization_id, 'sales.view_all') or s.cashier_id = my_member_id(s.organization_id))
$$;

-- ───────────── Refunds & voids ─────────────
-- p_items: [{ sale_item_id, quantity }]
create function refund_sale(p_sale uuid, p_items jsonb, p_reason text, p_restock boolean, p_method payment_method,
                            p_approval uuid default null, p_terminal uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_s sales%rowtype; v_me uuid; v_role roles%rowtype; v_member business_members%rowtype; it jsonb; v_si sale_items%rowtype;
  v_amount numeric := 0; v_line numeric; v_refund uuid; v_shift uuid; v_approver uuid; v_q numeric;
begin
  select * into v_s from sales where id = p_sale for update;
  if v_s.id is null then raise exception 'unknown_sale'; end if;
  if v_s.status in ('voided', 'refunded') then raise exception 'not_refundable'; end if;
  v_me := my_member_id(v_s.organization_id);
  if v_me is null then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not member_has_branch(v_me, v_s.branch_id) then raise exception 'branch_not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  -- amounts (pro-rata of what the customer actually paid for the line)
  for it in select * from jsonb_array_elements(p_items) loop
    v_q := (it->>'quantity')::numeric;
    if v_q is null or v_q <= 0 then continue; end if;
    select * into v_si from sale_items where id = (it->>'sale_item_id')::uuid and sale_id = p_sale for update;
    if v_si.id is null or v_q > v_si.quantity - v_si.refunded_quantity then raise exception 'refund_quantity_too_high'; end if;
    v_amount := v_amount + round2(v_si.line_total * v_q / v_si.quantity);
  end loop;
  if v_amount <= 0 then raise exception 'nothing_to_refund'; end if;

  select * into v_member from business_members where id = v_me;
  select * into v_role from roles where id = v_member.role_id;
  if not v_member.is_owner and (not member_has_perm(v_me, 'sales.refund') or v_amount > v_role.max_refund_amount) then
    v_approver := consume_approval(p_approval, v_s.organization_id, 'refund', v_amount, p_sale);
  end if;

  if p_terminal is not null then v_shift := my_open_shift(p_terminal); end if;
  if p_method = 'cash' and v_shift is null then
    select id into v_shift from shifts where member_id = v_me and status = 'open' order by opened_at desc limit 1;
  end if;

  insert into refunds (organization_id, original_sale_id, shift_id, amount, method, status, reason, restocked, actor_id, approval_id)
  values (v_s.organization_id, p_sale, v_shift, v_amount, p_method, case when p_method = 'cash' then 'recorded' else 'pending' end::payment_status,
          p_reason, p_restock, v_me, p_approval)
  returning id into v_refund;

  for it in select * from jsonb_array_elements(p_items) loop
    v_q := (it->>'quantity')::numeric;
    if v_q is null or v_q <= 0 then continue; end if;
    select * into v_si from sale_items where id = (it->>'sale_item_id')::uuid;
    v_line := round2(v_si.line_total * v_q / v_si.quantity);
    insert into refund_items (refund_id, sale_item_id, quantity, amount) values (v_refund, v_si.id, v_q, v_line);
    update sale_items set refunded_quantity = refunded_quantity + v_q where id = v_si.id;
    if p_restock then
      perform apply_stock(v_s.organization_id, v_s.branch_id, v_si.product_id, v_si.variant_id, v_q, 'return',
                          'Refund ' || v_s.receipt_number || ': ' || p_reason, 'refund', v_refund, v_me);
    end if;
  end loop;

  update sales set refunded_total = refunded_total + v_amount,
    status = case when (select bool_and(refunded_quantity >= quantity) from sale_items where sale_id = p_sale) then 'refunded' else 'partially_refunded' end::sale_status
  where id = p_sale;
  if v_s.customer_id is not null then update customers set total_spend = greatest(0, total_spend - v_amount) where id = v_s.customer_id; end if;

  perform audit(v_s.organization_id, v_me, 'refund', 'Issued refund', v_s.receipt_number || ' · ' || p_reason, v_amount, v_s.branch_id, p_terminal, 'sale', p_sale,
                jsonb_build_object('approved_by', v_approver, 'restocked', p_restock));
  perform notify(v_s.organization_id, 'refund', 'Refund issued', v_amount || ' on ' || v_s.receipt_number, null, 'sales.view_all');
  return v_refund;
end $$;

create function void_sale(p_sale uuid, p_reason text, p_approval uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_s sales%rowtype; v_me uuid; r record;
begin
  select * into v_s from sales where id = p_sale for update;
  if v_s.id is null or v_s.status <> 'completed' or v_s.refunded_total > 0 then raise exception 'not_voidable'; end if;
  v_me := my_member_id(v_s.organization_id);
  if v_me is null or not member_has_branch(v_me, v_s.branch_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if not member_has_perm(v_me, 'sales.void') then perform consume_approval(p_approval, v_s.organization_id, 'void', v_s.total, p_sale); end if;

  for r in select product_id, variant_id, sum(quantity) q from sale_items where sale_id = p_sale group by 1, 2 loop
    perform apply_stock(v_s.organization_id, v_s.branch_id, r.product_id, r.variant_id, r.q, 'void', 'Void ' || v_s.receipt_number, 'sale', p_sale, v_me);
  end loop;
  update sales set status = 'voided', void_reason = p_reason, voided_by = v_me, voided_at = now() where id = p_sale;
  update payments set status = 'refunded' where sale_id = p_sale;
  if v_s.customer_id is not null then
    update customers set total_spend = greatest(0, total_spend - v_s.total), visits = greatest(0, visits - 1) where id = v_s.customer_id;
  end if;
  perform audit(v_s.organization_id, v_me, 'refund', 'Voided sale', v_s.receipt_number || ' · ' || p_reason, v_s.total, v_s.branch_id, v_s.terminal_id, 'sale', p_sale);
end $$;

-- ───────────── Held carts ─────────────
create function resume_held_cart(p_cart uuid, p_approval uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_c held_carts%rowtype; v_me uuid;
begin
  select * into v_c from held_carts where id = p_cart for update;
  if v_c.id is null then raise exception 'cart_not_found'; end if;
  v_me := require_perm(v_c.organization_id, 'pos.sell');
  if v_c.owner_id <> v_me and not member_has_perm(v_me, 'pos.take_over_cart') then
    perform consume_approval(p_approval, v_c.organization_id, 'take_over_cart', null, p_cart);
  end if;
  delete from held_carts where id = p_cart;
  return v_c.lines;
end $$;

-- ───────────── Products & stock ─────────────
-- p: product fields + opening_stock + branch_id + variants: [{label, sku, barcode, selling_price, opening_stock}]
create function create_product(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid := (p->>'organization_id')::uuid; v_me uuid := require_perm(v_org, 'products.manage'); v_id uuid; v_vid uuid; v jsonb;
begin
  insert into products (organization_id, category_id, name, brand, description, image_url, sku, barcode, cost_price, selling_price, unit, taxable, reorder_level)
  values (v_org, nullif(p->>'category_id', '')::uuid, trim(p->>'name'), nullif(p->>'brand', ''), nullif(p->>'description', ''), nullif(p->>'image_url', ''),
          trim(p->>'sku'), nullif(trim(p->>'barcode'), ''), round2((p->>'cost_price')::numeric), round2((p->>'selling_price')::numeric),
          coalesce(p->>'unit', 'pc'), coalesce((p->>'taxable')::boolean, true), coalesce((p->>'reorder_level')::numeric, 0))
  returning id into v_id;

  if coalesce((p->>'opening_stock')::numeric, 0) > 0 and p->>'branch_id' is not null then
    perform apply_stock(v_org, (p->>'branch_id')::uuid, v_id, null, (p->>'opening_stock')::numeric, 'opening', 'Opening stock', 'product', v_id, v_me);
  end if;
  for v in select * from jsonb_array_elements(coalesce(p->'variants', '[]')) loop
    insert into product_variants (organization_id, product_id, label, sku, barcode, selling_price)
    values (v_org, v_id, v->>'label', v->>'sku', nullif(v->>'barcode', ''), (v->>'selling_price')::numeric) returning id into v_vid;
    if coalesce((v->>'opening_stock')::numeric, 0) > 0 and p->>'branch_id' is not null then
      perform apply_stock(v_org, (p->>'branch_id')::uuid, v_id, v_vid, (v->>'opening_stock')::numeric, 'opening', 'Opening stock', 'product', v_id, v_me);
    end if;
  end loop;
  perform audit(v_org, v_me, 'stock', 'Created product', p->>'name', null, (p->>'branch_id')::uuid, null, 'product', v_id);
  return v_id;
end $$;

-- mode: add | remove | set
create function adjust_stock(p_branch uuid, p_product uuid, p_mode text, p_quantity numeric, p_reason text, p_variant uuid default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_org uuid := (select organization_id from branches where id = p_branch); v_me uuid; v_cur numeric; v_delta numeric; v_after numeric;
begin
  v_me := require_perm(v_org, 'inventory.adjust');
  if not member_has_branch(v_me, p_branch) then raise exception 'branch_not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_quantity < 0 then raise exception 'invalid_quantity'; end if;
  select coalesce(quantity, 0) into v_cur from inventory where branch_id = p_branch and product_id = p_product and variant_id is not distinct from p_variant;
  v_cur := coalesce(v_cur, 0);
  v_delta := case p_mode when 'add' then p_quantity when 'remove' then -p_quantity when 'set' then p_quantity - v_cur else null end;
  if v_delta is null then raise exception 'invalid_mode'; end if;
  if v_delta = 0 then return v_cur; end if;
  v_after := apply_stock(v_org, p_branch, p_product, p_variant, v_delta,
                         case when lower(p_reason) like 'damaged%' or lower(p_reason) like 'expired%' then 'damaged' else 'adjustment' end::movement_type,
                         p_reason, 'adjustment', null, v_me, false);
  perform audit(v_org, v_me, 'stock', 'Stock adjustment',
                (select name from products where id = p_product) || ': ' || v_cur || ' → ' || v_after || ' (' || p_reason || ')', null, p_branch, null, 'product', p_product);
  return v_after;
end $$;

-- Scan-to-receive: add stock to a branch (optionally updating the cost price).
create function receive_stock(p_branch uuid, p_product uuid, p_quantity numeric, p_unit_cost numeric default null, p_reference text default null, p_variant uuid default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_org uuid := (select organization_id from branches where id = p_branch); v_me uuid; v_after numeric;
begin
  v_me := require_perm(v_org, 'inventory.adjust');
  if not member_has_branch(v_me, p_branch) then raise exception 'branch_not_allowed' using errcode = '42501'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  v_after := apply_stock(v_org, p_branch, p_product, p_variant, p_quantity, 'receipt', coalesce(p_reference, 'Received'), 'receipt', null, v_me);
  if p_unit_cost is not null and p_unit_cost >= 0 then update products set cost_price = round2(p_unit_cost) where id = p_product; end if;
  perform audit(v_org, v_me, 'stock', 'Received stock', (select name from products where id = p_product) || ' +' || p_quantity || coalesce(' · ' || p_reference, ''), null, p_branch, null, 'product', p_product);
  return v_after;
end $$;

create function create_transfer(p_from uuid, p_to uuid, p_items jsonb, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid := (select organization_id from branches where id = p_from); v_me uuid; v_id uuid; v_no text; it jsonb;
begin
  v_me := require_perm(v_org, 'inventory.transfer');
  if not member_has_branch(v_me, p_from) then raise exception 'branch_not_allowed' using errcode = '42501'; end if;
  if (select organization_id from branches where id = p_to) <> v_org then raise exception 'invalid_branch'; end if;
  select 'TR-' || lpad((count(*) + 1)::text, 4, '0') into v_no from stock_transfers where organization_id = v_org;
  insert into stock_transfers (organization_id, number, from_branch_id, to_branch_id, note, dispatched_by)
  values (v_org, v_no, p_from, p_to, p_note, v_me) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into stock_transfer_items values (v_id, (it->>'product_id')::uuid, (it->>'quantity')::numeric);
    perform apply_stock(v_org, p_from, (it->>'product_id')::uuid, null, -(it->>'quantity')::numeric, 'transfer_out',
                        'To ' || (select name from branches where id = p_to) || ' (' || v_no || ')', 'transfer', v_id, v_me, false);
  end loop;
  perform audit(v_org, v_me, 'stock', 'Dispatched transfer', v_no, null, p_from, null, 'transfer', v_id);
  return v_id;
end $$;

create function receive_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t stock_transfers%rowtype; v_me uuid; it record;
begin
  select * into v_t from stock_transfers where id = p_transfer and status = 'dispatched' for update;
  if v_t.id is null then raise exception 'transfer_not_open'; end if;
  v_me := require_perm(v_t.organization_id, 'inventory.transfer');
  if not member_has_branch(v_me, v_t.to_branch_id) then raise exception 'branch_not_allowed' using errcode = '42501'; end if;
  for it in select * from stock_transfer_items where transfer_id = p_transfer loop
    perform apply_stock(v_t.organization_id, v_t.to_branch_id, it.product_id, null, it.quantity, 'transfer_in',
                        'From ' || (select name from branches where id = v_t.from_branch_id) || ' (' || v_t.number || ')', 'transfer', p_transfer, v_me);
  end loop;
  update stock_transfers set status = 'received', received_by = v_me, received_at = now() where id = p_transfer;
  perform audit(v_t.organization_id, v_me, 'stock', 'Received transfer', v_t.number, null, v_t.to_branch_id, null, 'transfer', p_transfer);
end $$;

-- ───────────── Purchasing ─────────────
-- p: { organization_id, supplier_id, branch_id, expected_at?, place: bool, lines: [{product_id, quantity, unit_cost}] }
create function save_purchase_order(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid := (p->>'organization_id')::uuid; v_me uuid := require_perm(v_org, 'purchases.manage'); v_id uuid; v_no text; l jsonb;
begin
  select 'PO-' || lpad((count(*) + 1)::text, 4, '0') into v_no from purchase_orders where organization_id = v_org;
  insert into purchase_orders (organization_id, branch_id, supplier_id, number, status, expected_at, created_by)
  values (v_org, (p->>'branch_id')::uuid, (p->>'supplier_id')::uuid, v_no,
          case when (p->>'place')::boolean then 'ordered' else 'draft' end::po_status, nullif(p->>'expected_at', '')::date, v_me)
  returning id into v_id;
  for l in select * from jsonb_array_elements(p->'lines') loop
    insert into purchase_items (purchase_order_id, product_id, quantity, unit_cost)
    values (v_id, (l->>'product_id')::uuid, (l->>'quantity')::numeric, round2((l->>'unit_cost')::numeric));
  end loop;
  perform audit(v_org, v_me, 'stock', 'Created purchase order', v_no, null, (p->>'branch_id')::uuid, null, 'purchase_order', v_id);
  return v_id;
end $$;

create function set_purchase_order_status(p_po uuid, p_status po_status) returns void
language plpgsql security definer set search_path = public as $$
declare v_po purchase_orders%rowtype; v_me uuid;
begin
  select * into v_po from purchase_orders where id = p_po;
  v_me := require_perm(v_po.organization_id, 'purchases.manage');
  if p_status not in ('ordered', 'cancelled') or v_po.status in ('received', 'cancelled') then raise exception 'invalid_status_change'; end if;
  update purchase_orders set status = p_status where id = p_po;
  perform audit(v_po.organization_id, v_me, 'stock', 'Purchase order ' || p_status::text, v_po.number, null, v_po.branch_id);
end $$;

-- p_lines: [{ item_id, quantity }]
create function receive_purchase_order(p_po uuid, p_lines jsonb, p_reference text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_po purchase_orders%rowtype; v_me uuid; l jsonb; v_it purchase_items%rowtype; v_q numeric;
begin
  select * into v_po from purchase_orders where id = p_po for update;
  if v_po.status not in ('ordered', 'partially_received') then raise exception 'not_receivable'; end if;
  v_me := require_perm(v_po.organization_id, 'purchases.manage');
  for l in select * from jsonb_array_elements(p_lines) loop
    v_q := (l->>'quantity')::numeric;
    if v_q is null or v_q <= 0 then continue; end if;
    select * into v_it from purchase_items where id = (l->>'item_id')::uuid and purchase_order_id = p_po for update;
    if v_it.id is null then raise exception 'unknown_item'; end if;
    update purchase_items set received_quantity = received_quantity + v_q where id = v_it.id;
    perform apply_stock(v_po.organization_id, v_po.branch_id, v_it.product_id, null, v_q, 'receipt', v_po.number || coalesce(' · ' || p_reference, ''), 'purchase_order', p_po, v_me);
    update products set cost_price = v_it.unit_cost where id = v_it.product_id;
  end loop;
  update purchase_orders set supplier_reference = coalesce(p_reference, supplier_reference),
    status = case when (select bool_and(received_quantity >= quantity) from purchase_items where purchase_order_id = p_po) then 'received' else 'partially_received' end::po_status
  where id = p_po;
  perform audit(v_po.organization_id, v_me, 'stock', 'Received purchase order', v_po.number, null, v_po.branch_id, null, 'purchase_order', p_po);
  perform notify(v_po.organization_id, 'purchase', v_po.number || ' received', 'Stock added to ' || (select name from branches where id = v_po.branch_id), null, 'purchases.manage');
end $$;

-- ───────────── Expenses ─────────────
create function void_expense(p_expense uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_e expenses%rowtype; v_me uuid;
begin
  select * into v_e from expenses where id = p_expense and status = 'recorded';
  if v_e.id is null then raise exception 'not_voidable'; end if;
  v_me := require_perm(v_e.organization_id, 'expenses.void');
  update expenses set status = 'voided', void_reason = p_reason where id = p_expense;
  perform audit(v_e.organization_id, v_me, 'settings', 'Voided expense', v_e.description || ' · ' || p_reason, v_e.amount, v_e.branch_id);
end $$;

-- ───────────── Employees & roles ─────────────
-- SERVICE ROLE ONLY (employee-admin Edge Function): create the membership after the auth user exists.
create function create_member_record(p_org uuid, p_user uuid, p_actor uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; b uuid; v_plan subscription_plans%rowtype; v_used int;
begin
  select pl.* into v_plan from business_subscriptions s join subscription_plans pl on pl.id = s.plan_id where s.organization_id = p_org;
  select count(*) into v_used from business_members where organization_id = p_org and status <> 'deactivated';
  if v_plan.id is not null and v_used >= v_plan.max_members then raise exception 'seat_limit_reached'; end if;
  if (select key from roles where id = (p->>'role_id')::uuid and organization_id = p_org) is null then raise exception 'invalid_role'; end if;
  if (select key from roles where id = (p->>'role_id')::uuid) = 'owner' then raise exception 'cannot_assign_owner'; end if;

  insert into business_members (organization_id, user_id, role_id, full_name, display_name, email, phone, employee_code, status, hire_date, avatar_color)
  values (p_org, p_user, (p->>'role_id')::uuid, trim(p->>'full_name'), coalesce(nullif(trim(p->>'display_name'), ''), split_part(trim(p->>'full_name'), ' ', 1)),
          nullif(p->>'email', ''), p->>'phone', coalesce(nullif(p->>'employee_code', ''), next_employee_code(p_org)),
          case when (p->>'invite_method') = 'email' then 'invited' else 'active' end::member_status,
          coalesce(nullif(p->>'hire_date', '')::date, current_date),
          (array['bg-brand-600','bg-violet-600','bg-emerald-600','bg-amber-600','bg-sky-600','bg-rose-600','bg-teal-600','bg-fuchsia-600'])[1 + floor(random() * 8)::int])
  returning id into v_id;
  for b in select (jsonb_array_elements_text(p->'branch_ids'))::uuid loop
    insert into member_branch_access values (v_id, b);
  end loop;
  insert into profiles (id, full_name, phone) values (p_user, p->>'full_name', p->>'phone') on conflict (id) do nothing;
  perform audit(p_org, p_actor, 'employee', 'Added employee', p->>'full_name', null, null, null, 'member', v_id);
  return v_id;
end $$;

-- Invited user accepted & set password → activate (called by the user themselves).
create function accept_invite() returns void
language sql security definer set search_path = public as $$
  update business_members set status = 'active' where user_id = auth.uid() and status = 'invited'
$$;

create function update_member_profile(p_member uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := member_org(p_member); v_me uuid;
begin
  v_me := require_perm(v_org, 'employees.manage', true);
  update business_members set
    full_name = coalesce(nullif(trim(p->>'full_name'), ''), full_name),
    display_name = coalesce(nullif(trim(p->>'display_name'), ''), display_name),
    phone = coalesce(p->>'phone', phone),
    email = coalesce(p->>'email', email),
    employee_code = coalesce(nullif(p->>'employee_code', ''), employee_code),
    hire_date = coalesce(nullif(p->>'hire_date', '')::date, hire_date)
  where id = p_member;
  perform audit(v_org, v_me, 'employee', 'Updated employee', (select full_name from business_members where id = p_member), null, null, null, 'member', p_member);
end $$;

-- Role, per-employee overrides and branch access in one go.
create function save_member_access(p_member uuid, p_role uuid, p_overrides jsonb, p_branches uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := member_org(p_member); v_me uuid; v_m business_members%rowtype; o jsonb; v_before jsonb;
begin
  v_me := require_perm(v_org, 'employees.manage', true);
  select * into v_m from business_members where id = p_member;
  if v_m.is_owner then raise exception 'owner_access_cannot_change'; end if;
  if (select key from roles where id = p_role and organization_id = v_org) in ('owner') or not exists (select 1 from roles where id = p_role and organization_id = v_org) then
    raise exception 'invalid_role';
  end if;
  if coalesce(array_length(p_branches, 1), 0) = 0 then raise exception 'branch_required'; end if;
  if p_overrides is not null and jsonb_array_length(p_overrides) > 0 and not member_has_perm(v_me, 'roles.manage') then
    raise exception 'permission_denied: roles.manage' using errcode = '42501';
  end if;

  v_before := jsonb_build_object('role', v_m.role_id,
    'overrides', (select coalesce(jsonb_agg(jsonb_build_object('permission', permission_key, 'effect', effect)), '[]') from member_permission_overrides where member_id = p_member),
    'branches', (select coalesce(jsonb_agg(branch_id), '[]') from member_branch_access where member_id = p_member));

  update business_members set role_id = p_role where id = p_member;
  delete from member_permission_overrides where member_id = p_member;
  for o in select * from jsonb_array_elements(coalesce(p_overrides, '[]')) loop
    insert into member_permission_overrides (member_id, permission_key, effect, set_by) values (p_member, o->>'permission', o->>'effect', v_me);
  end loop;
  delete from member_branch_access where member_id = p_member;
  insert into member_branch_access select p_member, unnest(p_branches);

  perform audit(v_org, v_me, 'employee', 'Changed access', v_m.full_name, null, null, null, 'member', p_member,
                jsonb_build_object('before', v_before, 'after', jsonb_build_object('role', p_role, 'overrides', p_overrides, 'branches', to_jsonb(p_branches))));
end $$;

-- Status changes. Auth-level ban is applied by the employee-admin Edge Function as well.
create function set_member_status(p_member uuid, p_status member_status, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := member_org(p_member); v_me uuid; v_m business_members%rowtype;
begin
  v_me := require_perm(v_org, 'employees.manage', true);
  select * into v_m from business_members where id = p_member;
  if v_m.is_owner then raise exception 'owner_cannot_be_changed'; end if;
  if p_member = v_me then raise exception 'cannot_change_own_status'; end if;
  if p_status in ('suspended', 'deactivated') and coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update business_members set status = p_status,
    deactivated_at = case when p_status = 'deactivated' then now() else null end,
    deactivated_by = case when p_status = 'deactivated' then v_me else null end,
    signed_out_at = case when p_status in ('suspended', 'deactivated') then now() else signed_out_at end
  where id = p_member;
  update terminal_sessions set ended_at = now(), end_reason = 'forced' where member_id = p_member and ended_at is null;
  perform audit(v_org, v_me, 'employee',
                case p_status when 'active' then 'Reactivated employee' when 'suspended' then 'Suspended employee' else 'Deactivated employee' end,
                v_m.full_name || coalesce(' — ' || p_reason, ''), null, null, null, 'member', p_member);
end $$;

create function force_sign_out(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := member_org(p_member); v_me uuid; v_user uuid;
begin
  v_me := require_perm(v_org, 'employees.manage', true);
  update business_members set signed_out_at = now() where id = p_member returning user_id into v_user;
  update terminal_sessions set ended_at = now(), end_reason = 'forced' where member_id = p_member and ended_at is null;
  begin
    delete from auth.sessions where user_id = v_user;   -- revokes refresh tokens
  exception when others then null;                      -- access tokens are still rejected via signed_out_at
  end;
  perform audit(v_org, v_me, 'employee', 'Signed out everywhere', (select full_name from business_members where id = p_member), null, null, null, 'member', p_member);
end $$;

create function transfer_ownership(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := member_org(p_member); v_me uuid := my_member_id(member_org(p_member)); v_admin uuid;
begin
  if v_me is null or not (select is_owner from business_members where id = v_me) then raise exception 'owner_only' using errcode = '42501'; end if;
  if not is_password_session() then raise exception 'password_required' using errcode = '42501'; end if;
  if (select status from business_members where id = p_member) <> 'active' then raise exception 'member_not_active'; end if;
  select id into v_admin from roles where organization_id = v_org and key = 'admin';
  update business_members set is_owner = false, role_id = v_admin where id = v_me;
  update business_members set is_owner = true, role_id = (select id from roles where organization_id = v_org and key = 'owner') where id = p_member;
  update businesses set owner_user_id = (select user_id from business_members where id = p_member) where id = v_org;
  perform audit(v_org, v_me, 'employee', 'Transferred ownership', (select full_name from business_members where id = p_member));
end $$;

-- p: { id?, organization_id, name, description, max_discount_percent, max_refund_amount, allow_no_sale, permissions: [] }
create function save_role(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid := (p->>'organization_id')::uuid; v_me uuid := require_perm(v_org, 'roles.manage', true); v_id uuid := nullif(p->>'id', '')::uuid; v_key text;
begin
  if v_id is not null then
    select key into v_key from roles where id = v_id and organization_id = v_org;
    if v_key is null then raise exception 'unknown_role'; end if;
    if v_key = 'owner' then raise exception 'owner_role_locked'; end if;
    update roles set name = p->>'name', description = coalesce(p->>'description', ''),
      max_discount_percent = coalesce((p->>'max_discount_percent')::numeric, 0), max_refund_amount = coalesce((p->>'max_refund_amount')::numeric, 0),
      allow_no_sale = coalesce((p->>'allow_no_sale')::boolean, false)
    where id = v_id;
  else
    insert into roles (organization_id, key, name, description, max_discount_percent, max_refund_amount, allow_no_sale)
    values (v_org, 'custom_' || substr(md5(random()::text), 1, 8), p->>'name', coalesce(p->>'description', ''),
            coalesce((p->>'max_discount_percent')::numeric, 0), coalesce((p->>'max_refund_amount')::numeric, 0), coalesce((p->>'allow_no_sale')::boolean, false))
    returning id into v_id;
  end if;
  delete from role_permissions where role_id = v_id;
  insert into role_permissions (role_id, permission_key)
  select v_id, k from jsonb_array_elements_text(coalesce(p->'permissions', '[]')) k where exists (select 1 from permissions where key = k);
  perform audit(v_org, v_me, 'employee', 'Saved role', p->>'name', null, null, null, 'role', v_id, jsonb_build_object('permissions', p->'permissions'));
  return v_id;
end $$;

create function delete_role(p_role uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_r roles%rowtype; v_me uuid;
begin
  select * into v_r from roles where id = p_role;
  v_me := require_perm(v_r.organization_id, 'roles.manage', true);
  if v_r.is_system then raise exception 'system_role_locked'; end if;
  if exists (select 1 from business_members where role_id = p_role) then raise exception 'role_in_use'; end if;
  delete from roles where id = p_role;
  perform audit(v_r.organization_id, v_me, 'employee', 'Deleted role', v_r.name);
end $$;

-- ───────────── Settings & notifications ─────────────
create function save_settings(p_org uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := require_perm(p_org, 'settings.manage', true);
begin
  update businesses set
    name = coalesce(nullif(p->>'name', ''), name), category = coalesce(p->>'category', category), phone = coalesce(p->>'phone', phone),
    email = coalesce(p->>'email', email), address = coalesce(p->>'address', address), tin = coalesce(p->>'tin', tin),
    registration_no = coalesce(p->>'registration_no', registration_no), logo_url = coalesce(p->>'logo_url', logo_url),
    timezone = coalesce(p->>'timezone', timezone),
    settings = settings || coalesce(p->'settings', '{}')
  where id = p_org;
  perform audit(p_org, v_me, 'settings', 'Updated settings', array_to_string(array(select jsonb_object_keys(coalesce(p->'settings', '{}') || (p - 'settings'))), ', '));
end $$;

create function mark_notifications_read(p_org uuid, p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_by = array_append(read_by, my_member_id(p_org))
  where organization_id = p_org and is_member(p_org)
    and (p_ids is null or id = any (p_ids))
    and not (my_member_id(p_org) = any (read_by))
$$;
