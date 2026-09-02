import 'server-only';

/**
 * Which workspace the person looking at the screen should see.
 *
 * Resolved once per request and cached, because the Command Centre alone asks
 * for it while rendering a dozen panels.
 */
import { cache } from 'react';
import { getWorkspace } from '@/lib/auth/session';
import { loadWorkspace, type Workspace } from './demo';
import { organisationWorkspace } from './from-database';

export type WorkspaceState =
  /** The customer's own figures. */
  | { kind: 'ready'; workspace: Workspace }
  /** A real organisation with nothing imported yet. */
  | { kind: 'empty'; organisationName: string }
  /** The demonstration business, shown deliberately. */
  | { kind: 'demo'; workspace: Workspace };

/**
 * A demonstration organisation is one that says it is.
 *
 * Deliberately opt-in on the organisation record rather than inferred from
 * having no data. Inferring it is what the product did — anything without
 * figures got the demonstration company — and it meant a genuine customer's
 * first impression was another business's revenue, presented as their own
 * Command Centre.
 */
function isDemoOrganisation(settings: unknown): boolean {
  return (settings as { demo?: boolean } | null)?.demo === true;
}

export const currentWorkspace = cache(async (asOf?: Date): Promise<WorkspaceState> => {
  const session = await getWorkspace();

  // No session at all: the report routes and the build's prerender pass reach
  // here. The demonstration business is the right answer for both — it is
  // what those pages exist to render — and neither can leak a customer's data
  // because there is no customer.
  if (!session) return { kind: 'demo', workspace: loadWorkspace(asOf) };

  if (isDemoOrganisation(session.organisation.settings)) {
    return { kind: 'demo', workspace: loadWorkspace(asOf) };
  }

  const workspace = await organisationWorkspace(session.organisation.id, asOf);
  if (workspace) return { kind: 'ready', workspace };

  return { kind: 'empty', organisationName: session.organisation.name };
});
