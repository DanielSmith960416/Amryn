/**
 * The error line under an auth form.
 *
 * A configuration fault tells the reader to open /diagnostics, which is only
 * useful if they can get there. Written as plain text it is a path they would
 * have to retype into the address bar — so the mention is turned into the link
 * it is pretending to be.
 */
const DIAGNOSTICS = '/diagnostics';

export function AuthError({ message }: { message: string }) {
  const at = message.indexOf(DIAGNOSTICS);

  return (
    <p className="text-[0.8125rem] leading-relaxed text-[var(--negative)]" role="alert">
      {at === -1 ? (
        message
      ) : (
        <>
          {message.slice(0, at)}
          <a href={DIAGNOSTICS} className="underline underline-offset-2">
            {DIAGNOSTICS}
          </a>
          {message.slice(at + DIAGNOSTICS.length)}
        </>
      )}
    </p>
  );
}
