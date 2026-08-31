/**
 * Turning the auth service's errors into something a reader can act on.
 *
 * Two failures of the previous behaviour, both visible on the deployment:
 *
 *   · Sign-up printed `error.message` verbatim, so a misconfigured deployment
 *     told the reader "Invalid API key" under the password field — as though
 *     they had typed a key.
 *   · Sign-in mapped every failure to "that combination was not recognised",
 *     which is right for a wrong password and a lie for anything else. Someone
 *     with correct details would retype them indefinitely.
 *
 * The distinction that matters is whose problem it is. A wrong password is the
 * reader's to fix; a rejected key is ours, and conflating them is the
 * difference between a five-minute fix and an afternoon.
 *
 * ── two audiences ─────────────────────────────────────────────────────────
 * Getting that distinction right once meant naming the faulty setting on the
 * screen, which fixed the deployment and broke the product: a customer signing
 * in has no use for the words "anon key", cannot act on them, and reasonably
 * concludes the software is half-built.
 *
 * So each fault now carries two sentences. `message` is what the person
 * reading sees — whose fault it is and what to do, in ordinary words.
 * `detail` names the setting, and goes to the server log where whoever runs
 * the deployment will look. Neither audience reads the other's.
 */

export type AuthFaultKind =
  /** The deployment is misconfigured. Nothing the person typing can do. */
  | 'configuration'
  /** Supabase is reachable but declined for a reason of its own. */
  | 'service'
  /** The details typed in were wrong or unusable. */
  | 'credentials'
  /** The details were right, but the address has not been confirmed. */
  | 'unconfirmed';

export interface AuthFault {
  kind: AuthFaultKind;
  /** Shown to whoever is signing in. Never names a setting or a service. */
  message: string;
  /**
   * For the server log, when the fault is ours. Absent where the reader's own
   * details are at fault, because there is nothing for an operator to do.
   */
  detail?: string;
}

/**
 * Errors are deliberately vague about *which* half was wrong: telling an
 * attacker that an address exists but the password is wrong turns a login form
 * into an account-enumeration tool.
 */
export const INVALID_CREDENTIALS = 'That email and password combination was not recognised.';

/**
 * The one sentence every fault of ours ends up saying.
 *
 * It has to do three things: absolve the reader, so they stop retyping correct
 * details; say it is temporary, so they come back; and promise nothing we
 * cannot keep. It deliberately does not apologise twice or invite them to
 * contact anybody — a support address that goes nowhere is worse than none.
 */
const OUR_FAULT =
  'Amryn cannot sign you in at the moment. This is a fault on our side, not something you ' +
  'typed — please try again in a few minutes.';

/**
 * Matched on the message text because Supabase does not give these a stable
 * code, and a status alone cannot tell a rejected key from a rejected
 * password. Matching is case-insensitive and on distinctive fragments rather
 * than whole sentences, so a reworded message still lands.
 */
