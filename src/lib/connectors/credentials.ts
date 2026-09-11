/**
 * How a connector implementation asks for the credential it was given.
 *
 * The seam inside the seam. ConnectorProvider deals in an opaque
 * `credentialRef` and is deliberately never told which connection,
 * organisation or customer it belongs to — so something has to turn that
 * handle back into a usable secret, and this is the smallest possible
 * description of that something.
 *
 * Two methods, no constructor, no client: an implementation can be the real
 * store, or a Map in a test, and a provider cannot tell the difference. That
 * is what lets every provider below the seam be tested without a database, a
 * network or a real credential anywhere near it.
 *
 * ── what an implementation owes callers ──────────────────────────────────
 *
 * `read` returns null rather than throwing for a handle that resolves to
 * nothing. A connection whose credential has been deleted is a state to
 * report, not an exception to catch, and the provider turns it into a sentence
 * a customer can act on.
 *
 * `forget` does not throw when there is nothing to forget, for the same reason
 * ConnectorProvider.revoke() does not: somebody who revoked their key at the
 * provider first and disconnected afterwards has done the right thing in the
 * wrong order.
 */
export interface CredentialStore {
  /** The secret behind a handle, or null where the handle resolves to nothing. */
  read(credentialRef: string): Promise<string | null>;
  /** Delete Amryn's copy. Quiet when it is already gone. */
  forget(credentialRef: string): Promise<void>;
}

/**
 * A store backed by a Map, for tests and for nothing else.
 *
 * Exported rather than redefined in four test files. It is not exported from
 * an index and no production path imports it; a provider that reached for this
 * would fail the moment it ran, because nothing would have put anything in it.
 */
export function credentialsIn(entries: Record<string, string>): CredentialStore {
  const held = new Map(Object.entries(entries));
  return {
    async read(ref) {
      return held.get(ref) ?? null;
    },
    async forget(ref) {
      held.delete(ref);
    },
  };
}
