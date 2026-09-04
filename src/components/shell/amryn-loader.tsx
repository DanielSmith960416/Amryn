/**
 * The mark, drawn while a page is on its way.
 *
 * Deliberately not a generic spinner. The moment a page takes long enough to
 * need one is the moment the product is either recognisably yours or
 * anonymous, and this one is the Amryn chevron: two strokes that sweep along
 * their own path inside a ring that turns.
 *
 * It is pure SVG and CSS — no image to fetch, so it can render on the very
 * first frame of a navigation, which is the only frame that matters here. It
 * inherits `currentColor`, so it works on glass in either theme without being
 * told which one it is in.
 *
 * Both animations are declared in globals.css, which is where the
 * reduced-motion rule lives: a reader who has asked the operating system for
 * less movement gets the mark, held still, rather than nothing.
 */
export function AmrynMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-hidden
      className="text-[var(--brand)]"
    >
      {/* The ring: a broken circle, so the rotation is visible. */}
      <circle
        cx="32"
        cy="32"
        r="28"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="2"
      />
      <circle
        cx="32"
        cy="32"
        r="28"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="44 132"
        className="amryn-ring"
      />

      {/* The chevron — the outer sweep and the inner counter-stroke that make
          up the Amryn mark. */}
      <path
        d="M18 44 L32 18 L46 44"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="amryn-mark-stroke"
      />
      <path
        d="M34 44 L40 31"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="amryn-mark-stroke"
        style={{ animationDelay: '0.3s' }}
      />
    </svg>
  );
}

/**
 * The full-page loading state for the client area.
 *
 * A line of text under the mark, because "loading" with no object is the least
 * useful thing an interface can say. The caller names what is being fetched.
 */
export function AmrynLoader({
  label = 'Opening your workspace',
  /** Full-page by default; `inline` for a loader living inside a panel. */
  inline = false,
}: {
  label?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-5 px-6 ${
        inline ? 'py-10' : 'min-h-[60dvh]'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="amryn-lift">
        <AmrynMark size={52} />
      </div>
      <p className="text-[0.875rem] text-[var(--text-secondary)]">{label}…</p>
    </div>
  );
}
