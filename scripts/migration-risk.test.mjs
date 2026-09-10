import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { riskyStatements, strip } from './migration-risk.mjs';

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

describe('strip', () => {
  it('removes line comments, so prose about deleting is not a delete', () => {
    expect(strip('-- we should delete from this one day\nselect 1;')).not.toMatch(/delete/i);
  });

  it('removes block comments', () => {
    expect(strip('/* drop table everything */ select 1;')).not.toMatch(/drop/i);
  });

  it('removes dollar-quoted bodies, which is the whole reason this exists', () => {
    // Defining a function that will one day delete something is not deleting
    // something now. Without this, almost every migration here reads as risky.
    const sql = `create function f() returns void language plpgsql as $$
      begin delete from public.rate_limits; end $$;`;
    expect(strip(sql)).not.toMatch(/delete/i);
  });

  it('matches a dollar quote by its tag, not by counting', () => {
    // The generated setup.sql nests $setup$ around bodies that use $$. Closing
    // on the first $$ would end the body early and expose its contents.
    const sql = `do $setup$ begin
      perform 1; -- $$ is not the end of this
      delete from public.thing;
    end $setup$; select 2;`;
    const stripped = strip(sql);
    expect(stripped).not.toMatch(/delete/i);
    expect(stripped).toMatch(/select 2/);
  });

  it('removes string literals, so an apostrophe cannot swallow the file', () => {
    const sql = `select 'it''s fine'; drop table real_one;`;
    expect(strip(sql)).toMatch(/drop table real_one/i);
  });

  it('leaves executable statements alone', () => {
    expect(strip('update public.organisations set x = 1;')).toMatch(/update/i);
  });
});

describe('riskyStatements', () => {
  it('says nothing about a migration that only adds', () => {
    expect(
      riskyStatements(`
        create table public.thing (id uuid primary key);
        create index thing_idx on public.thing (id);
        alter table public.thing enable row level security;
        insert into public.thing (id) values (gen_random_uuid());
      `),
    ).toEqual([]);
  });

  it('catches an update with a table alias between the table and SET', () => {
    // Migration 16 is written this way. A pattern without the alias reports it
    // as purely additive, which is a false negative on the exact kind of
    // statement the backup rule is about.
    expect(riskyStatements('update public.subscriptions s set price = 1;')).toContain(
      'updates existing rows',
    );
    expect(riskyStatements('update public.subscriptions as s set price = 1;')).toContain(
      'updates existing rows',
    );
    expect(riskyStatements('update only public.subscriptions set price = 1;')).toContain(
      'updates existing rows',
    );
  });

  it('catches the destructive shapes', () => {
    expect(riskyStatements('drop table public.thing;')).toContain('drops a table');
    expect(riskyStatements('alter table public.t drop column c;')).toContain('drops a column');
    expect(riskyStatements('truncate public.t;')).toContain('truncates a table');
    expect(riskyStatements('delete from public.t where x;')).toContain('deletes rows');
    expect(riskyStatements('alter table t alter column c type bigint;')).toContain(
      'changes a column type',
    );
    expect(riskyStatements('alter table t rename column a to b;')).toContain('renames a column');
    expect(riskyStatements('alter table public.t rename to u;')).toContain('renames a table');
  });

  it('reports every reason, not just the first', () => {
    const risks = riskyStatements('delete from public.a; drop table public.b;');
    expect(risks).toHaveLength(2);
  });
});

describe('the migrations in this repository', () => {
  const files = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();

  it('are classified, and only the three that rewrite rows are flagged', () => {
    // Pinned deliberately. A migration becoming risky is a real event that
    // should change this list rather than pass unnoticed — and a new migration
    // that trips the classifier by accident is worth seeing in a diff.
    //
    // 36 is here on purpose: repricing four tiers means updating rows that
    // already exist, so migrate.mjs will refuse to apply it without a recent
    // verified backup. That is the gate doing its job, not a fault to route
    // around — the entry below is the record that it was considered.
    const risky = files.filter((f) => riskyStatements(readFileSync(join(migrations, f), 'utf8')).length > 0);
    expect(risky).toEqual([
      '20260830080000_07_sector_policy.sql',
      '20260901090000_16_subscription_entitlements.sql',
      '20260910120000_36_pricing_and_connector_entitlements.sql',
    ]);
  });

  it('includes the job runner, which defines functions that delete but deletes nothing', () => {
    const sql = readFileSync(join(migrations, '20260906090000_23_job_runner.sql'), 'utf8');
    // sweep_jobs() deletes and claim_jobs() updates — both inside bodies.
    expect(sql).toMatch(/delete from public\.job_runs/);
    expect(riskyStatements(sql)).toEqual([]);
  });
});
