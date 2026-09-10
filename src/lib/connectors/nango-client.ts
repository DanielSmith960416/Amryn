/**
 * Nango, behind Amryn's connector interface.
 *
 * The implementation lives here rather than in nango.ts because `server-only`
 * is a marker for the React bundler and makes a file unreadable to a unit
 * test — the same reason transport.ts sits behind smtp.ts one directory over.
 * Every caller imports nango.ts and is guarded exactly as before.
 *
 * The first implementation of ConnectorProvider, and deliberately the only
 * file that knows Nango exists. Everything above the seam speaks Amryn's
 * vocabulary; everything Nango-shaped — connect sessions, integration IDs,
 * connection IDs — stops here.
 *
 * Written from Nango's own auth guide rather than from memory. Every call
 * below appears in that document; nothing is inferred from how other
 * integration platforms tend to work, because the first draft of the interface
 * was inferred that way and was wrong (see provider.ts).
 *
 * ── the flow, as it actually is ──────────────────────────────────────────
 *
 *   1. Amryn asks Nango for a connect session, naming which integration the
 *      customer may authorise and who they are.
 *   2. Nango returns a link. Amryn sends the customer to it.
 *   3. The customer authorises at the provider. Nango stores the credentials.
 *   4. Nango calls a webhook with a connection ID. Amryn stores that against
 *      the organisation.
 *
 * No authorisation code ever reaches this application, and there is no state
 * parameter to check, because the provider's redirect lands on Nango's domain
 * rather than ours. That is better than the alternative — an authorisation
 * code in our request logs is a credential in our request logs — and it is why
 * the interface has invite/adopt rather than authorise/complete.
 *
 * ── a connect link rather than the frontend SDK ──────────────────────────
 *
 * Nango offers an embedded Connect UI through @nangohq/frontend. This uses the
 * connect link instead: the session response carries one, and sending somebody
 * to a URL needs no new client dependency, ships no third-party JavaScript to
 * a page that renders customer financials, and works in an email. The embedded
 * UI is a nicer flow and can be added later behind this same interface; it is
 * not worth a bundle and a script tag to start with.
 *
 * ── ownership is ours to model ───────────────────────────────────────────
 *
 * Nango's guide says it plainly: "Nango doesn't model that ownership." The
 * connection ID means nothing on its own, so the organisation, the user and
 * their email travel out as tags and come back on the webhook, and the
 * webhook handler uses them to find the row this belongs to. Without that a
 * completed authorisation is an orphan.
 */
import {
  ProviderError,
  type ConnectionSubject,
  type ConnectorProvider,
  type Established,
  type FetchPage,
  type FetchRequest,
  type Invitation,
} from './provider';
import type { ConnectorDefinition } from './catalogue';

/** Confirmed from Nango's documentation, not assumed. */
const BASE_URL = 'https://api.nango.dev';

/**
 * How long a connect link lasts.
 *
 * Thirty minutes, per the guide. Recorded rather than computed from a response
 * field because the response does not carry an expiry — so this is Nango's
 * documented promise, and if they change it the link will fail with their
 * error rather than ours, which is the right way round.
 */
const LINK_MINUTES = 30;

/** A request timeout, because a hung integration provider must not hang a page. */
const TIMEOUT_MS = 15_000;

function apiKey(): string {
  const key = process.env.NANGO_SECRET_KEY?.trim();
  if (!key) {
    throw new ProviderError('Connected systems are not configured on this deployment.', {
      retryable: false,
    });
  }
  return key;
}

/**
 * One request to Nango, with its errors turned into ours.
 *
 * The body is never logged and never put in a ProviderError message. Nango's
 * responses can carry connection details, and a provider error is shown to a
 * customer — the two must not meet.
 */
