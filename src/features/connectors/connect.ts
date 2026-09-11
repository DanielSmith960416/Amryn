'use server';

/**
 * Connecting one system to Amryn, when the system is authorised by a key.
 *
 * ── the order these things happen in is the whole design ─────────────────
 *
 *   1. check the person may do this          RBAC, then plan, then quota
 *   2. check the key works                   one call, key still in hand
 *   3. only then create anything             connection row, then the secret
 *
 * Checking before storing is not tidiness. The web application deliberately
 * cannot read a stored credential — connection_credential is granted to
 * service_role, and this runs as the signed-in person — so a store-then-verify
 * order would have needed exactly the grant the design exists to withhold.
 * It is also simply better: a mistyped key leaves no connection row, no secret
 * in the Vault and nothing to clean up, just a sentence back to whoever typed
 * it.
 *
 * ── what never happens to the key here ───────────────────────────────────
 *
 * It is read out of the form, used once, written to the Vault through an RPC,
 * and goes out of scope. It is not logged, not put in a returned message, not
 * written to a column, and not kept on the connection row — every branch below
 * that reports a failure reports it in words, never with the value that caused
 * it. A key in an error message is a key in a log aggregator.
 */
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import { checkLimit } from '@/lib/auth/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { loadEntitlements } from '@/lib/billing/entitlements';
import { ourFault } from '@/lib/errors';
import { connector, storedCategory, type ConnectorDefinition } from '@/lib/connectors/catalogue';
import { mayConnect } from '@/lib/connectors/access';
import { authorisingProvider } from '@/lib/connectors/native';
import { ProviderError, authorisedByKey } from '@/lib/connectors/provider';
import type { Plan } from '@/lib/billing/access';

export type ConnectState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'connected'; name: string; label: string };

export async function connectWithKey(
  _previous: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const workspace = await requirePermission('manage_integrations');
  const organisationId = workspace.organisation.id;

  const id = String(formData.get('connector') ?? '');
  const definition = connector(id);

  if (!definition) {
    return { status: 'error', message: 'That system is not one Amryn connects to.' };
  }

  const refusal = await refuseIfNotAllowed(definition, organisationId);
  if (refusal) return refusal;

  const provider = authorisingProvider(definition);
  if (!provider || !authorisedByKey(provider)) {
    return {
      status: 'error',
      message: `${definition.name} cannot be connected with a key yet.`,
    };
  }

  const secret = String(formData.get('key') ?? '');
  if (secret.trim() === '') {
    return { status: 'error', message: `Paste your ${definition.name} key to connect.` };
  }

  const limit = await checkLimit('connectSystem', organisationId);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  /*
   * The key is used here and nowhere else in this function.
   *
   * A failure is the provider's own sentence — "Paystack would not accept that
   * key. It may have been rotated." — because the person typing it is the only
   * one who can fix it and a generic message sends them to support instead.
   */
  let label = definition.name;
  try {
    const checked = await provider.checkKey(definition, secret);
    if (checked.accountLabel) label = checked.accountLabel;
  } catch (error) {
    if (error instanceof ProviderError) return { status: 'error', message: error.message };
    return {
      status: 'error',
      message: ourFault('connectors', error, `We could not reach ${definition.name} to check that key.`),
    };
  }

  const supabase = await createClient();

  const sourceId = await dataSourceFor(definition, organisationId);
  if (!sourceId) {
    return {
      status: 'error',
      message: ourFault('connectors', null, 'We could not record that connection. Nothing was saved.'),
    };
  }

  const { data: connection, error: connectionError } = await supabase
    .from('data_connections')
    .insert({
      organisation_id: organisationId,
      data_source_id: sourceId,
      status: 'pending',
      config: { label },
    })
    .select('id')
    .single();

  if (connectionError || !connection) {
    return {
      status: 'error',
      message: ourFault('connectors', connectionError, 'We could not record that connection. Nothing was saved.'),
    };
  }

  const { error: storeError } = await supabase.rpc('store_connection_credential', {
    p_connection: connection.id,
    p_secret: secret,
  });

  if (storeError) {
    /*
     * The key was good and storing it failed, which leaves a connection row
     * pointing at nothing. Removing it is not optional: a row in 'pending'
     * with no credential is indistinguishable from one somebody abandoned
     * halfway, and it would count against the plan's quota for ever.
     */
    await supabase.from('data_connections').delete().eq('id', connection.id);
    return {
      status: 'error',
      message: ourFault('connectors', storeError, 'We could not store that key safely, so nothing was saved.'),
    };
  }

  await supabase
    .from('data_connections')
    .update({ status: 'connected' })
    .eq('id', connection.id);

  revalidatePath('/data/integrations');
  revalidatePath('/data');

  return { status: 'connected', name: definition.name, label };
}

