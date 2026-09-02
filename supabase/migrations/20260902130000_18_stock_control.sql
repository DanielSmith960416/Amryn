-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 18 — Advanced Inventory Control
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The inventory module was built against the second Excel workbook and read a
-- fixed dataset. Every screen worked, every calculation was right, and none of
-- it was anybody's stock: a real organisation opening Advanced Inventory
-- Control was shown a demonstration pharmacy's shelves. The module was
-- recently changed to say "not connected" instead, which was honest and not a
-- product. This is the table behind it.
--
-- ── the shape follows the workbook, because the workbook is the product ───
-- SETTINGS holds who is auditing what, on which shift; AUDIT LOG holds one row
-- per stock line. That is a session and its lines, so it is two tables rather
-- than one — and the second table is what makes a history possible. An audit
-- in March and an audit in June are two rows in `stock_audits`, and "what did
-- the shelves look like at year end" becomes answerable instead of being
-- overwritten.
--
-- ── what is deliberately not here ─────────────────────────────────────────
-- Compliance profiles stay in code. They encode what a sector's regulator
-- requires — SAHPRA retention, disposal evidence, who signs an audit off —
-- and a change to one should arrive as a reviewed diff, not as somebody
-- editing a text field on a Tuesday. `complianceProfile()` already falls back
-- to the general profile for an id it does not know, so adding a fourth is a
-- code change with no migration.

-- ── the vocabulary ────────────────────────────────────────────────────────
--
-- Snake case, not the workbook's display strings. The six actions are labels
-- an operator reads — "Marked Down / Clearance" — and rewording a label should
-- not be a schema change. The display strings live in the engine, where they
-- belong, and the mapping is one table in src/lib/inventory/mapping.ts.
create type public.stock_action as enum (
  'pending_review',
  'left_on_shelf',
  'removed_from_shelf',
  'returned_to_supplier',
  'marked_down',
  'destroyed'
);

create type public.stock_audit_status as enum ('draft', 'in_progress', 'complete');

-- ── the session ───────────────────────────────────────────────────────────

create table public.stock_audits (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations (id) on delete cascade,
  -- Which site was walked. Null for an organisation that does not separate
  -- them, which is the single-shop case and must stay easy.
  branch_id             uuid references public.branches (id) on delete set null,

  -- SETTINGS!B4–B7. Kept as text rather than as references to people: the
  -- person who walked the shelves is often not a platform user, and an audit
  -- that cannot record a stocktaker because they have no login is an audit
  -- nobody does.
  site_name             text not null,
  auditor_name          text not null default '',
  responsible_name      text not null default '',
  shift                 text not null default '',

  -- Resolved in code against COMPLIANCE_PROFILES; an unknown id falls back to
  -- the general profile rather than failing, so a profile removed from the
  -- code does not strand an audit.
  compliance_profile_id text not null default 'general-inventory',

  audit_date            date not null default current_date,
  status                public.stock_audit_status not null default 'draft',

  created_by            uuid references auth.users (id) on delete set null,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A completed audit is one with a completion time, and an incomplete one is
  -- not. Without this the report can be generated from a session somebody is
  -- still halfway through, and dated as though it were finished.
  constraint complete_carries_a_time check (
    (status = 'complete') = (completed_at is not null)
  )
);

comment on table public.stock_audits is
  'One stocktake: who walked which site, on what date, against which sector profile. The lines are in stock_items.';

create index stock_audits_org_idx on public.stock_audits (organisation_id, audit_date desc);

create trigger stock_audits_touch
  before update on public.stock_audits
  for each row execute function amryn.touch_updated_at();

-- ── the lines ─────────────────────────────────────────────────────────────

