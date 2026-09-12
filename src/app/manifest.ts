import type { MetadataRoute } from 'next';
import { withBasePath } from '@/lib/base-path';

/**
 * What the phone is told when somebody adds Amryn to a home screen.
 *
 * There was no manifest at all, so the phone improvised: it took the icon from
 * the Apple touch icon and the name from the `application-name` meta tag, and
 * drew a launch screen out of them. That screen showed the mark on a white
 * square floating on an off-white ground — the plate visible as a box, because
 * nothing had told the launcher what colour the page behind it is — with
 * "Amryn™ AIGrowthIntelligence®" stranded along the bottom edge.
 *
 * ── the name, and why it is one word here ─────────────────────────────────
 * That text is drawn by the operating system, in the operating system's own
 * font, at the size it chooses. No stylesheet reaches it, so the ™ and the ®
 * land full-size beside a system face and read as typing mistakes rather than
 * as marks — which is exactly what looked wrong.
 *
 * The fix is not to style it. It is to stop asking a launcher to carry the
 * full brand lockup in text: the icon above it already is the brand, drawn
 * properly, and every well-marked app on a home screen says the short name and
 * nothing more. `name` and `short_name` are both "Amryn" for that reason. The
 * full Amryn™ AIGrowthIntelligence® continues to appear everywhere it can be
 * set in the right face — the tab title, the sign-in card, the marketing site.
 *
 * ── and the white square ──────────────────────────────────────────────────
 * `background_color` is the white the icon's own plate is drawn on, so the two
 * meet instead of the icon sitting on the ground as a visible box. It is
 * deliberately not the platform's ground colour: the icon is navy on white by
 * decision, and matching the icon is what removes the edge.
 *
 * `theme_color` stays the ground, because that one paints the browser chrome
 * around a running page rather than the launch screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Amryn',
    short_name: 'Amryn',
    description:
      'See your business. See your market. Know what to do next. Your Executive Command Centre.',
    // The root redirects to the Command Centre, and to sign-in before that if
    // there is no session — so it is the one entry point that is right in
    // every state, which is what a launcher needs.
    start_url: withBasePath('/'),
    scope: withBasePath('/'),
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#DDE5F0',
    icons: [
      {
        src: withBasePath('/brand/amryn-app-icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        /*
         * The same artwork offered as maskable. Android crops a maskable icon
         * to whatever shape the launcher uses — a circle, a squircle — and the
         * mark sits well inside its white plate, so there is nothing near the
         * edge to lose. Without this the launcher adds its own white plate
         * around the icon and the mark ends up twice-framed and half the size.
         */
        src: withBasePath('/brand/amryn-app-icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: withBasePath('/brand/amryn-app-icon-180.png'),
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: withBasePath('/brand/amryn-favicon-32.png'),
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
