/**
 * The error line under an auth form.
 *
 * It used to turn a mention of /diagnostics into a link, because the message
 * it was rendering named that page. It no longer does: the messages a customer
 * sees say whose fault something is and what to do about it, and the setting
 * at fault goes to the server log instead. An operator tool advertised under
 * the password field is a customer's first impression of half-built software.
 *
 * What remains is the part that always mattered — role="alert", so a failure
 * announced only in colour is announced to a screen reader too.
 */
export function AuthError({ message }: { message: string }) {
  return (
    <p className="text-[0.8125rem] leading-relaxed text-[var(--negative)]" role="alert">
      {message}
    </p>
  );
}
