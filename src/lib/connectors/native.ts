/**
 * The one place that knows which connectors have an implementation.
 *
 * The catalogue says a connector exists. provider.ts says what an
 * implementation must do. This is the short list joining the two, and it is
 * deliberately the only file outside src/lib/connectors/<provider> that names
 * a provider at all — the brief asked that connector availability not be
 * scattered through the application, and a page doing
 * `id === 'paystack' ? … : …` would scatter it in the worst possible place.
 *
 * ── two surfaces, two providers, on purpose ──────────────────────────────
 *
 * The web application authorises: somebody types a key, it is checked and
 * stored. It is built without a credential store, so it *cannot* read a
 * credential back — which matches the database, where connection_credential is
 * granted to service_role and the application runs as the signed-in person.
 *
 * The worker syncs: it reads credentials and never sees one typed.
 *
 * Splitting the construction is what makes that structural rather than
 * conventional. A page cannot obtain a reading provider from here, however it
 * is called.
 */
import type { ConnectorDefinition } from './catalogue';
import type { CredentialStore } from './credentials';
import { paystackProvider } from './paystack/provider';
import type { ConnectorProvider } from './provider';

/** Where somebody is sent to connect one system. */
export function connectPath(definition: ConnectorDefinition): string {
  return `/data/integrations/${definition.id}`;
}

/**
 * Built for the surface a person is looking at: can check a key, cannot read
 * one. Null where the connector has no implementation yet, which is most of
 * the catalogue and is the honest answer for all of them.
 */
export function authorisingProvider(definition: ConnectorDefinition): ConnectorProvider | null {
  switch (definition.id) {
    case 'paystack':
      return paystackProvider({ keyEntryUrl: connectPath(definition) });
    default:
      return null;
  }
}

/**
 * Built for the worker: can read credentials and pull pages.
 *
 * Takes the store rather than building one, so this file needs no database
 * client and stays readable by a unit test.
 */
export function syncingProvider(
  definition: ConnectorDefinition,
  store: CredentialStore,
): ConnectorProvider | null {
  switch (definition.id) {
    case 'paystack':
      return paystackProvider({ store, keyEntryUrl: connectPath(definition) });
    default:
      return null;
  }
}

/** Which connectors can actually be connected today, for diagnostics and tests. */
export function implemented(definitions: readonly ConnectorDefinition[]): string[] {
  return definitions.filter((d) => authorisingProvider(d) !== null).map((d) => d.id);
}
