-- ════════════════════════════════════════════════════════════════════════════
--  Dashboard & reports - every figure is derived from recorded data.
--  Revenue = sale totals − tax (when prices include tax) − refunds. Voided sales excluded.
--  Expenses are reported separately and never subtracted from sales.
-- ════════════════════════════════════════════════════════════════════════════

create function report_scope_ok(p_org uuid, p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member(p_org) and (p_branch is null and has_perm(p_org, 'reports.view') or (p_branch is not null and has_branch(p_org, p_branch)))
$$;

create function dashboard_summary(p_org uuid, p_branch uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_len interval := p_to - p_from;
  v_res jsonb;
  v_all boolean;
  v_me uuid := my_member_id(p_org);
begin
  if not report_scope_ok(p_org, p_branch) then raise exception 'permission_denied' using errcode = '42501'; end if;
  -- People without reports/all-sales access only see their own figures.
  v_all := has_perm(p_org, 'reports.view') or has_perm(p_org, 'sales.view_all');

  with s as (
    select * from sales
    where organization_id = p_org and status <> 'voided' and (p_branch is null or branch_id = p_branch)
      and (v_all or cashier_id = v_me)
  ),
  cur as (select * from s where created_at >= p_from and created_at < p_to),
  prev as (select * from s where created_at >= p_from - v_len and created_at < p_from)
  select jsonb_build_object(
    'revenue', (select coalesce(sum(total - case when (app_settings(p_org)->>'prices_include_tax')::boolean then tax_total else 0 end - refunded_total), 0) from cur),
    'prev_revenue', (select coalesce(sum(total - case when (app_settings(p_org)->>'prices_include_tax')::boolean then tax_total else 0 end - refunded_total), 0) from prev),
    'sales_count', (select count(*) from cur),
    'prev_sales_count', (select count(*) from prev),
    'gross_profit', (select coalesce(sum(total - tax_total - cost_total - refunded_total), 0) from cur),
    'expenses', (select coalesce(sum(amount), 0) from expenses where organization_id = p_org and status = 'recorded'
                 and (p_branch is null or branch_id = p_branch) and expense_date >= p_from::date and expense_date < p_to::date + 1
                 and (has_perm(p_org, 'expenses.manage') or has_perm(p_org, 'reports.view'))),
    'expense_count', (select count(*) from expenses where organization_id = p_org and status = 'recorded'
                 and (p_branch is null or branch_id = p_branch) and expense_date >= p_from::date and expense_date < p_to::date + 1),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', amt) order by amt desc), '[]') from (
        select p.method, sum(p.amount) as amt
        from payments p join cur on cur.id = p.sale_id group by p.method) m),
    'change_given', (select coalesce(sum(change_due), 0) from cur),
    'top_products', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
        select i.product_id, max(i.name_snapshot) as name, sum(i.quantity - i.refunded_quantity) as quantity, sum(i.line_total) as revenue
        from sale_items i join cur on cur.id = i.sale_id group by i.product_id order by revenue desc limit 5) t),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'value', coalesce(v, 0)) order by d), '[]') from (
        select d, (select sum(total - refunded_total) from cur where created_at::date = d::date) v
        from generate_series(date_trunc('day', greatest(p_from, p_to - interval '30 days')), date_trunc('day', p_to - interval '1 second'), interval '1 day') d) x),
    'on_shift', (select coalesce(jsonb_agg(jsonb_build_object('shift_id', sh.id, 'member_id', sh.member_id, 'full_name', m.full_name,
                    'avatar_color', m.avatar_color, 'terminal', t.name, 'opened_at', sh.opened_at,
                    'sales_total', (select coalesce(sum(total), 0) from sales where shift_id = sh.id and status <> 'voided'),
                    'sales_count', (select count(*) from sales where shift_id = sh.id and status <> 'voided'))), '[]')
                 from shifts sh join business_members m on m.id = sh.member_id join pos_terminals t on t.id = sh.terminal_id
                 where sh.organization_id = p_org and sh.status = 'open' and (p_branch is null or sh.branch_id = p_branch)),
    'low_stock', (select coalesce(jsonb_agg(x order by x.quantity), '[]') from (
        select pr.id, pr.name, coalesce(sum(inv.quantity), 0) as quantity, pr.reorder_level
        from products pr left join inventory inv on inv.product_id = pr.id and (p_branch is null or inv.branch_id = p_branch)
        where pr.organization_id = p_org and pr.status = 'active' and pr.unit <> 'job'
        group by pr.id having coalesce(sum(inv.quantity), 0) <= pr.reorder_level limit 8) x)
  ) into v_res;
  return v_res;