async function call(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
): Promise<unknown> {
  /*
   * Read before the try, and the order is load-bearing.
   *
   * apiKey() throws when the deployment has no secret configured. Called
   * inside the block below it was caught by the network handler and reported
   * as "we could not reach the connection service" — marked retryable, which
   * is worse than wrong: no amount of retrying configures a secret, and the
   * message sends somebody hunting a network fault that does not exist.
   *
   * A unit test caught it. It would otherwise have been found by whoever
   * deployed without the key.
   */
  const bearer = apiKey();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (cause) {
    // A network failure or a timeout. Retryable: the customer pressing the
    // button again is a reasonable response to it.
    throw new ProviderError('We could not reach the connection service just now.', {
      retryable: true,
      cause,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    /*
     * 5xx is theirs and may pass; 4xx is ours and will not.
     *
     * The distinction matters because it decides whether the interface offers
     * "try again" — and an application that retries its own bad request
     * against a rate-limited API turns one fault into two.
     */
    throw new ProviderError(
      response.status >= 500
        ? 'The connection service is having trouble. Please try again shortly.'
        : 'That connection could not be set up.',
      { retryable: response.status >= 500 },
    );
  }

  return response.json();
}

/** Nango wraps successful responses in `data`, and sometimes does not. */
function payload(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && 'data' in body) {
    const inner = (body as { data: unknown }).data;
    if (inner && typeof inner === 'object') return inner as Record<string, unknown>;
  }
  return (body ?? {}) as Record<string, unknown>;
}

/**
 * Builds a provider for one catalogue entry.
 *
 * `integrationId` is what Nango calls the integration in its own dashboard,
 * which is not necessarily what Amryn calls the connector — so it is passed in
 * rather than assumed equal to the catalogue id. Assuming they match is the
 * kind of shortcut that works until somebody renames one of them.
 */
export function nangoProvider(id: string, integrationId: string): ConnectorProvider {
  return {
    id,

    async invite(_definition: ConnectorDefinition, subject: ConnectionSubject): Promise<Invitation> {
      const body = payload(
        await call('/connect/sessions', {
          method: 'POST',
          body: {
            // These come back on the webhook and are the only thing tying the
            // completed authorisation to an organisation.
            tags: {
              end_user_id: subject.userId,
              end_user_email: subject.userEmail,
              organization_id: subject.organisationId,
            },
            // One integration, so the customer goes straight to the provider
            // rather than meeting a picker listing systems they cannot have.
            allowed_integrations: [integrationId],
          },
        }),
      );

      const url = body.connect_link;
      if (typeof url !== 'string' || url.length === 0) {
        throw new ProviderError('The connection service did not return a link to continue with.', {
          retryable: true,
        });
      }

      return { url, expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) };
    },

    async adopt(_definition: ConnectorDefinition, reference: string): Promise<Established> {
      /*
       * The webhook said a connection exists. This asks whether it does.
       *
       * A notification is a claim made by something outside the application,
       * and the difference between a claim and a fact is one request. Writing
       * an unverified connection ID into data_connections would mean a forged
       * webhook could attach an attacker's connection to a customer's
       * organisation.
       */
      const body = payload(
        await call(`/connections/${encodeURIComponent(reference)}?provider_config_key=${encodeURIComponent(integrationId)}`),
      );

      if (!body || typeof body !== 'object') {
        throw new ProviderError('That connection could not be confirmed.', { retryable: false });
      }

      const label = body.end_user && typeof body.end_user === 'object'
        ? (body.end_user as Record<string, unknown>).email
        : undefined;

      return {
        credentialRef: reference,
        accountLabel: typeof label === 'string' ? label : undefined,
      };
    },

    async fetch(_request: FetchRequest): Promise<FetchPage> {
      /*
       * Not built, and not guessed.
       *
       * Nango's guide names two ways to read a provider's data without holding
       * its credentials — the Proxy, and Functions — and documents neither on
       * the page this adapter was written from. The auth half above is written
       * from documented calls; inventing a proxy path to sit beside it would
       * put a fabricated request in the same file as four real ones, which is
       * worse than an honest gap.
       *
       * Functions are also the wrong choice regardless: they run integration
       * logic on Nango's infrastructure, and Amryn already has a job queue with
       * leases, retries, dedupe and a drift gate. The Proxy is the piece that
       * fits — one page of documentation away.
       */
      throw new ProviderError(
        'Reading data from connected systems is not built yet. Connections can be made; nothing is synced from them.',
        { retryable: false },
      );
    },

    async revoke(_credentialRef: string): Promise<void> {
      /*
       * Also not built. Deleting a connection is documented as possible but
       * the endpoint is not on the auth guide, and this one has teeth: a
       * wrong path here does not fail loudly, it silently fails to revoke a
       * credential the customer believes they have withdrawn.
       *
       * Until it is written, disconnecting removes Amryn's row and says the
       * credential must also be revoked at the provider — which is true, and
       * better than implying an revocation that did not happen.
       */
      throw new ProviderError(
        'Disconnecting here removes the connection from Amryn. Revoke Amryn’s access at the provider as well.',
        { retryable: false },
      );
    },
  };
}
