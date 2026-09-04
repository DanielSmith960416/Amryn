/**
 * The mark, drawn while a page is on its way.
 *
 * Deliberately not a generic spinner. The moment a page takes long enough to
 * need one is the moment the product is either recognisably yours or
 * anonymous, and this one is the Amryn mark itself — not an approximation of
 * it. The two paths below are a trace of brand/amryn-icon-mark@2x.png, fitted
 * to the box and otherwise untouched: same proportions, same curve where the
 * inner edge sweeps down, same asymmetry between the two forms. An earlier
 * version drew a symmetrical stroked chevron, which is a different letter.
 *
 * It is pure SVG and CSS — no image to fetch, so it can render on the very
 * first frame of a navigation, which is the only frame that matters here. It
 * inherits `currentColor`, so it works on glass in either theme without being
 * told which one it is in.
 *
 * The animations are declared in globals.css, which is where the
 * reduced-motion rule lives: a reader who has asked the operating system for
 * less movement gets the mark, held still, rather than nothing.
 */
export function AmrynMark({ size = 88 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      role="img"
      aria-hidden
      className="text-[var(--brand)]"
    >
      {/* The ring the mark turns inside: a full circle held faint, and a
          quarter of it travelling round, so the rotation is legible. */}
      <circle
        cx="48"
        cy="48"
        r="45"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="2.5"
      />
      <circle
        cx="48"
        cy="48"
        r="45"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="62 208"
        className="amryn-ring"
      />

      {/* The mark. Two forms, breathing a beat apart — enough to read as
          alive, not enough to read as flicker. */}
      <path
        d="M 47.11 19.1 C 46.63 19.28, 46.45 19.47, 46.08 20.21 C 45.89 20.6, 20.9 72.24, 19.78 74.58 C 19.2 75.78, 19.84 76.97, 21.06 76.97 L 21.47 76.97 30.59 73.58 C 39.9 70.12, 40.01 70.07, 40.26 69.7 C 40.43 69.45, 46.84 56.42, 47 56.01 C 49.07 50.54, 53.51 44.78, 58.57 40.99 C 58.95 40.71, 59.25 40.46, 59.25 40.43 C 59.25 40.31, 48.97 19.72, 48.82 19.53 C 48.45 19.08, 47.69 18.88, 47.11 19.1"
        fill="currentColor"
        className="amryn-mark-form"
      />
      <path
        d="M 58.81 42.6 C 54.13 47.34, 50.96 54.01, 50.96 59.13 L 50.96 59.75 53.49 64.73 C 56.09 69.86, 56.15 69.97, 56.46 70.17 C 56.57 70.24, 60.69 71.8, 65.62 73.63 C 74.1 76.79, 74.6 76.97, 74.91 76.97 C 75.94 76.97, 76.73 75.89, 76.4 74.93 C 76.31 74.67, 59.88 41.64, 59.83 41.63 C 59.81 41.62, 59.35 42.06, 58.81 42.6"
        fill="currentColor"
        className="amryn-mark-form"
        style={{ animationDelay: "0.35s" }}
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
  label = "Opening your workspace",
  /** Full-page by default; `inline` for a loader living inside a panel. */
  inline = false,
}: {
  label?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-6 px-6 ${
        inline ? "py-12" : "min-h-[60dvh]"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="amryn-lift">
        <AmrynMark />
      </div>
      <p className="text-[0.875rem] text-[var(--text-secondary)]">{label}…</p>
    </div>
  );
}
