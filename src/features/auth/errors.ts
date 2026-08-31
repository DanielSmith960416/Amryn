/**
 * Turning Supabase's auth errors into something a reader can act on.
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
 * reader's to fix; an unaccepted API key is the operator's, and saying so is
 * the difference between a five-minute fix and an afternoon.
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
  message: string;
}

/**
 * Errors are deliberately vague about *which* half was wrong: telling an
 * attacker that an address exists but the password is wrong turns a login form
 * into an account-enumeration tool.
 */
export const INVALID_CREDENTIALS = 'That email and password combination was not recognised.';

const CONFIG_FAULT =
  'This deployment cannot reach its database — its Supabase key is not being accepted. ' +
  'Nothing is wrong with what you typed. Open /diagnostics for the specific setting at fault.';

/**
 * Matched on the message text because Supabase does not give these a stable
 * code, and a status alone cannot tell a rejected key from a rejected
 * password. Matching is case-insensitive and on distinctive fragments rather
 * than whole sentences, so a reworded message still lands.
 */
const PATTERNS: ReadonlyArray<{ test: RegExp; kind: AuthFaultKind; message: string }> = [
  {
    test: /invalid api key|no api key|jwt expired|invalid jwt|invalid claim/i,
    kind: 'configuration',
    message: CONFIG_FAULT,
  },
  {
    test: /failed to fetch|network|econnrefused|enotfound|fetch failed/i,
    kind: 'configuration',
    message:
      'This deployment could not reach its database at all. Nothing is wrong with what you typed. ' +
      'Open /diagnostics — the project may be paused, or its address may be wrong.',
  },
  {
    // Supabase always answers in JSON. A parse failure means something else
    // answered — a proxy, an error page, a parked domain — so the address is
    // reaching the wrong place entirely. Found by submitting the form against
    // a host the network would not route to: the reader was shown
    // "Unexpected token 'H' ... is not valid JSON", which explains nothing.
    test: /not valid json|unexpected token|unexpected end of json|json\.parse/i,
    kind: 'configuration',
    message:
      'The address configured for this deployment answered with something that was not Supabase. ' +
      'Nothing is wrong with what you typed. Open /diagnostics — the project URL is most likely wrong.',
  },
  {
    test: /database error/i,
    kind: 'configuration',
    message:
      'The database refused to create the account. Nothing is wrong with what you typed. ' +
      'Open /diagnostics to check the migrations have been applied.',
  },
  {
    test: /signups? (not allowed|disabled)/i,
    kind: 'service',
    message: 'New accounts are turned off for this workspace. Ask whoever administers it for an invitation.',
  },
  {
    // Deliberately not "no email service is configured yet". That was true
    // when nothing was set up and became wrong the moment something was — and
    // a message that confidently names the wrong cause sends the reader to
    // check a setting that is already correct.
    test: /error sending|smtp|confirmation email/i,
    kind: 'service',
    message:
      'The account may have been created, but the confirmation email could not be sent. ' +
      'That is a fault in this deployment, not in what you typed. Whoever administers it ' +
      'should check the mail settings under Supabase → Authentication → Emails.',
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

  for (const { test, kind, message: friendly } of PATTERNS) {
    if (test.test(text)) return { kind, message: friendly };
  }

  // Unmatched, and no basis to blame either side. Say what happened without
  // inventing a cause, and point at the page that can find one.
  //
  // Deliberately not "Sign-in could not be completed": this same function
  // answers the sign-up form, where that wording named the wrong action.
  return {
    kind: 'service',
    message:
      text.length > 0
        ? `That could not be completed: ${text}. If this persists, open /diagnostics.`
        : 'That could not be completed, and no reason was given. Open /diagnostics.',
  };
}

/**
 * The message to show on a failed *sign-in*.
 *
 * A genuine credential failure stays vague, for the enumeration reason above.
 * A configuration or service fault does not: there is no account to enumerate
 * when the request never reached the auth server, and hiding it behind "wrong
 * password" wastes the reader's time on a problem they cannot see.
 */
export function signInErrorMessage(message: string | undefined | null): string {
  const fault = classifyAuthError(message);
  return fault.kind === 'credentials' ? INVALID_CREDENTIALS : fault.message;
}

