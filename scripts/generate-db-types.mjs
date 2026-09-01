#!/usr/bin/env node
/**
 * Generates src/types/database.ts by introspecting a PostgreSQL database that
 * has the Amryn migrations applied.
 *
 * Hand-maintaining types for forty-odd tables drifts; introspection cannot.
 * Point it at a local instance built by supabase/tests/run.sh, or at a Supabase
 * project, and commit the result.
 *
 *   node scripts/generate-db-types.mjs > src/types/database.ts
 *
 * Connection comes from PGHOST / PGPORT / PGUSER / PGDATABASE, and it shells
 * out to psql so there is no driver dependency for a build-time tool.
 */
import { execFileSync } from 'node:child_process';

const conn = [
  '-h', process.env.PGHOST ?? '/var/tmp',
  '-p', process.env.PGPORT ?? '55432',
  '-U', process.env.PGUSER ?? 'postgres',
  '-d', process.env.PGDATABASE ?? 'amryn_test',
];

const query = (sql) =>
  JSON.parse(
    execFileSync('psql', [...conn, '-At', '-c', `select coalesce(json_agg(t), '[]') from (${sql}) t`], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }).trim(),
  );

const enums = query(`
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  group by t.typname
  order by t.typname
`);

const columns = query(`
  select c.relname as table_name,
         a.attname as column_name,
         format_type(a.atttypid, a.atttypmod) as sql_type,
         t.typname as base_type,
         not a.attnotnull as nullable,
         pg_get_expr(d.adbin, d.adrelid) is not null as has_default,
         a.attidentity <> '' as is_identity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind in ('r', 'v')
    and a.attnum > 0 and not a.attisdropped
  order by c.relname, a.attnum
`);

// Views come back from the same query and have to be told apart, because they
// are emitted into a different block and have no Insert or Update shape.
const viewNames = new Set(
  query(`
    select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
     order by c.relname
  `).map((v) => v.name),
);

const relationships = query(`
  select
    con.conname as constraint_name,
    child.relname as table_name,
    (select array_agg(a.attname order by k.ord)
       from unnest(con.conkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as columns,
    parent.relname as referenced_relation,
    (select array_agg(a.attname order by k.ord)
       from unnest(con.confkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as referenced_columns,
    exists (
      select 1 from pg_index i
      where i.indrelid = con.conrelid and i.indisunique
        and i.indkey::int2[] @> con.conkey and con.conkey @> i.indkey::int2[]
    ) as is_one_to_one
  from pg_constraint con
  join pg_class child on child.oid = con.conrelid
  join pg_class parent on parent.oid = con.confrelid
  join pg_namespace n on n.oid = child.relnamespace
  where con.contype = 'f' and n.nspname = 'public'
  order by child.relname, con.conname
`);

const relsByTable = new Map();
for (const rel of relationships) {
  if (!relsByTable.has(rel.table_name)) relsByTable.set(rel.table_name, []);
  relsByTable.get(rel.table_name).push(rel);
}

const enumNames = new Set(enums.map((e) => e.name));

/** Map a PostgreSQL type onto the shape supabase-js actually hands back. */
function tsType(col) {
  const { base_type: base, sql_type: sql } = col;
  if (enumNames.has(base)) return `Enums['${base}']`;
  if (base.startsWith('_')) {
    const inner = base.slice(1);
    return `${enumNames.has(inner) ? `Enums['${inner}']` : scalar(inner, sql)}[]`;
  }
  return scalar(base, sql);
}

function scalar(base, sql) {
  switch (base) {
    case 'bool': return 'boolean';
    // int8 and numeric exceed JS number precision, so PostgREST sends them as
    // numbers only where it is safe; both arrive as number over JSON here.
    case 'int2': case 'int4': case 'int8': case 'float4': case 'float8': case 'numeric':
      return 'number';
    case 'json': case 'jsonb': return 'Json';
    case 'uuid': case 'text': case 'citext': case 'bpchar': case 'varchar':
    case 'date': case 'timestamptz': case 'timestamp': case 'time': case 'inet':
      return 'string';
    default:
      return sql.endsWith('[]') ? 'string[]' : 'string';
  }
}

const byTable = new Map();
const byView = new Map();
for (const col of columns) {
  const into = viewNames.has(col.table_name) ? byView : byTable;
  if (!into.has(col.table_name)) into.set(col.table_name, []);
  into.get(col.table_name).push(col);
}

const out = [];
out.push('/**');
out.push(' * Amryn™ AIGrowthIntelligence® — database types.');
out.push(' *');
out.push(' * GENERATED FILE. Do not edit by hand.');
out.push(' * Regenerate with: node scripts/generate-db-types.mjs > src/types/database.ts');
out.push(' */');
out.push('');
out.push('export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];');
out.push('');
out.push('export interface Enums {');
for (const e of enums) {
  out.push(`  ${e.name}: ${e.labels.map((l) => `'${l}'`).join(' | ')};`);
}
out.push('}');
out.push('');
out.push('export interface Database {');
out.push('  public: {');
out.push('    Tables: {');