/**
 * Asking for a sync now, rather than waiting for one.
 *
 * The RPC does the deciding — permission, whether a key is stored, whether one
 * is already running — because those are facts about the connection and the
 * database is where the connection is. Pressing the button twice returns
 * quietly rather than raising: somebody impatient has not made a mistake.
 */
export async function syncNow(formData: FormData): Promise<void> {
  const workspace = await requirePermission('manage_integrations');
  const connectionId = String(formData.get('connection') ?? '');
  if (!connectionId) return;

  const supabase = await createClient();

  // Scoped to the organisation as well as the id, for the same reason
  // disconnecting is: RLS ensures it, and a mistake in one of the two is then
  // caught by the other.
  const { data: row } = await supabase
    .from('data_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('organisation_id', workspace.organisation.id)
    .maybeSingle();

  if (!row) return;

  const { error } = await supabase.rpc('request_connection_sync', { p_connection: connectionId });
  if (error) ourFault('connectors', error, 'That sync could not be started.');

  revalidatePath('/data/integrations');
  revalidatePath('/data');
}

/**
 * Disconnecting.
 *
 * Deletes Amryn's copy of the credential and the connection row. It does not
 * and cannot retire the key at the provider — only the person who owns it can
 * do that, in their own dashboard — and the interface says so rather than
 * letting somebody assume a key that still works everywhere else is off.
 *
 * Nothing already brought in is touched. Figures that arrived through this
 * connection are the customer's own records and stay exactly where they are.
 */
export async function disconnectSystem(formData: FormData): Promise<void> {
  const workspace = await requirePermission('manage_integrations');
  const connectionId = String(formData.get('connection') ?? '');
  if (!connectionId) return;

  const supabase = await createClient();

  // Scoped to the organisation as well as the id. RLS already ensures this,
  // and saying it here too means a mistake in one of the two is caught by the
  // other rather than becoming somebody else's disconnected system.
  const { data: row } = await supabase
    .from('data_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('organisation_id', workspace.organisation.id)
    .maybeSingle();

  if (!row) return;

  const { error } = await supabase.rpc('forget_connection_credential', {
    p_connection: connectionId,
  });

  // The credential first, the row second. The other order can leave a secret
  // in the Vault with nothing pointing at it — unreachable, undeletable
  // through the application, and still a live credential.
  if (error) {
    ourFault('connectors', error, 'That connection could not be removed.');
    return;
  }

  await supabase.from('data_connections').delete().eq('id', connectionId);

  revalidatePath('/data/integrations');
  revalidatePath('/data');
}

/** Plan, entitlement and quota, in the words access.ts already chose. */
async function refuseIfNotAllowed(
  definition: ConnectorDefinition,
  organisationId: string,
): Promise<ConnectState | null> {
  const supabase = await createClient();

  const [entitlements, { data: connections }, { data: subscription }] = await Promise.all([
    loadEntitlements(organisationId),
    supabase.from('data_connections').select('id').eq('organisation_id', organisationId),
    supabase.from('subscriptions').select('plan').eq('organisation_id', organisationId).maybeSingle(),
  ]);

  const decision = mayConnect(definition, {
    plan: (subscription?.plan ?? 'starter') as Plan,
    entitlements,
    used: (connections ?? []).length,
  });

  if (decision.allowed) return null;

  return {
    status: 'error',
    message: decision.remedy ? `${decision.detail} ${decision.remedy}` : decision.detail,
  };
}

/**
 * The data_sources row this connection hangs off, made once and reused.
 *
 * data_sources is unique on (organisation_id, name), so connecting Paystack a
 * second time after disconnecting finds the existing row rather than failing
 * on a constraint the customer never sees and cannot act on.
 */
async function dataSourceFor(
  definition: ConnectorDefinition,
  organisationId: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('data_sources')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('name', definition.name)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('data_sources')
    .insert({
      organisation_id: organisationId,
      name: definition.name,
      category: storedCategory(definition) as 'api',
      provider: definition.id,
      description: definition.description,
    })
    .select('id')
    .single();

  if (error || !created) {
    ourFault('connectors', error, 'We could not record that system.');
    return null;
  }

  return created.id;
}
