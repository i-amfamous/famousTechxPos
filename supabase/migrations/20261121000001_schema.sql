-- ════════════════════════════════════════════════════════════════════════════
--  Famous TechX POS — core schema
--  Money: numeric(14,2). Quantities: numeric(12,3). Every business-owned row
--  carries organization_id. Completed sales, payments and stock movements are
--  append-only; corrections are made with refunds / voids / adjustments.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ───────────── Enums ─────────────
create type member_status   as enum ('invited', 'active', 'suspended', 'deactivated');
create type record_status   as enum ('active', 'archived');
create type branch_status   as enum ('active', 'inactive');
create type terminal_status as enum ('active', 'revoked');
create type sale_status     as enum ('completed', 'partially_refunded', 'refunded', 'voided');
create type payment_method  as enum ('cash', 'momo', 'card', 'bank');
create type payment_status  as enum ('recorded', 'verified', 'pending', 'failed', 'refunded');
create type movement_type   as enum ('opening', 'sale', 'receipt', 'return', 'adjustment', 'transfer_out', 'transfer_in', 'damaged', 'void');
create type shift_status    as enum ('open', 'closed');
create type cash_move_type  as enum ('paid_in', 'paid_out', 'drop', 'no_sale');
create type po_status       as enum ('draft', 'ordered', 'partially_received', 'received', 'cancelled');
create type transfer_status as enum ('dispatched', 'received', 'cancelled');
create type expense_status  as enum ('recorded', 'voided');
create type auth_method     as enum ('password', 'pin');

-- ───────────── Businesses & people ─────────────
create table businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 1),
  category      text,
  phone         text,
  email         text,
  address       text,
  tin           text,
  registration_no text,
  logo_url      text,
  currency      text not null default 'GHS',
  timezone      text not null default 'Africa/Accra',
  -- POS & business rules (see SettingsPage). Defaults applied in app_settings().
  settings      jsonb not null default '{}'::jsonb,
  status        text not null default 'active',
  owner_user_id uuid references auth.users,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text,
  phone      text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  name            text not null,
  code            text not null default 'BR',  -- used in receipt numbers, e.g. OSU
  address         text,
  phone           text,
  status          branch_status not null default 'active',
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on branches (organization_id);

-- Global permission catalogue (same for every business).
create table permissions (
  key       text primary key,
  label     text not null,
  module    text not null,
  sensitive boolean not null default false,
  sort      int not null default 0
);

create table roles (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references businesses on delete cascade,
  key                  text not null,
  name                 text not null,
  description          text not null default '',
  is_system            boolean not null default false,
  max_discount_percent numeric(5,2) not null default 0 check (max_discount_percent between 0 and 100),
  max_refund_amount    numeric(14,2) not null default 0 check (max_refund_amount >= 0),
  allow_no_sale        boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, key)
);

create table role_permissions (
  role_id        uuid not null references roles on delete cascade,
  permission_key text not null references permissions on delete cascade,
  primary key (role_id, permission_key)
);

create table business_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references businesses on delete cascade,
  user_id          uuid not null references auth.users on delete restrict,
  role_id          uuid not null references roles,
  full_name        text not null,
  display_name     text not null,
  email            text,
  phone            text,
  employee_code    text not null,
  status           member_status not null default 'invited',
  is_owner         boolean not null default false,
  hire_date        date not null default current_date,
  avatar_color     text not null default 'bg-brand-600',
  has_pin          boolean not null default false,
  last_sign_in_at  timestamptz,
  signed_out_at    timestamptz,   -- tokens issued before this are rejected (force sign-out)
  deactivated_at   timestamptz,
  deactivated_by   uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, employee_code)
);
create index on business_members (user_id);

create table member_branch_access (
  member_id uuid not null references business_members on delete cascade,
  branch_id uuid not null references branches on delete cascade,
  primary key (member_id, branch_id)
);

