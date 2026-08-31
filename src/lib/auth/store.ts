import 'server-only';

/**
 * Where client accounts live.
 *
 * The previous build put accounts in Supabase, with row-level security and a
 * 45-table schema behind them. This build does not: it is a website that acts
 * like an app, and on day one an account is an email, a hashed password and the
 * name of the business.
 *
 * `AccountStore` is the seam. Two implementations ship — an in-process one so
 * the platform runs with no configuration at all, and an Upstash Redis one for
 * a real deployment. A third (Clerk, Auth.js, a database) is a new file
 * implementing this interface; nothing above it changes.
 */

export interface Account {
  id: string;
  email: string;
  /** scrypt output, `scrypt$N$r$p$salt$hash`. Never leaves the server. */
  passwordHash: string;
  fullName: string;
  companyName: string;
  createdAt: string;
}

export interface AccountStore {
  /** Case-insensitive: emails are compared lowercased. */
  findByEmail(email: string): Promise<Account | null>;
  findById(id: string): Promise<Account | null>;
  /** Rejects with `EmailTakenError` if the address is already registered. */
  create(account: Account): Promise<Account>;
}

export class EmailTakenError extends Error {
  constructor() {
    super('An account with that email address already exists.');
    this.name = 'EmailTakenError';
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─── In-memory ──────────────────────────────────────────────────────────────

/**
 * The zero-configuration store.
 *
 * It is held on `globalThis` so that Next's dev-server module reloading does
 * not silently sign everyone out mid-session. It is still process-local and
 * still lost on restart, which is exactly why `describeStore` says so out loud
 * and the sign-up page shows a banner: an account that quietly evaporates on
 * the next deploy is worse than one that was never offered.
 */
class MemoryAccountStore implements AccountStore {
  private get accounts(): Map<string, Account> {
    const g = globalThis as { __amrynAccounts?: Map<string, Account> };
    g.__amrynAccounts ??= new Map();
    return g.__amrynAccounts;
  }

  async findByEmail(email: string): Promise<Account | null> {
    return this.accounts.get(normaliseEmail(email)) ?? null;
  }

  async findById(id: string): Promise<Account | null> {
    for (const account of this.accounts.values()) {
      if (account.id === id) return account;
    }
    return null;
  }

  async create(account: Account): Promise<Account> {
    const key = normaliseEmail(account.email);
    if (this.accounts.has(key)) throw new EmailTakenError();
    const stored = { ...account, email: key };
    this.accounts.set(key, stored);
    return stored;
  }
}

// ─── Upstash Redis (REST) ───────────────────────────────────────────────────

/**
 * Production storage over Upstash's REST API.
 *
 * REST rather than a Redis client because Vercel's edge and serverless runtimes
 * cannot hold a TCP connection open, and because it means no driver dependency.
 * Two keys per account — one by email for the login lookup, one by id for
 * session resumption.
 */
class UpstashAccountStore implements AccountStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async command<T>(...args: string[]): Promise<T> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      cache: 'no-store',
    });

    if (!response.ok) {
      // The body can echo the command, and the command can contain a password
      // hash. Report the status and nothing else.
      throw new Error(`Account store request failed (${response.status}).`);
    }

    const body = (await response.json()) as { result: T };
    return body.result;
  }

  private async get(key: string): Promise<Account | null> {
    const raw = await this.command<string | null>('GET', key);
    return raw ? (JSON.parse(raw) as Account) : null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    return this.get(`amryn:account:email:${normaliseEmail(email)}`);
  }

  async findById(id: string): Promise<Account | null> {
    return this.get(`amryn:account:id:${id}`);
  }

  async create(account: Account): Promise<Account> {
    const stored = { ...account, email: normaliseEmail(account.email) };
    const payload = JSON.stringify(stored);

    // NX makes the email key the claim on the address. Two simultaneous
    // sign-ups for one address cannot both succeed, without a transaction.
    const claimed = await this.command<string | null>(
      'SET',
      `amryn:account:email:${stored.email}`,
      payload,
      'NX',
    );
    if (claimed === null) throw new EmailTakenError();

    await this.command('SET', `amryn:account:id:${stored.id}`, payload);
    return stored;
  }
}

// ─── Selection ──────────────────────────────────────────────────────────────

let cached: AccountStore | undefined;

export function accountStore(): AccountStore {
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  cached = url && token ? new UpstashAccountStore(url, token) : new MemoryAccountStore();
  return cached;
}

export interface StoreDescription {
  kind: 'memory' | 'upstash';
  durable: boolean;
  note: string;
}

/** What the running deployment is actually storing accounts in. */
export function describeStore(): StoreDescription {
  const configured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );

  return configured
    ? {
        kind: 'upstash',
        durable: true,
        note: 'Accounts are stored in Upstash Redis and survive restarts and redeploys.',
      }
    : {
        kind: 'memory',
        durable: false,
        note:
          'No account store is configured, so accounts are held in memory only and are lost when ' +
          'the server restarts. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to make ' +
          'sign-ups durable.',
      };
}

/** Test seam — lets a test swap the store and put it back. */
export function __setAccountStore(store: AccountStore | undefined): void {
  cached = store;
}