for (const [table, cols] of [...byTable.entries()].sort()) {
  out.push(`      ${table}: {`);
  out.push('        Row: {');
  for (const c of cols) {
    out.push(`          ${c.column_name}: ${tsType(c)}${c.nullable ? ' | null' : ''};`);
  }
  out.push('        };');
  out.push('        Insert: {');
  for (const c of cols) {
    const optional = c.nullable || c.has_default || c.is_identity;
    out.push(`          ${c.column_name}${optional ? '?' : ''}: ${tsType(c)}${c.nullable ? ' | null' : ''};`);
  }
  out.push('        };');
  out.push('        Update: {');
  for (const c of cols) {
    out.push(`          ${c.column_name}?: ${tsType(c)}${c.nullable ? ' | null' : ''};`);
  }
  out.push('        };');
  out.push('        Relationships: [');
  for (const rel of relsByTable.get(table) ?? []) {
    out.push('          {');
    out.push(`            foreignKeyName: '${rel.constraint_name}';`);
    out.push(`            columns: [${rel.columns.map((c) => `'${c}'`).join(', ')}];`);
    out.push(`            isOneToOne: ${rel.is_one_to_one};`);
    out.push(`            referencedRelation: '${rel.referenced_relation}';`);
    out.push(`            referencedColumns: [${rel.referenced_columns.map((c) => `'${c}'`).join(', ')}];`);
    out.push('          },');
  }
  out.push('        ];');
  out.push('      };');
}

out.push('    };');

// Introspected, not listed. Both this block and Functions were once written by
// hand while the rest of the file was generated, which is the drift this tool
// exists to prevent — and both duly drifted: a function added by a migration
// was simply absent, and a view added by another was typed as `never`, so
// selecting from either did not typecheck.
out.push('    Views: {');
if (byView.size === 0) {
  out.push('      [_ in never]: never;');
}
for (const [view, cols] of [...byView.entries()].sort()) {
  out.push(`      ${view}: {`);
  out.push('        Row: {');
  for (const c of cols) {
    // A view column is nullable as far as the planner is concerned whatever
    // the underlying column says, and PostgREST makes no stronger promise.
    out.push(`          ${c.column_name}: ${tsType(c)} | null;`);
  }
  out.push('        };');
  out.push('        Relationships: [];');
  out.push('      };');
}
out.push('    };');
const routines = query(`
  select p.proname                                     as name,
         pg_get_function_arguments(p.oid)              as args,
         t.typname                                     as return_base,
         p.pronargdefaults                             as defaults
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public'
     and p.prokind = 'f'
     -- Either role's API surface. authenticated covers what a customer's
     -- session can call; service_role covers what an operator tool calls
     -- through the admin client, which is a real part of this schema's API and
     -- was missing from the types entirely: calling one did not typecheck.
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('service_role', p.oid, 'execute'))
     -- citext and pgcrypto are created in public, so every one of their
     -- functions is visible here. They are not part of this schema's API, and
     -- their overloads collide on name — which is invalid TypeScript, not
     -- merely noisy. Anything belonging to an extension is excluded.
     and not exists (
       select 1 from pg_depend d
        where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
     )
   order by p.proname
`);

out.push('    Functions: {');
if (routines.length === 0) {
  out.push('      [_ in never]: never;');
}
for (const routine of routines) {
  // "p_name text, p_industry text DEFAULT NULL::text" → one entry each. A
  // parameter with a default is optional to the caller.
  const params = (routine.args ?? '')
    .split(/,(?![^(]*\))/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const hasDefault = / default /i.test(part);
      const [name, ...rest] = part.replace(/ default .*/i, '').trim().split(/\s+/);
      const sql = rest.join(' ').toLowerCase();
      const base = sql.replace(/\(.*\)/, '').replace(/^character varying$/, 'varchar')
        .replace(/^character$/, 'bpchar').replace(/^boolean$/, 'bool')
        .replace(/^integer$/, 'int4').replace(/^double precision$/, 'float8');
      return { name, ts: scalar(base, sql), hasDefault };
    });

  out.push(`      ${routine.name}: {`);
  if (params.length === 0) {
    out.push('        Args: Record<string, never>;');
  } else {
    out.push('        Args: {');
    for (const p of params) {
      out.push(`          ${p.name}${p.hasDefault ? '?' : ''}: ${p.ts}${p.hasDefault ? ' | null' : ''};`);
    }
    out.push('        };');
  }
  // A `returns table (...)` function has prorettype `record`, and mapping that
  // through scalar() produced `string` — a type that compiles and is wrong,
  // since supabase-js hands back an array of rows. Left unnarrowed, so the
  // caller has to say what the shape is rather than trusting a guess.
  // A function returning `setof record` is a table-valued function whose
  // shape lives in its OUT parameters, which are not introspected here.
  //
  // A function declared `returns public.subscriptions` has a return type whose
  // name is that table's — PostgreSQL gives every table a composite type of
  // the same name — so it is emitted as that table's Row rather than falling
  // through scalar() and being typed `string`, which is what it was.
  const returns =
    routine.return_base === 'void'
      ? 'undefined'
      : routine.return_base === 'record'
        ? 'Record<string, unknown>[]'
        : byTable.has(routine.return_base)
          ? `Database['public']['Tables']['${routine.return_base}']['Row']`
          : scalar(routine.return_base, routine.return_base);
  out.push(`        Returns: ${returns};`);
  out.push('      };');
}
out.push('    };');
out.push('    Enums: Enums;');
out.push("    CompositeTypes: { [_ in never]: never };");
out.push('  };');
out.push('}');
out.push('');
out.push('/** Row shorthand: `Row<\'opportunities\'>`. */');
out.push("export type Row<T extends keyof Database['public']['Tables']> =");
out.push("  Database['public']['Tables'][T]['Row'];");
out.push("export type InsertRow<T extends keyof Database['public']['Tables']> =");
out.push("  Database['public']['Tables'][T]['Insert'];");
out.push("export type UpdateRow<T extends keyof Database['public']['Tables']> =");
out.push("  Database['public']['Tables'][T]['Update'];");
out.push("/** Views are read-only, so they have a Row and nothing else. */");
out.push("export type ViewRow<T extends keyof Database['public']['Views']> =");
out.push("  Database['public']['Views'][T]['Row'];");
out.push('');

process.stdout.write(out.join('\n'));
