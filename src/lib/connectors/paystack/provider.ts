/**
 * Paystack behind Amryn's connector interface.
 *
 * The second implementation of ConnectorProvider, and the first native one —
 * Amryn talks to the gateway itself rather than through an integration
 * platform. Not a change of policy: nango-client.ts is untouched and is still
 * how an OAuth connector will work. It is that Paystack authorises with a key
 * rather than a redirect, and Nango's guide for key-based integrations cannot
 * be reached from here, so writing this against Nango would have meant
 * guessing at the one thing the seam exists to make replaceable.
 *
 * ── an API key is not an OAuth flow, and this is where that shows ────────
 *
 * invite() returns a link to a page inside Amryn rather than to Paystack.
 * There is nothing to authorise at the gateway: the customer copies a key out
 * of their own dashboard and pastes it into a form here. So the invitation has
 * no expiry — see Invitation.expiresAt, which is null for exactly this case —
 * and there is no webhook, no callback and no authorisation code.
 *
 * adopt() is therefore not "turn a provider's notification into something we
 * can store". It is "the key has already been stored; prove it works before
 * telling anybody this connection is live". A key that is wrong, revoked, or
 * from the wrong Paystack account fails here rather than at two in the
 * morning during the first sync.
 *
 * revoke() cannot revoke anything. Amryn has no power to invalidate a
 * customer's Paystack key — only they can, in their own dashboard — so what it
 * does is delete Amryn's copy, which is the only part that was ever ours. The
 * interface's promise that it stays quiet when the credential is already gone
 * is kept by the store.
 *
 * ── the secret never sits still here ─────────────────────────────────────
 *
 * No field on this provider holds a key. Every method that needs one asks the
 * store, uses it for the length of one call, and lets it go. There is no
 * cache, deliberately: a cached credential outlives the disconnect that was
 * supposed to remove it, and the saving is one database round trip against a
 * request that is already crossing the internet.
 */
import type { ConnectorDefinition } from '../catalogue';
import type { CredentialStore } from '../credentials';
import {
  ProviderError,
  type ConnectionSubject,
  type ConnectorProvider,
  type Established,
  type FetchPage,
  type FetchRequest,
  type Invitation,
} from '../provider';
import { checkAccess, directTransport, type PaystackTransport } from './api';
import { readPage } from './reads';

export interface PaystackProviderOptions {
  /** Where the handles this provider is given can be exchanged for a key. */
  store: CredentialStore;
  /**
   * The page inside Amryn where somebody pastes their key.
   *
   * Passed in rather than written here, because a connector has no business
   * knowing the application's routes — and a test has no business standing up
   * a router to check one.
   */
  keyEntryUrl: string;
  /**
   * How to reach Paystack with a given key. Defaults to the real thing.
   *
   * The one seam a test needs. Everything else about this provider is
   * ordinary code; this is the line where it would otherwise open a socket.
   */
  transport?: (secretKey: string) => PaystackTransport;
}

export function paystackProvider(options: PaystackProviderOptions): ConnectorProvider {
  const { store, keyEntryUrl, transport = directTransport } = options;

  /**
   * The handle, exchanged.
   *
   * A handle that resolves to nothing is a connection whose credential has
   * been deleted — by a disconnect that half finished, or by somebody tidying
   * the Vault. It is a state to report in a sentence, not an exception to
   * decode, and it is not retryable: nothing improves by asking again.
   */
  async function withKey<T>(
    credentialRef: string,
    run: (call: PaystackTransport) => Promise<T>,
  ): Promise<T> {
    const key = await store.read(credentialRef);

    if (!key) {
      throw new ProviderError('That Paystack connection no longer has a key stored.', {
        retryable: false,
      });
    }

    return run(transport(key));
  }

  return {
    id: 'paystack',

    async invite(
      _definition: ConnectorDefinition,
      _subject: ConnectionSubject,
    ): Promise<Invitation> {
      /*
       * The subject is unused, and that is the honest shape rather than an
       * oversight.
       *
       * An OAuth provider needs it because the customer leaves Amryn and
       * something has to reconcile them on the way back. Nobody leaves here:
       * the page this points at is behind the same sign-in that produced the
       * subject in the first place, and it knows who is reading it.
       */
      return { url: keyEntryUrl, expiresAt: null };
    },

    async adopt(definition: ConnectorDefinition, reference: string): Promise<Established> {
      const account = await withKey(reference, checkAccess);

      return {
        credentialRef: reference,
        /*
         * The label says which set of keys this is, because "test" is the
         * difference between a sync that will never show revenue and one that
         * will, and it is invisible everywhere else in the interface.
         *
         * Omitted where the account has no transactions yet. A new business
         * with none is not a bad connection, and a label guessed from nothing
         * would be a claim about their account that we cannot support.
         */
        ...(account.domain ? { accountLabel: `${definition.name} (${account.domain})` } : {}),
      };
    },

    async fetch(request: FetchRequest): Promise<FetchPage> {
      return withKey(request.credentialRef, (call) =>
        readPage(call, {
          kind: request.kind,
          cursor: request.cursor,
          since: request.since,
        }),
      );
    },

    async revoke(credentialRef: string): Promise<void> {
      /*
       * Amryn's copy, and only Amryn's copy.
       *
       * There is no call to Paystack here and there cannot be: a secret key is
       * revoked by the person who owns it, in their own dashboard, and nothing
       * in the reference lets a key retire itself. Somebody disconnecting here
       * should be told that in the interface — not left to assume a key that
       * still works everywhere else has been turned off.
       */
      await store.forget(credentialRef);
    },
  };
}
