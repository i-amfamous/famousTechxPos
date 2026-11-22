-- ════════════════════════════════════════════════════════════════════════════
--  Permissions catalogue, access helpers and Row Level Security
-- ════════════════════════════════════════════════════════════════════════════

insert into permissions (key, label, module, sensitive, sort) values
  ('pos.sell',              'Use POS and create sales',                 'POS', false, 1),
  ('pos.discount',          'Apply discounts (within limit)',           'POS', false, 2),
  ('pos.price_override',    'Override item price',                      'POS', true,  3),
  ('pos.no_sale',           'Open drawer without a sale',               'POS', true,  4),
  ('pos.take_over_cart',    'Resume another employee''s held cart',     'POS', false, 5),
  ('pos.approve',           'Approve actions for other employees',      'POS', true,  6),
  ('shift.open_close',      'Open and close own shift',                 'Shifts', false, 10),
  ('shift.cash_movement',   'Record cash in / out',                     'Shifts', false, 11),
  ('shift.view_all',        'View all shifts and Z reports',            'Shifts', false, 12),
  ('sales.view_own',        'View own sales',                           'Sales', false, 20),
  ('sales.view_all',        'View all sales',                           'Sales', false, 21),
  ('sales.refund',          'Issue refunds (within limit)',             'Sales', true,  22),
  ('sales.void',            'Void sales',                               'Sales', true,  23),
  ('products.view',         'View products',                            'Products', false, 30),
  ('products.manage',       'Create and edit products',                 'Products', false, 31),
  ('inventory.adjust',      'Adjust and receive stock',                 'Inventory', true, 40),
  ('inventory.transfer',    'Transfer stock between branches',          'Inventory', false, 41),
  ('customers.manage',      'Create and edit customers',                'Customers', false, 50),
  ('employees.view',        'View employees',                           'Employees', false, 60),
  ('employees.manage',      'Add, edit and deactivate employees',       'Employees', true, 61),
  ('roles.manage',          'Edit roles and permissions',               'Employees', true, 62),
  ('activity.view',         'View activity log',                        'Employees', false, 63),
  ('expenses.manage',       'Record expenses',                          'Expenses', false, 70),
  ('expenses.void',         'Void expenses',                            'Expenses', true, 71),
  ('purchases.manage',      'Manage suppliers and purchase orders',     'Purchases', false, 80),
  ('reports.view',          'View reports',                             'Reports', true, 90),
  ('branches.manage',       'Manage branches',                          'Branches', true, 100),
  ('settings.manage',       'Manage business settings and tills',       'Settings', true, 110);

insert into subscription_plans (id, name, max_members, max_branches, price_month) values
  ('starter', 'Starter', 3, 1, 0),
  ('business', 'Business', 10, 3, 0),
  ('enterprise', 'Enterprise', 1000, 100, 0);

-- ───────────── Settings with defaults ─────────────
create function app_settings(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pin_length', 4, 'auto_lock_minutes', 5, 'pin_max_attempts', 5, 'pin_lock_minutes', 15,
    'pin_every_sale', false, 'notify_pin_lockouts', true,
    'shared_drawer', false, 'require_shift', true, 'variance_threshold', 10, 'flag_shift_hours', 12,
    'block_negative_stock', true,
    'tax_rate', 0, 'prices_include_tax', true, 'receipt_footer', 'Thank you for shopping with us!',
    'receipt_paper', '80'
  ) || coalesce((select settings from businesses where id = p_org), '{}'::jsonb)
$$;

-- ───────────── Who is calling? ─────────────
-- True when the caller's access token came from a password sign-in (not a POS PIN session).
create function is_password_session() returns boolean
language sql stable as $$
  select coalesce(
    exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e where e ->> 'method' = 'password'),
    false)
$$;

-- The caller's active membership in a business (null if none / suspended / force-signed-out).
create function my_member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.id from business_members m
  where m.organization_id = p_org
    and m.user_id = auth.uid()
    and m.status = 'active'
    and (m.signed_out_at is null
         or coalesce((auth.jwt() ->> 'iat')::bigint, 0) > extract(epoch from m.signed_out_at)::bigint)
$$;

create function is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select my_member_id(p_org) is not null
$$;

