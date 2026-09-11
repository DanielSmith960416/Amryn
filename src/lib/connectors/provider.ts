/**
 * The seam between Amryn and whoever actually holds the connection.
 *
 * The brief that asked for this was explicit: do not make Amryn dependent on
 * Nango's data model. So this file is Amryn's own vocabulary, and Nango — or a
 * native connector, or one written for a single customer — is an
 * implementation of it:
 *
 *     the customer
 *          ↓
 *     an Amryn connection      data_connections, organisation_id, quota
 *          ↓
 *     a ConnectorProvider      this file
 *          ↓
 *     Nango / native / custom  one adapter each
 *          ↓
 *     Amryn's own tables       financial_records, with provenance
 *
 * The value of the seam is not theoretical. Nango is a commercial dependency
 * whose pricing, hosting region and continued existence are outside our
 * control, and a customer's accounting credentials are the last thing that
 * should be hard to move. Everything above this line is ours; replacing what
 * is below it should be one file, not a project.
 *
 * ── what is deliberately NOT here ────────────────────────────────────────
 *
 * No Nango types, no `providerConfigKey`, no `connectionId`. Those are Nango's
 * words. An adapter may use them internally and must not let them out: the
 * moment a Nango identifier appears in data_connections or in a page, the
 * abstraction has stopped being one and switching providers means a migration.
 *
 * `credentialRef` is how that is avoided. It is an opaque string, meaningful
 * only to the adapter that issued it, and data_connections has carried the
 * column since migration 01.
 */
import type { ConnectorDefinition } from './catalogue';

/** Raised when a provider cannot do something, in words safe to show a customer. */
export class ProviderError extends Error {
  /** Whether trying again could reasonably succeed. */
  readonly retryable: boolean;