end $$;

create function employee_report(p_org uuid, p_branch uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(p_org, 'reports.view') or has_perm(p_org, 'employees.view')) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(r order by r.revenue desc), '[]') from (
    select m.id as member_id, m.full_name, m.avatar_color,
      count(s.id) filter (where s.status <> 'voided') as sales_count,
      coalesce(sum(s.total - s.refunded_total) filter (where s.status <> 'voided'), 0) as revenue,
      coalesce(avg(s.total) filter (where s.status <> 'voided'), 0) as avg_sale,
      coalesce(sum(s.discount_total) filter (where s.status <> 'voided'), 0) as discounts,
      (select coalesce(sum(amount), 0) from refunds rf where rf.actor_id = m.id and rf.created_at >= p_from and rf.created_at < p_to) as refunds,
      (select count(*) from approvals a where a.approved_by = m.id and a.created_at >= p_from and a.created_at < p_to) as approvals_given,
      (select coalesce(sum(variance), 0) from shifts sh where sh.member_id = m.id and sh.status = 'closed' and sh.closed_at >= p_from and sh.closed_at < p_to) as cash_variance,
      (select count(*) from shifts sh where sh.member_id = m.id and sh.status = 'closed' and sh.closed_at >= p_from and sh.closed_at < p_to) as shifts
    from business_members m
    left join sales s on s.cashier_id = m.id and s.created_at >= p_from and s.created_at < p_to and (p_branch is null or s.branch_id = p_branch)
    where m.organization_id = p_org and m.status <> 'deactivated'
    group by m.id
  ) r);
end $$;

create function employee_performance(p_member uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := member_org(p_member);
begin
  if not (has_perm(v_org, 'employees.view') or my_member_id(v_org) = p_member) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'revenue', (select coalesce(sum(total - refunded_total), 0) from sales where cashier_id = p_member and status <> 'voided' and created_at >= p_from and created_at < p_to),
    'sales_count', (select count(*) from sales where cashier_id = p_member and status <> 'voided' and created_at >= p_from and created_at < p_to),
    'avg_sale', (select coalesce(avg(total), 0) from sales where cashier_id = p_member and status <> 'voided' and created_at >= p_from and created_at < p_to),
    'discounts', (select coalesce(sum(discount_total), 0) from sales where cashier_id = p_member and status <> 'voided' and created_at >= p_from and created_at < p_to),
    'discounts_approved', (select count(*) from approvals where requested_by = p_member and action = 'discount' and created_at >= p_from and created_at < p_to),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'value', coalesce(v, 0)) order by d), '[]') from (
        select d, (select sum(total - refunded_total) from sales where cashier_id = p_member and status <> 'voided' and created_at::date = d::date) v
        from generate_series(date_trunc('day', p_from), date_trunc('day', p_to - interval '1 second'), interval '1 day') d) x),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'closed_at', closed_at, 'variance', variance) order by closed_at desc), '[]')
               from (select * from shifts where member_id = p_member and status = 'closed' order by closed_at desc limit 8) sh)
  );
end $$;