-- Permission check for any member (owner ⇒ everything; overrides beat the role).
create function member_has_perm(p_member uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when m.is_owner then true
    when o.effect is not null then o.effect = 'grant'
    else exists (select 1 from role_permissions rp where rp.role_id = m.role_id and rp.permission_key = p_perm)
  end
  from business_members m
  left join member_permission_overrides o on o.member_id = m.id and o.permission_key = p_perm
  where m.id = p_member and m.status = 'active'
$$;

create function has_perm(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(member_has_perm(my_member_id(p_org), p_perm), false)
$$;

create function member_has_branch(p_member uuid, p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members m where m.id = p_member and m.is_owner)
      or exists (select 1 from member_branch_access a where a.member_id = p_member and a.branch_id = p_branch)
$$;

create function has_branch(p_org uuid, p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(member_has_branch(my_member_id(p_org), p_branch), false)
$$;

-- Effective permissions for the caller (used by the UI to show/hide things).
create function my_permissions(p_org uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.key order by p.sort), '{}')
  from permissions p where member_has_perm(my_member_id(p_org), p.key)
$$;

-- Internal guard used by RPCs: raises unless the caller holds the permission.
create function require_perm(p_org uuid, p_perm text, p_password boolean default false) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_member uuid := my_member_id(p_org);
begin
  if v_member is null then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not member_has_perm(v_member, p_perm) then
    raise exception 'permission_denied: %', p_perm using errcode = '42501';
  end if;
  if p_password and not is_password_session() then
    raise exception 'password_required: sign in with your password to do this' using errcode = '42501';
  end if;
  return v_member;
end $$;

create function audit(p_org uuid, p_actor uuid, p_category text, p_action text, p_detail text,
                      p_amount numeric default null, p_branch uuid default null, p_terminal uuid default null,
                      p_entity_type text default null, p_entity_id uuid default null, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (organization_id, actor_id, category, action, detail, amount, branch_id, terminal_id, entity_type, entity_id, metadata)
  values (p_org, p_actor, p_category, p_action, coalesce(p_detail, ''), p_amount, p_branch, p_terminal, p_entity_type, p_entity_id, p_meta)
$$;

create function notify(p_org uuid, p_type text, p_title text, p_body text, p_member uuid default null, p_perm text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (organization_id, member_id, audience_perm, type, title, body)
  values (p_org, p_member, p_perm, p_type, p_title, coalesce(p_body, ''))
$$;

-- ───────────── Row Level Security ─────────────
do $$ declare t text; begin
  foreach t in array array[
    'businesses','profiles','branches','permissions','roles','role_permissions','business_members','member_branch_access',
    'member_permission_overrides','member_pins','pos_terminals','terminal_sessions','sign_in_events','categories','products',
    'product_variants','inventory','stock_movements','barcode_cache','customers','shifts','approvals','cash_movements','sales',
    'sale_items','payments','refunds','refund_items','held_carts','suppliers','purchase_orders','purchase_items',
    'stock_transfers','stock_transfer_items','expenses','notifications','audit_logs','subscription_plans',
    'business_subscriptions','platform_admins'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Reference data
create policy read_all on permissions for select to authenticated using (true);
create policy read_all on subscription_plans for select to authenticated using (true);
create policy read_all on barcode_cache for select to authenticated using (true);

-- Business
create policy member_read on businesses for select to authenticated using (is_member(id));
create policy settings_update on businesses for update to authenticated
  using (has_perm(id, 'settings.manage') and is_password_session())
  with check (has_perm(id, 'settings.manage') and is_password_session());
create policy member_read on business_subscriptions for select to authenticated using (is_member(organization_id));

create policy own_read on profiles for select to authenticated using (id = auth.uid());
create policy own_write on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy own_insert on profiles for insert to authenticated with check (id = auth.uid());

create policy member_read on branches for select to authenticated using (is_member(organization_id));
create policy manage on branches for insert to authenticated with check (has_perm(organization_id, 'branches.manage') and is_password_session());
create policy manage_update on branches for update to authenticated
  using (has_perm(organization_id, 'branches.manage') and is_password_session())
  with check (has_perm(organization_id, 'branches.manage'));

-- People (writes go through RPCs / Edge Functions)
create policy member_read on roles for select to authenticated using (is_member(organization_id));
create policy member_read on role_permissions for select to authenticated
  using (exists (select 1 from roles r where r.id = role_id and is_member(r.organization_id)));
create policy member_read on business_members for select to authenticated using (is_member(organization_id) or user_id = auth.uid());
create policy member_read on member_branch_access for select to authenticated
  using (exists (select 1 from business_members m where m.id = member_id and is_member(m.organization_id)));
create policy member_read on member_permission_overrides for select to authenticated
  using (exists (select 1 from business_members m where m.id = member_id and is_member(m.organization_id)));
-- member_pins: intentionally no policies - never readable or writable by clients.

create policy member_read on pos_terminals for select to authenticated using (is_member(organization_id));
create policy staff_read on terminal_sessions for select to authenticated
  using (has_perm(organization_id, 'employees.view') or member_id = my_member_id(organization_id));
create policy staff_read on sign_in_events for select to authenticated
  using (has_perm(organization_id, 'employees.view') or member_id = my_member_id(organization_id));

-- Catalogue
create policy member_read on categories for select to authenticated using (is_member(organization_id));
create policy manage on categories for all to authenticated
  using (has_perm(organization_id, 'products.manage')) with check (has_perm(organization_id, 'products.manage'));
create policy member_read on products for select to authenticated using (is_member(organization_id));
create policy manage_insert on products for insert to authenticated with check (has_perm(organization_id, 'products.manage'));
create policy manage_update on products for update to authenticated
  using (has_perm(organization_id, 'products.manage')) with check (has_perm(organization_id, 'products.manage'));
create policy member_read on product_variants for select to authenticated using (is_member(organization_id));
create policy manage on product_variants for all to authenticated
  using (has_perm(organization_id, 'products.manage')) with check (has_perm(organization_id, 'products.manage'));

create policy branch_read on inventory for select to authenticated using (has_branch(organization_id, branch_id));
create policy branch_read on stock_movements for select to authenticated using (has_branch(organization_id, branch_id));

-- Customers
create policy member_read on customers for select to authenticated using (is_member(organization_id));
create policy manage_insert on customers for insert to authenticated with check (has_perm(organization_id, 'customers.manage') or has_perm(organization_id, 'pos.sell'));
create policy manage_update on customers for update to authenticated
  using (has_perm(organization_id, 'customers.manage')) with check (has_perm(organization_id, 'customers.manage'));

-- Shifts & cash
create policy shift_read on shifts for select to authenticated
  using (has_branch(organization_id, branch_id)
         and (member_id = my_member_id(organization_id) or has_perm(organization_id, 'shift.view_all')));
create policy shift_read on cash_movements for select to authenticated
  using (exists (select 1 from shifts s where s.id = shift_id and has_branch(s.organization_id, s.branch_id)
                 and (s.member_id = my_member_id(s.organization_id) or has_perm(s.organization_id, 'shift.view_all'))));
create policy involved_read on approvals for select to authenticated
  using (has_perm(organization_id, 'activity.view')
         or requested_by = my_member_id(organization_id) or approved_by = my_member_id(organization_id));

-- Sales (writes only via checkout / refund / void RPCs)
create policy sales_read on sales for select to authenticated
  using (has_branch(organization_id, branch_id)
         and (has_perm(organization_id, 'sales.view_all') or cashier_id = my_member_id(organization_id)));
create policy sales_read on sale_items for select to authenticated using (exists (select 1 from sales s where s.id = sale_id));
create policy sales_read on payments for select to authenticated using (exists (select 1 from sales s where s.id = sale_id));
create policy sales_read on refunds for select to authenticated using (exists (select 1 from sales s where s.id = original_sale_id));
create policy sales_read on refund_items for select to authenticated using (exists (select 1 from refunds r where r.id = refund_id));

create policy branch_read on held_carts for select to authenticated using (has_branch(organization_id, branch_id));
create policy own_insert on held_carts for insert to authenticated
  with check (owner_id = my_member_id(organization_id) and has_branch(organization_id, branch_id));
create policy own_delete on held_carts for delete to authenticated
  using (owner_id = my_member_id(organization_id) or has_perm(organization_id, 'pos.take_over_cart'));

-- Purchasing
create policy member_read on suppliers for select to authenticated using (is_member(organization_id));
create policy manage on suppliers for all to authenticated
  using (has_perm(organization_id, 'purchases.manage')) with check (has_perm(organization_id, 'purchases.manage'));
create policy member_read on purchase_orders for select to authenticated using (is_member(organization_id));
create policy member_read on purchase_items for select to authenticated
  using (exists (select 1 from purchase_orders p where p.id = purchase_order_id));
create policy member_read on stock_transfers for select to authenticated
  using (has_branch(organization_id, from_branch_id) or has_branch(organization_id, to_branch_id));
create policy member_read on stock_transfer_items for select to authenticated
  using (exists (select 1 from stock_transfers t where t.id = transfer_id));

-- Expenses
create policy finance_read on expenses for select to authenticated
  using (has_branch(organization_id, branch_id)
         and (has_perm(organization_id, 'expenses.manage') or has_perm(organization_id, 'reports.view')));
create policy manage_insert on expenses for insert to authenticated
  with check (has_perm(organization_id, 'expenses.manage') and actor_id = my_member_id(organization_id)
              and status = 'recorded' and has_branch(organization_id, branch_id));

-- Notifications & audit
create policy audience_read on notifications for select to authenticated
  using (is_member(organization_id)
         and (member_id = my_member_id(organization_id)
              or (member_id is null and (audience_perm is null or has_perm(organization_id, audience_perm)))));
create policy audit_read on audit_logs for select to authenticated
  using (has_perm(organization_id, 'activity.view') or actor_id = my_member_id(organization_id));

-- Column-level: never expose terminal token hashes.
revoke select on pos_terminals from authenticated, anon;
grant select (id, organization_id, branch_id, name, code, status, registered_by, last_seen_at, created_at) on pos_terminals to authenticated;
revoke all on member_pins from authenticated, anon;