const PATTERNS: ReadonlyArray<{
  test: RegExp;
  kind: AuthFaultKind;
  message: string;
  detail?: string;
}> = [
  {
    test: /invalid api key|no api key|jwt expired|invalid jwt|invalid claim/i,
    kind: 'configuration',
    message: OUR_FAULT,
    detail:
      'The database rejected the API key. Check NEXT_PUBLIC_SUPABASE_ANON_KEY, then open /diagnostics.',
  },
  {
    test: /failed to fetch|network|econnrefused|enotfound|fetch failed/i,
    kind: 'configuration',
    message: OUR_FAULT,
    detail:
      'The database could not be reached at all. The project may be paused, or its address wrong. ' +
      'Open /diagnostics.',
  },
  {
    // Supabase always answers in JSON. A parse failure means something else
    // answered — a proxy, an error page, a parked domain — so the address is
    // reaching the wrong place entirely. Found by submitting the form against
    // a host the network would not route to: the reader was shown
    // "Unexpected token 'H' ... is not valid JSON", which explains nothing.
    test: /not valid json|unexpected token|unexpected end of json|json\.parse/i,
    kind: 'configuration',
    message: OUR_FAULT,
    detail:
      'The configured address answered with something that was not the database — a proxy, an ' +
      'error page, a parked domain. NEXT_PUBLIC_SUPABASE_URL is most likely wrong.',
  },
  {
    test: /database error/i,
    kind: 'configuration',
    message:
      'We could not finish creating your account. This is a fault on our side, not something ' +
      'you typed — please try again in a few minutes.',
    detail: 'The database refused the insert. Check the migrations have been applied: /diagnostics.',
  },
  {
    test: /signups? (not allowed|disabled)/i,
    kind: 'service',
    message:
      'New accounts are not being accepted here at the moment. Ask a colleague who already has ' +
      'access to invite you.',
  },
  {
    // Deliberately not "no email service is configured yet". That was true
    // when nothing was set up and became wrong the moment something was — and
    // a message that confidently names the wrong cause sends the reader to
    // check a setting that is already correct.
    test: /error sending|smtp|confirmation email/i,
    kind: 'service',
    message:
      'Your account may have been created, but we could not send the confirmation email. ' +
      'That is a fault on our side. Try signing in shortly, or ask for a new link.',
    detail: 'Confirmation email could not be sent. Check the auth mail settings and SMTP_*.',
  },
  {
    test: /rate limit|only request this after|too many requests/i,
    kind: 'service',
    message: 'Too many attempts in a short time. Wait a minute and try again.',
  },
  {
    test: /already registered|already exists|user already/i,
    kind: 'credentials',
    message: 'There is already an account with that address. Sign in instead, or reset the password.',
  },
  {
    test: /password should be|password.*at least|weak password/i,
    kind: 'credentials',
    message: 'That password is too weak. Use at least 8 characters.',
  },
  {
    test: /invalid.*email|email address.*invalid|unable to validate email/i,
    kind: 'credentials',
    message: 'That does not look like a valid email address.',
  },
  {
    // Reported plainly rather than hidden behind the vague message. Supabase
    // only returns this once the password has already been accepted, so it
    // tells an attacker nothing they did not already have — while hiding it
    // leaves a real user circling between the two forms, told their details
    // are wrong here and that their account already exists over there.
    test: /email not confirmed/i,
    kind: 'unconfirmed',
    message: 'That address has not been confirmed yet. Use the link in the email we sent when you signed up.',
  },
  {
    test: /invalid login credentials/i,
    kind: 'credentials',
    message: INVALID_CREDENTIALS,
  },
];

export function classifyAuthError(message: string | undefined | null): AuthFault {
  const text = message?.trim() ?? '';

  for (const { test, kind, message: friendly, detail } of PATTERNS) {
    if (test.test(text)) return { kind, message: friendly, detail };
  }

  // Unmatched, and no basis to blame either side. Say what happened without
  // inventing a cause, and point at the page that can find one.
  //
  // Deliberately not "Sign-in could not be completed": this same function
  // answers the sign-up form, where that wording named the wrong action.
  return {
    kind: 'service',
    message:
      'That could not be completed. This is a fault on our side, not something you typed — ' +
      'please try again in a few minutes.',
    // The raw text is the only description of the fault that exists, so it
    // goes where somebody can use it rather than under the password field.
    detail: text.length > 0 ? `Unrecognised auth error: ${text}` : 'Auth failed with no message.',
  };
}

/**
 * Puts a fault of ours where whoever runs the deployment will find it.
 *
 * This is the other half of not printing it on the screen. A message that
 * names no setting is only an improvement if the setting is named somewhere —
 * otherwise the deployment is quietly broken and nothing says so.
 *
 * The raw text is included because it is the service's own description of what
 * happened, and it never carries a key: the values are rejected, not echoed.
 */
export function reportAuthFault(fault: AuthFault, raw?: string | null): void {
  if (!fault.detail) return;
  const said = raw?.trim();
  console.error(`[amryn:auth] ${fault.detail}${said ? ` (the service said: ${said})` : ''}`);
}

/**
 * The message to show on a failed *sign-in*, having logged anything that is
 * ours to fix.
 *
 * A genuine credential failure stays vague, for the enumeration reason above.
 * A configuration or service fault does not: there is no account to enumerate
 * when the request never reached the auth server, and hiding it behind "wrong
 * password" wastes the reader's time on a problem they cannot see.
 */
export function signInErrorMessage(message: string | undefined | null): string {
  const fault = classifyAuthError(message);
  reportAuthFault(fault, message);
  return fault.kind === 'credentials' ? INVALID_CREDENTIALS : fault.message;
}

/** The same, for the forms where every fault is reported as classified. */
export function authErrorMessage(message: string | undefined | null): string {
  const fault = classifyAuthError(message);
  reportAuthFault(fault, message);
  return fault.message;
}