create function pnl_report(p_org uuid, p_branch uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_incl boolean := (app_settings(p_org)->>'prices_include_tax')::boolean;
begin
  if not has_perm(p_org, 'reports.view') then raise exception 'permission_denied' using errcode = '42501'; end if;
  return (
    with s as (select * from sales where organization_id = p_org and status <> 'voided' and created_at >= p_from and created_at < p_to
               and (p_branch is null or branch_id = p_branch))
    select jsonb_build_object(
      'gross_sales', coalesce(sum(subtotal), 0),
      'discounts', coalesce(sum(discount_total), 0),
      'refunds', coalesce(sum(refunded_total), 0),
      'tax_collected', coalesce(sum(tax_total), 0),
      'net_revenue', coalesce(sum(total - refunded_total - case when v_incl then tax_total else 0 end), 0),
      'cogs', coalesce(sum(cost_total), 0),
      'gross_profit', coalesce(sum(total - refunded_total - case when v_incl then tax_total else 0 end - cost_total), 0),
      'operating_expenses', (select coalesce(sum(amount), 0) from expenses where organization_id = p_org and status = 'recorded'
                             and expense_date >= p_from::date and expense_date < p_to::date + 1 and (p_branch is null or branch_id = p_branch)),
      'sales_count', count(*)
    ) from s);
end $$;

-- Stock levels per product for a branch (joins inventory so the UI gets one row per product).
create function stock_levels(p_org uuid, p_branch uuid) returns table (
  product_id uuid, name text, sku text, barcode text, unit text, reorder_level numeric, cost_price numeric, selling_price numeric, quantity numeric)
language sql stable security definer set search_path = public as $$
  select pr.id, pr.name, pr.sku, pr.barcode, pr.unit, pr.reorder_level, pr.cost_price, pr.selling_price, coalesce(sum(inv.quantity), 0)
  from products pr
  left join inventory inv on inv.product_id = pr.id and inv.branch_id = p_branch
  where pr.organization_id = p_org and pr.status = 'active' and is_member(p_org) and has_branch(p_org, p_branch)
  group by pr.id
  order by pr.name
$$;

-- ───────────── Function privileges ─────────────
-- Supabase grants EXECUTE to anon/authenticated by default; lock everything down, then open what the app needs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

grant execute on function
  app_settings(uuid), is_password_session(), my_member_id(uuid), is_member(uuid), has_perm(uuid, text), member_has_perm(uuid, text),
  member_has_branch(uuid, uuid), has_branch(uuid, uuid), my_permissions(uuid), next_employee_code(uuid), member_org(uuid),
  create_business(jsonb), my_context(), set_my_pin(uuid, text), reset_member_pin(uuid),
  register_terminal(uuid, uuid, text), revoke_terminal(uuid), lock_terminal(uuid, text),
  approvers(uuid, uuid, text), approve_action(uuid, uuid, uuid, text, text, numeric, text),
  shift_expected_cash(uuid), shift_summary(uuid), open_shift(uuid, numeric), my_open_shift(uuid),
  record_cash_movement(uuid, cash_move_type, numeric, text, uuid), close_shift(uuid, jsonb, text, uuid),
  checkout(jsonb), sale_receipt(uuid), refund_sale(uuid, jsonb, text, boolean, payment_method, uuid, uuid), void_sale(uuid, text, uuid),
  resume_held_cart(uuid, uuid), create_product(jsonb), adjust_stock(uuid, uuid, text, numeric, text, uuid),
  receive_stock(uuid, uuid, numeric, numeric, text, uuid), create_transfer(uuid, uuid, jsonb, text), receive_transfer(uuid),
  save_purchase_order(jsonb), set_purchase_order_status(uuid, po_status), receive_purchase_order(uuid, jsonb, text),
  void_expense(uuid, text), accept_invite(), update_member_profile(uuid, jsonb), save_member_access(uuid, uuid, jsonb, uuid[]),
  set_member_status(uuid, member_status, text), force_sign_out(uuid), transfer_ownership(uuid), save_role(jsonb), delete_role(uuid),
  save_settings(uuid, jsonb), mark_notifications_read(uuid, uuid[]),
  report_scope_ok(uuid, uuid), dashboard_summary(uuid, uuid, timestamptz, timestamptz), employee_report(uuid, uuid, timestamptz, timestamptz),
  employee_performance(uuid, timestamptz, timestamptz), pnl_report(uuid, uuid, timestamptz, timestamptz), stock_levels(uuid, uuid)
to authenticated;

-- Locked tills (not signed in) may only read their own roster.
grant execute on function terminal_roster(text) to anon, authenticated;

-- Realtime for the phone-as-scanner pairing and live dashboards (channels use broadcast; no table needed).