  constructor(message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * Where to send the customer to authorise, and what identifies the attempt.
 *
 * ── this interface was wrong, and the documentation corrected it ─────────
 *
 * The first version had authorise() return a URL and a state, and complete()
 * take a code and a state — the classic redirect-with-code dance. That is what
 * OAuth looks like when you implement it yourself, and it is not what happens
 * here.
 *
 * The provider holds the whole flow. Amryn asks for a session, sends the
 * customer to a link, and is told the outcome by webhook: there is no
 * authorisation code that reaches this application, and no state parameter for
 * it to check, because the redirect never lands on our domain.
 *
 * Which is the better arrangement — an authorisation code in our request logs
 * is a credential in our request logs — but it is a different shape, and the
 * shape was guessed before the facts arrived. Recorded rather than quietly
 * rewritten, because "the abstraction was designed against an imagined API"
 * is the failure most likely to repeat.
 */
export interface Invitation {
  /**
   * Where to send the customer. Short-lived — thirty minutes for Nango — so it
   * is generated per attempt and never stored.
   */
  url: string;
  /**
   * When it stops working, so the interface can say so rather than fail.
   *
   * Null where nothing expires. That is not every provider's story: a
   * connector authorised by pasting an API key is sent to a page inside Amryn,
   * behind the same sign-in and the same permission as every other page, and
   * there is no third-party session with a clock on it. Giving that an invented
   * thirty-minute expiry would put a deadline in the interface that nothing
   * enforces, which is worse than saying there isn't one.
   */
  expiresAt: Date | null;
}

/** What a completed authorisation gives Amryn, once the provider reports it. */
export interface Established {
  /**
   * Opaque handle the adapter can exchange for a working credential later.
   *
   * Amryn stores it and never interprets it. It is not a token — no access
   * token, refresh token or secret is ever returned across this interface,
   * which is what lets the adapter keep them somewhere Amryn's database is not.
   */
  credentialRef: string;
  /** What the provider calls this account, for the connection card. */
  accountLabel?: string;
  /** Scopes actually granted, where the provider says. */
  grantedScopes?: readonly string[];
}

/**
 * Who the invitation is for, so the provider's callback can be reconciled.
 *
 * The provider does not model which organisation owns a connection — Nango's
 * own guide says so plainly, "Nango doesn't model that ownership" — so these
 * travel out with the invitation and come back with the notification. They are
 * the only thing tying a completed authorisation to a row in data_connections.
 */
export interface ConnectionSubject {
  organisationId: string;
  userId: string;
  userEmail: string;
}

/** One record pulled from a provider, before Amryn maps it to its own tables. */
export interface FetchedRecord {
  /** The provider's own identifier, so a second sync updates rather than duplicates. */
  externalId: string;
  /** What kind of thing this is — one of the connector's intendedReads. */
  kind: string;
  /** The provider's payload, unmapped. Mapping is the caller's job, not the adapter's. */
  attributes: Record<string, unknown>;
  /** When the provider last changed it, where it says. */
  updatedAt?: string;
}

export interface FetchPage {
  records: readonly FetchedRecord[];
  /**
   * Where to resume, or null at the end.
   *
   * Opaque for the same reason credentialRef is: a cursor is a provider's
   * private business, and a sync that understood its shape would break when
   * the provider changed it.
   */
  cursor: string | null;
}

export interface FetchRequest {
  credentialRef: string;
  kind: string;
  /** Null for a first full sync; otherwise where the last one stopped. */
  cursor: string | null;
  /** Only records changed since this, where the provider supports it. */
  since: Date | null;
}

/**
 * What every connector implementation provides.
 *
 * Read-only on purpose. Amryn draws conclusions from a business's systems and
 * does not write back to them, and a customer connecting their accounts should
 * not have to wonder whether an analytics product can post a journal entry.
 * `intendedWrites` in the catalogue is empty everywhere for the same reason.
 * When that changes it will be a deliberate decision with its own consent, not
 * a method that was here from the start.
 */
export interface ConnectorProvider {
  /** Which catalogue entry this serves. */
  readonly id: string;

  /** Ask for a link that lets one person authorise one system. */
  invite(definition: ConnectorDefinition, subject: ConnectionSubject): Promise<Invitation>;

  /**
   * Turn a completed authorisation into something Amryn can store.
   *
   * Called when the provider says an authorisation succeeded, with whatever
   * identifier it reported. Throws ProviderError if that identifier does not
   * resolve to a live connection — a notification is a claim, and a claim from
   * outside the application is checked before it is written down.
   */
  adopt(definition: ConnectorDefinition, reference: string): Promise<Established>;

  /** Pull one page. */
  fetch(request: FetchRequest): Promise<FetchPage>;

  /**
   * Give the credential back.
   *
   * Called on disconnect, and expected not to throw when the credential is
   * already gone: a customer disconnecting an account they have revoked at the
   * provider's end is doing the right thing in the wrong order, and should not
   * meet an error for it.
   */
  revoke(credentialRef: string): Promise<void>;
}

/**
 * What checking a typed-in key tells Amryn.
 *
 * ── the second time this interface met a fact and had to move ────────────
 *
 * provider.ts already records one correction: authorise/complete was guessed
 * from how OAuth looks when you write it yourself, and the documentation said
 * otherwise. This is the second, and it is worth the same honesty.
 *
 * adopt() assumes the credential is already stored and can be read back by its
 * handle. That is true for a provider holding the credential on its own
 * servers, and it is exactly wrong for a key the customer types into Amryn:
 * the web application deliberately cannot read a stored credential —
 * connection_credential is granted to service_role and the application runs as
 * the signed-in person — so an adopt()-shaped check would have needed the one
 * grant this design exists to withhold.
 *
 * The order that actually works is the better order anyway. Check the key
 * while it is still in hand, and store it only once it works. A typo then
 * costs nothing: no connection row, no secret in the Vault, nothing to clean
 * up, and a sentence back to the person who typed it.
 */
export interface KeyCheck {
  /** What to call this account on its card, where the provider says anything. */
  accountLabel?: string;
  /** Scopes actually granted, where the provider says. */
  grantedScopes?: readonly string[];
}

/**
 * A connector authorised by a key rather than by a redirect.
 *
 * `authorisedBy` is a discriminator rather than a comment: the page that
 * renders a connect flow has to know which of the two it is looking at, and
 * asking the catalogue's `auth` field would be asking a declaration what the
 * implementation does.
 */
export interface KeyAuthorisedProvider extends ConnectorProvider {
  readonly authorisedBy: 'key';

  /**
   * Use a key once, before Amryn stores it anywhere.
   *
   * Throws ProviderError — in words safe to show whoever typed it — when the
   * provider will not accept it.
   */
  checkKey(definition: ConnectorDefinition, secret: string): Promise<KeyCheck>;
}

export function authorisedByKey(
  provider: ConnectorProvider,
): provider is KeyAuthorisedProvider {
  return (provider as KeyAuthorisedProvider).authorisedBy === 'key';
}

/**
 * The registry of implementations.
 *
 * Empty at the moment, and that is the honest state: no provider has been
 * written, because the catalogue lists nothing as confirmed. A connector
 * without an implementation is not connectable — isConnectable() already says
 * so from the catalogue's side, and this says it from the runtime's.
 */
const PROVIDERS = new Map<string, ConnectorProvider>();

export function registerProvider(provider: ConnectorProvider): void {
  PROVIDERS.set(provider.id, provider);
}

export function providerFor(id: string): ConnectorProvider | null {
  return PROVIDERS.get(id) ?? null;
}

/** Which connectors have an implementation behind them, for diagnostics. */
export function implementedProviders(): string[] {
  return [...PROVIDERS.keys()].sort();
}

/**
 * The provider, or a refusal that says which of the two reasons it is.
 *
 * "Not built" and "built but the catalogue has not been confirmed" are
 * different states with the same symptom, and telling them apart is the
 * difference between waiting for engineering and waiting for somebody to read
 * a page of documentation.
 */
export function requireProvider(definition: ConnectorDefinition): ConnectorProvider {
  const provider = providerFor(definition.id);

  if (!provider) {
    throw new ProviderError(
      `${definition.name} has no connector implementation yet.`,
      { retryable: false },
    );
  }

  if (definition.verification === 'unconfirmed') {
    throw new ProviderError(
      `${definition.name} has not been checked against its provider's documentation, so it is not open for connections.`,
      { retryable: false },
    );
  }

  return provider;
}
