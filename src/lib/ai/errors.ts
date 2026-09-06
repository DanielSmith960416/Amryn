/**
 * What can go wrong with a model call, in a module the worker can import.
 *
 * These lived in provider.ts, which imports `server-only` — a guard for the
 * React bundler whose default entry throws on import. The worker is a plain
 * Node process, so its build refuses any module that reaches for it, and
 * catching AiUnavailableError in a job handler meant pulling the whole
 * provider in behind it.
 *
 * Splitting them out is what that build error asks for, and it is the right
 * shape anyway: an error class is a fact about what happened, useful to
 * whoever is handling it, and it has no business knowing which runtime it is
 * being handled in. provider.ts re-exports both, so nothing that imports them
 * from there has to change.
 */

/** Raised when no model is configured, or the configured one cannot do the job. */
export class AiUnavailableError extends Error {
  constructor(message = 'No AI provider is configured') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** Raised when a model returns something that is not the shape we asked for. */
export class AiResponseError extends Error {
  readonly raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = 'AiResponseError';
    this.raw = raw;
  }
}
