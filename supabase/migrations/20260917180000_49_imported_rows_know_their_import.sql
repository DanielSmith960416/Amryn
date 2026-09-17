-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 49 — an imported row knows which import made it
--
-- ── why ───────────────────────────────────────────────────────────────────
--
-- Reported as "I cannot remove the import", and that was exactly right: there
-- is no Undo on the import history, and there could not be one, because
-- nothing written by an import records which import wrote it.
--
--   financial_records, sales_records, operational_records  data_source_id,
--                                       which points at data_sources and is
--                                       null for a workbook import
--   opportunities, risks                nothing at all
--
-- So an import could be made and never taken back. Every clean-up so far has
-- been somebody running DELETE by hand against production with a timestamp
-- and an organisation id — which is not a thing a customer can do, and not a
-- thing anybody should be doing on their behalf.
--
-- ── the column ────────────────────────────────────────────────────────────
--
-- Nullable, and null for every row that exists today. A row typed in by hand,
-- arriving from a connector, or written before this migration has no import
-- to point at, and that is the honest value rather than a fiction.
--
-- ON DELETE SET NULL rather than CASCADE. Undo deletes the rows explicitly
-- and then the import record; the constraint is there for the case nobody
-- planned, and in that case the safe outcome is figures that survive with
-- their provenance lost, not figures that vanish because a history row was
-- tidied away. A cascade on five tables holding client money is a loaded gun
-- pointed at exactly the data this product exists to keep.
--
-- Additive: five nullable columns and five indexes. No existing row is read
-- or written, nothing is dropped, and no policy changes — the DELETE policies
-- these enable already exist and already ask for the right permissions.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.financial_records
  add column if not exists import_id uuid references public.data_imports (id) on delete set null;
alter table public.sales_records
  add column if not exists import_id uuid references public.data_imports (id) on delete set null;
alter table public.operational_records
  add column if not exists import_id uuid references public.data_imports (id) on delete set null;
alter table public.opportunities
  add column if not exists import_id uuid references public.data_imports (id) on delete set null;
alter table public.risks
  add column if not exists import_id uuid references public.data_imports (id) on delete set null;

-- Undo reads by this column across five tables, and a foreign key without an
-- index makes the parent's own delete scan each child in full.
create index if not exists financial_records_import_idx   on public.financial_records (import_id) where import_id is not null;
create index if not exists sales_records_import_idx       on public.sales_records (import_id) where import_id is not null;
create index if not exists operational_records_import_idx on public.operational_records (import_id) where import_id is not null;
create index if not exists opportunities_import_idx       on public.opportunities (import_id) where import_id is not null;
create index if not exists risks_import_idx               on public.risks (import_id) where import_id is not null;

comment on column public.financial_records.import_id is
  'The workbook import that wrote this row, or null where it came from anywhere else. What makes an import undoable.';
comment on column public.sales_records.import_id is
  'The workbook import that wrote this row, or null where it came from anywhere else.';
comment on column public.operational_records.import_id is
  'The workbook import that wrote this row, or null where it came from anywhere else.';
comment on column public.opportunities.import_id is
  'The workbook import that wrote this row, or null where it came from anywhere else.';
comment on column public.risks.import_id is
  'The workbook import that wrote this row, or null where it came from anywhere else.';
