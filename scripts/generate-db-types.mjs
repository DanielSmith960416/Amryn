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
  where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  order by c.relname, a.attnum
`);

const pascal = (s) => s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
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
for (const col of columns) {
  if (!byTable.has(col.table_name)) byTable.set(col.table_name, []);
  byTable.get(col.table_name).push(col);
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
  out.push('      };');
}

out.push('    };');
out.push('    Views: Record<string, never>;');
out.push('    Functions: {');
out.push('      create_organisation: {');
out.push('        Args: {');
out.push('          p_name: string;');
out.push('          p_slug: string;');
out.push('          p_industry?: string | null;');
out.push('          p_country_code?: string;');
out.push('          p_currency_code?: string;');
out.push('        };');
out.push('        Returns: string;');
out.push('      };');
out.push('    };');
out.push('    Enums: Enums;');
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
out.push('');

process.stdout.write(out.join('\n'));