create table member_permission_overrides (
  member_id      uuid not null references business_members on delete cascade,
  permission_key text not null references permissions on delete cascade,
  effect         text not null check (effect in ('grant', 'revoke')),
  set_by         uuid references business_members,
  created_at     timestamptz not null default now(),
  primary key (member_id, permission_key)
);

-- PIN hashes: never readable by clients (no grants, no policies).
create table member_pins (
  member_id       uuid primary key references business_members on delete cascade,
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

-- ───────────── Terminals (tills) ─────────────
create table pos_terminals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  branch_id       uuid not null references branches,
  name            text not null,
  code            text not null default 'T1',       -- used in receipt numbers
  token_hash      text not null,                    -- sha256 of the device token
  status          terminal_status not null default 'active',
  registered_by   uuid references business_members,
  last_seen_at    timestamptz,
  receipt_seq     bigint not null default 0,
  created_at      timestamptz not null default now()
);
create index on pos_terminals (organization_id);

create table terminal_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  terminal_id     uuid not null references pos_terminals on delete cascade,
  member_id       uuid not null references business_members,
  auth_method     auth_method not null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  end_reason      text
);

create table sign_in_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  member_id       uuid not null references business_members on delete cascade,
  terminal_id     uuid references pos_terminals on delete set null,
  method          auth_method not null,
  success         boolean not null,
  device          text,
  created_at      timestamptz not null default now()
);
create index on sign_in_events (member_id, created_at desc);

-- ───────────── Catalogue & stock ─────────────
create table categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  name            text not null,
  color           text not null default 'bg-brand-100 text-brand-800',
  parent_id       uuid references categories,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create table products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  category_id     uuid references categories on delete set null,
  name            text not null check (length(trim(name)) > 0),
  brand           text,
  description     text,
  image_url       text,
  sku             text not null,
  barcode         text,
  cost_price      numeric(14,2) not null default 0 check (cost_price >= 0),
  selling_price   numeric(14,2) not null check (selling_price >= 0),
  unit            text not null default 'pc',      -- 'job' = service, not stock-tracked
  taxable         boolean not null default true,
  reorder_level   numeric(12,3) not null default 0,
  status          record_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, sku)
);
create unique index products_barcode_uniq on products (organization_id, barcode) where barcode is not null and barcode <> '';
create index on products (organization_id, status);

create table product_variants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  product_id      uuid not null references products on delete cascade,
  label           text not null,
  sku             text not null,
  barcode         text,
  selling_price   numeric(14,2),
  unique (organization_id, sku)
);

create table inventory (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  branch_id       uuid not null references branches on delete cascade,
  product_id      uuid not null references products on delete cascade,
  variant_id      uuid references product_variants on delete cascade,
  quantity        numeric(12,3) not null default 0,
  updated_at      timestamptz not null default now()
);
create unique index inventory_item_uniq on inventory (branch_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on inventory (organization_id, branch_id);

create table stock_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  branch_id       uuid not null references branches,
  product_id      uuid not null references products,
  variant_id      uuid references product_variants,
  movement_type   movement_type not null,
  quantity_delta  numeric(12,3) not null,
  quantity_before numeric(12,3),
  quantity_after  numeric(12,3),
  reason          text,
  reference_type  text,
  reference_id    uuid,
  actor_id        uuid references business_members,
  created_at      timestamptz not null default now()
);
create index on stock_movements (organization_id, branch_id, created_at desc);
create index on stock_movements (product_id, created_at desc);

-- Online barcode lookups cached for everyone (no business data).
create table barcode_cache (
  barcode    text primary key,
  data       jsonb,
  found      boolean not null,
  fetched_at timestamptz not null default now()
);

-- ───────────── Customers ─────────────
create table customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  name            text not null,
  phone           text,
  email           text,
  address         text,
  notes           text,
  status          record_status not null default 'active',
  total_spend     numeric(14,2) not null default 0,
  visits          int not null default 0,
  last_visit_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on customers (organization_id, name);