create table public.stock_items (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  audit_id        uuid not null references public.stock_audits (id) on delete cascade,

  -- AUDIT LOG!B–H.
  product_name    text not null,
  sku             text not null default '',
  batch_number    text not null default '',
  department      text not null default '',
  location        text not null default '',
  qty             integer not null default 0 check (qty >= 0),
  expiry_date     date not null,

  -- AUDIT LOG!I–N. `action` is nullable-by-default rather than null: a line
  -- nobody has looked at is 'pending_review', which is a state the workbook
  -- names, and the dormancy rules test against it. Null would make every rule
  -- carry a coalesce.
  action          public.stock_action not null default 'pending_review',
  actioned_by     text not null default '',
  actioned_on     date,
  notes           text not null default '',

  -- AUDIT LOG!O — the auditor's tick that this line has been dealt with.
  verified        boolean not null default false,

  -- Cents, like every other money column here, so the report can state
  -- capital at risk without a float. Null where the cost is not known, which
  -- is common and must not read as zero.
  unit_cost_cents bigint check (unit_cost_cents is null or unit_cost_cents >= 0),

  -- Set where a sales feed shows the item moving. Overrides the workbook's
  -- inference that an item left on the shelf and not near expiry is dormant —
  -- an inference it makes because it cannot see turnover.
  has_movement    boolean,

  -- The order the lines were counted in. The report prints them as numbered
  -- rows and an auditor reads down the shelf, so the order is information.
  position        integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- An action that has been taken has a date. Recording one without the other
  -- is how a disposal ends up undocumented, which is the specific thing the
  -- insurance and regulator notes on the report depend on.
  constraint actioned_lines_carry_a_date check (
    action = 'pending_review' or actioned_on is not null
  )
);

comment on table public.stock_items is
  'One line of a stocktake. Expiry status, dormancy and value at risk are computed by the engine from these columns rather than stored, so a figure can never disagree with its own formula.';

create index stock_items_audit_idx on public.stock_items (audit_id, position);
create index stock_items_org_idx on public.stock_items (organisation_id);
-- Expiry is what every report section sorts and filters on.
create index stock_items_expiry_idx on public.stock_items (organisation_id, expiry_date);

create trigger stock_items_touch
  before update on public.stock_items
  for each row execute function amryn.touch_updated_at();

-- ── the permission ────────────────────────────────────────────────────────
--
-- A new key rather than reusing import_data. Importing a spreadsheet and
-- marking a batch destroyed are different acts with different consequences,
-- and the second is the one a regulator asks about. Naming it separately means
-- it can be granted separately.
insert into public.permissions (key, category, description) values
  ('manage_inventory', 'Operations', 'Record stocktakes, action stock lines and import stock');

do $$
declare
  r public.org_role;
begin
  -- Everyone who can already see operational data, plus the analyst who does
  -- the importing. Deliberately not the viewer: actioning a line is a
  -- decision about stock, not a way of reading about it.
  foreach r in array array[
    'super_admin','org_admin','executive','regional_manager',
    'branch_manager','department_manager','analyst'
  ]::public.org_role[]
  loop
    insert into public.role_permissions (role, permission_key)
    values (r, 'manage_inventory')
    on conflict do nothing;
  end loop;
end $$;

-- ── who may read and write them ───────────────────────────────────────────

alter table public.stock_audits enable row level security;
alter table public.stock_audits force row level security;
alter table public.stock_items  enable row level security;
alter table public.stock_items  force row level security;

create policy stock_audits_read on public.stock_audits
  for select to authenticated
  using (amryn.has_permission(organisation_id, 'view_operations_data'));

create policy stock_audits_write on public.stock_audits
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_inventory'))
  with check (amryn.has_permission(organisation_id, 'manage_inventory'));

create policy stock_items_read on public.stock_items
  for select to authenticated
  using (amryn.has_permission(organisation_id, 'view_operations_data'));

create policy stock_items_write on public.stock_items
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_inventory'))
  with check (amryn.has_permission(organisation_id, 'manage_inventory'));

-- ── the lapsed-subscription guard ─────────────────────────────────────────
--
-- Attached by hand, and that is the point. Migration 16 attached it by
-- iterating the catalogue at the moment it ran, which is a snapshot: a table
-- added afterwards carries no trigger and nothing about writing this migration
-- would say so. Test 19 asserts the whole list, so leaving these two out is a
-- failing test rather than a silent gap — which is exactly what it was written
-- to catch.
--
-- Stock is business data, so it is guarded rather than exempt: an organisation
-- whose subscription has lapsed keeps reading its stocktakes and its report,
-- and cannot record new ones.
create trigger zz_subscription_stock_audits
  before insert or update or delete on public.stock_audits
  for each row execute function amryn.refuse_lapsed_write();

create trigger zz_subscription_stock_items
  before insert or update or delete on public.stock_items
  for each row execute function amryn.refuse_lapsed_write();

notify pgrst, 'reload schema';
