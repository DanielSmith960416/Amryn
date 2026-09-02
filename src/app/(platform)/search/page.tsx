import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { requireWorkspace } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Search' };

/**
 * Cross-module search.
 *
 * Every query runs through the caller's client, so a result set is already
 * narrowed to what this user may read — search cannot become a way around the
 * permission model.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const workspace = await requireWorkspace();
  const term = q?.trim() ?? '';

  const results = term.length >= 2 ? await search(workspace.organisation.id, term) : null;

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Search"
        description="Across opportunities, risks, goals and market signals — limited to what you are permitted to see."
      />

      <form className="mb-5 flex max-w-xl gap-2">
        <Input
          name="q"
          defaultValue={term}
          placeholder="Delivery, margin, competitor name…"
          aria-label="Search"
        />
        <Button type="submit" variant="primary">
          Search
        </Button>
      </form>

      {results === null ? (
        <Card>
          <EmptyState
            title="Type at least two characters"
            description="Search looks across opportunity titles and summaries, risk titles, goal titles and market signals."
          />
        </Card>
      ) : results.length === 0 ? (
        <Card>
          <EmptyState
            title={`Nothing matched “${term}”`}
            description="Try a shorter term. Remember that search is limited to the part of the business you can see."
          />
        </Card>
      ) : (
        <ul className="max-w-3xl space-y-2.5">
          {results.map((result) => (
            <li key={`${result.kind}-${result.id}`}>
              <Link href={result.href}>
                <Card interactive className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">
                      {result.title}
                    </p>
                    <Badge tone="outline">{result.kind}</Badge>
                  </div>
                  {result.detail ? (
                    <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                      {result.detail}
                    </p>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

interface SearchResult {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  href: string;
}

async function search(organisationId: string, term: string): Promise<SearchResult[]> {
  const supabase = await createClient();
  // Escape the wildcard characters so a term containing % or _ is matched
  // literally rather than as a pattern.
  const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  const [opportunities, risks, goals, signals] = await Promise.all([
    supabase
      .from('opportunities')
      .select('id, title, summary')
      .eq('organisation_id', organisationId)
      .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
      .limit(10),
    supabase
      .from('risks')
      .select('id, title, description')
      .eq('organisation_id', organisationId)
      .ilike('title', pattern)
      .limit(10),
    supabase
      .from('goals')
      .select('id, title, description')
      .eq('organisation_id', organisationId)
      .ilike('title', pattern)
      .limit(10),
    supabase
      .from('market_signals')
      .select('id, title, summary')
      .eq('organisation_id', organisationId)
      .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
      .limit(10),
  ]);

  return [
    ...(opportunities.data ?? []).map((row) => ({
      id: row.id,
      kind: 'Opportunity',
      title: row.title,
      detail: row.summary,
      href: '/opportunities',
    })),
    ...(risks.data ?? []).map((row) => ({
      id: row.id,
      kind: 'Risk',
      title: row.title,
      detail: row.description,
      href: '/risk',
    })),
    ...(goals.data ?? []).map((row) => ({
      id: row.id,
      kind: 'Goal',
      title: row.title,
      detail: row.description,
      href: '/strategy',
    })),
    ...(signals.data ?? []).map((row) => ({
      id: row.id,
      kind: 'Signal',
      title: row.title,
      detail: row.summary,
      href: '/market-intelligence',
    })),
  ];
}