-- ───────────── Shifts & cash ─────────────
create table shifts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  branch_id       uuid not null references branches,
  terminal_id     uuid not null references pos_terminals,
  member_id       uuid not null references business_members,
  status          shift_status not null default 'open',
  opening_float   numeric(14,2) not null default 0 check (opening_float >= 0),
  expected_cash   numeric(14,2),
  counted_cash    numeric(14,2),
  denomination_counts jsonb,
  variance        numeric(14,2),
  note            text,
  approved_by     uuid references business_members,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  closed_by       uuid references business_members
);
create unique index one_open_shift_per_member_terminal on shifts (terminal_id, member_id) where status = 'open';
create index on shifts (organization_id, opened_at desc);

-- Manager approvals for restricted actions (single-use).
create table approvals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  terminal_id     uuid references pos_terminals,
  action          text not null,      -- discount | refund | void | price_override | no_sale | drop | take_over_cart | shift_variance
  amount          numeric(14,2),
  detail          text,
  requested_by    uuid not null references business_members,
  approved_by     uuid not null references business_members,
  used_at         timestamptz,
  used_ref        uuid,
  created_at      timestamptz not null default now()
);

create table cash_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  shift_id        uuid not null references shifts on delete cascade,
  type            cash_move_type not null,
  amount          numeric(14,2) not null default 0 check (amount >= 0),
  reason          text not null,
  actor_id        uuid not null references business_members,
  approval_id     uuid references approvals,
  created_at      timestamptz not null default now()
);

-- ───────────── Sales ─────────────
create table sales (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references businesses on delete cascade,
  branch_id        uuid not null references branches,
  terminal_id      uuid references pos_terminals,
  shift_id         uuid references shifts,
  cashier_id       uuid not null references business_members,
  customer_id      uuid references customers,
  receipt_number   text not null,
  idempotency_key  text not null,
  status           sale_status not null default 'completed',
  subtotal         numeric(14,2) not null,
  discount_total   numeric(14,2) not null default 0,
  tax_total        numeric(14,2) not null default 0,
  total            numeric(14,2) not null check (total >= 0),
  paid_total       numeric(14,2) not null,
  change_due       numeric(14,2) not null default 0,
  cost_total       numeric(14,2) not null default 0,
  refunded_total   numeric(14,2) not null default 0,
  discount_approval_id uuid references approvals,
  void_reason      text,
  voided_by        uuid references business_members,
  voided_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (organization_id, receipt_number),
  unique (organization_id, idempotency_key)
);
create index on sales (organization_id, branch_id, created_at desc);
create index on sales (cashier_id, created_at desc);
create index on sales (shift_id);

create table sale_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references businesses on delete cascade,
  sale_id          uuid not null references sales on delete cascade,
  product_id       uuid not null references products,
  variant_id       uuid references product_variants,
  name_snapshot    text not null,
  sku_snapshot     text not null,
  quantity         numeric(12,3) not null check (quantity > 0),
  unit_price       numeric(14,2) not null,
  cost_snapshot    numeric(14,2) not null default 0,
  discount         numeric(14,2) not null default 0,
  tax              numeric(14,2) not null default 0,
  line_total       numeric(14,2) not null,
  refunded_quantity numeric(12,3) not null default 0
);
create index on sale_items (sale_id);

create table payments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references businesses on delete cascade,
  sale_id            uuid not null references sales on delete cascade,
  method             payment_method not null,
  amount             numeric(14,2) not null check (amount > 0),
  status             payment_status not null default 'recorded',
  provider           text,
  provider_reference text,
  recorded_by        uuid not null references business_members,
  created_at         timestamptz not null default now()
);
create index on payments (sale_id);

create table refunds (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references businesses on delete cascade,
  original_sale_id uuid not null references sales,
  shift_id         uuid references shifts,
  amount           numeric(14,2) not null check (amount > 0),
  method           payment_method not null,
  status           payment_status not null default 'recorded',
  reason           text not null,
  restocked        boolean not null default false,
  actor_id         uuid not null references business_members,
  approval_id      uuid references approvals,
  created_at       timestamptz not null default now()
);

