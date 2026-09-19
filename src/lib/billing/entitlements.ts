import 'server-only';

/**
 * Reading an organisation's entitlements out of the database.
 *
 * Split from access.ts so the rules can be unit tested and read from a client
 * component while the fetching stays where it belongs. Everything access.ts
 * exports is re-exported here, so a server caller has one import to make.
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Entitlements, isEntitlement } from './access';

export * from './access';

const EMPTY = new Entitlements([]);

/** One row of the organisation_entitlements view, however it was fetched. */
export interface EntitlementRow {
  entitlement_key: string | null;
  category: string | null;
  name: string | null;
  description: string | null;
  kind: string | null;
  included: boolean | null;
  limit_value: number | null;
}

/**
 * The view's rows, as the rules object the rest of the platform asks.
 *
 * Separated from the fetch so the same mapping serves both routes to the data:
 * the query below, and the single workspace_snapshot() call that resolves the
 * whole workspace in one round trip (see lib/auth/session.ts). Two mappings
 * would eventually disagree about what a plan includes, which is the kind of
 * difference nobody notices until a customer is refused a feature they bought.
 */
export function entitlementsFrom(rows: EntitlementRow[]): Entitlements {
  return new Entitlements(
    rows.flatMap((row) => {
      if (!row.entitlement_key || !isEntitlement(row.entitlement_key)) return [];
      return [
        {
          key: row.entitlement_key,
          category: row.category ?? 'Other',
          name: row.name ?? row.entitlement_key,
          description: row.description ?? '',
          kind: row.kind === 'quota' ? ('quota' as const) : ('feature' as const),
          included: row.included ?? false,
          limit: row.limit_value,
        },
      ];
    }),
  );
}

/**
 * Reads the resolved view for one organisation.
 *
 * Cached per request. The Command Centre asks several times while rendering
 * its panels, and a subscription cannot change between two of them.
 */
export const loadEntitlements = cache(
  async (organisationId: string): Promise<Entitlements> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('organisation_entitlements')
      .select('*')
      .eq('organisation_id', organisationId)
      .order('sort_order');

    if (error || !data) {
      // Failing closed here would empty the interface over a transient
      // read, and failing open would give away the plan. The compromise is
      // the honest one: nothing is claimed, and the pages that check will
      // offer the upgrade rather than the feature.
      if (error) console.error('[amryn:billing] could not resolve entitlements', error.message);
      return EMPTY;
    }

    return entitlementsFrom(data);
  },
);