create table refund_items (
  id           uuid primary key default gen_random_uuid(),
  refund_id    uuid not null references refunds on delete cascade,
  sale_item_id uuid not null references sale_items,
  quantity     numeric(12,3) not null check (quantity > 0),
  amount       numeric(14,2) not null
);

create table held_carts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  branch_id       uuid not null references branches,
  terminal_id     uuid references pos_terminals,
  owner_id        uuid not null references business_members,
  note            text not null default '',
  lines           jsonb not null,
  created_at      timestamptz not null default now()
);

-- ───────────── Suppliers, purchases, transfers ─────────────
create table suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  name            text not null,
  phone           text,
  email           text,
  address         text,
  notes           text,
  status          record_status not null default 'active',
  created_at      timestamptz not null default now()
);

create table purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  branch_id       uuid not null references branches,
  supplier_id     uuid not null references suppliers,
  number          text not null,
  status          po_status not null default 'draft',
  expected_at     date,
  supplier_reference text,
  amount_paid     numeric(14,2) not null default 0,
  created_by      uuid references business_members,
  created_at      timestamptz not null default now(),
  unique (organization_id, number)
);

create table purchase_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders on delete cascade,
  product_id        uuid not null references products,
  quantity          numeric(12,3) not null check (quantity > 0),
  received_quantity numeric(12,3) not null default 0,
  unit_cost         numeric(14,2) not null check (unit_cost >= 0)
);

create table stock_transfers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  number          text not null,
  from_branch_id  uuid not null references branches,
  to_branch_id    uuid not null references branches,
  status          transfer_status not null default 'dispatched',
  note            text,
  dispatched_by   uuid references business_members,
  received_by     uuid references business_members,
  created_at      timestamptz not null default now(),
  received_at     timestamptz,
  check (from_branch_id <> to_branch_id)
);
create table stock_transfer_items (
  transfer_id uuid not null references stock_transfers on delete cascade,
  product_id  uuid not null references products,
  quantity    numeric(12,3) not null check (quantity > 0),
  primary key (transfer_id, product_id)
);

-- ───────────── Expenses, notifications, audit ─────────────
create table expenses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  branch_id       uuid not null references branches,
  category        text not null,
  amount          numeric(14,2) not null check (amount > 0),
  expense_date    date not null default current_date,
  description     text not null,
  method          payment_method not null default 'cash',
  attachment_url  text,
  status          expense_status not null default 'recorded',
  void_reason     text,
  actor_id        uuid not null references business_members,
  created_at      timestamptz not null default now()
);
create index on expenses (organization_id, expense_date desc);

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references businesses on delete cascade,
  member_id       uuid references business_members on delete cascade, -- null = everyone with the permission below
  audience_perm   text,                                               -- e.g. 'inventory.adjust'
  type            text not null,
  title           text not null,
  body            text not null default '',
  read_by         uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index on notifications (organization_id, created_at desc);

create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references businesses on delete cascade,
  branch_id       uuid references branches on delete set null,
  terminal_id     uuid references pos_terminals on delete set null,
  actor_id        uuid references business_members on delete set null,
  category        text not null,   -- auth | sale | refund | discount | approval | stock | cash | employee | settings
  action          text not null,
  detail          text not null default '',
  amount          numeric(14,2),
  entity_type     text,
  entity_id       uuid,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index on audit_logs (organization_id, created_at desc);
create index on audit_logs (actor_id, created_at desc);

-- ───────────── Subscriptions (platform) ─────────────
create table subscription_plans (
  id         text primary key,
  name       text not null,
  max_members int not null,
  max_branches int not null,
  price_month numeric(14,2) not null default 0
);
create table business_subscriptions (
  organization_id uuid primary key references businesses on delete cascade,
  plan_id         text not null references subscription_plans,
  status          text not null default 'active',
  period_start    date not null default current_date,
  period_end      date,
  provider_ref    text
);
create table platform_admins (user_id uuid primary key references auth.users on delete cascade);

-- ───────────── updated_at triggers ─────────────
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['businesses','profiles','branches','roles','business_members','products','customers'] loop
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
