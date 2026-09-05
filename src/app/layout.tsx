import type { Metadata, Viewport } from 'next';
import { ThemeScript } from '@/components/shell/theme-script';
import { RuntimeEnv } from '@/components/shell/runtime-env';
import { withBasePath } from '@/lib/base-path';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Amryn™ AIGrowthIntelligence® — Executive Command Centre',
    template: '%s · Amryn™ AIGrowthIntelligence®',
  },
  description:
    'See your business. See your market. Know what to do next. Amryn combines a continuously ' +
    'updated DigitalTwin® of your operations with external OpportunityRadar® intelligence, in ' +
    'one Executive Command Centre.',
  applicationName: 'Amryn™ AIGrowthIntelligence®',
  icons: { icon: withBasePath('/brand/amryn-icon-mark.png') },
  openGraph: {
    title: 'Amryn™ AIGrowthIntelligence®',
    description: 'See Your Business. See Your Market. Know What To Do Next.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  /* Paints the phone's browser chrome to match the ground the page sits on.
     It was still the navy of the theme that was withdrawn, so the bar above
     the page disagreed with the page. Medium's ground is close enough that
     one value serves both themes. */
  themeColor: '#DDE5F0',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        {/* The theme has to be applied before first paint, so this runs blocking. */}
        <ThemeScript />
        {/* Before any client component asks for a Supabase client, which is why
            it is here and not deferred. */}
        <RuntimeEnv />
        {/* The faces are served from this origin — see the note in globals.css.
            Both of these set the first screen and neither is discovered until
            the stylesheet has parsed, so preloading starts them alongside it
            rather than one round trip behind. The mono is not preloaded: it
            sets figures, which are below the fold on most routes. */}
        <link
          rel="preload"
          href={withBasePath("/fonts/outfit-latin-var.woff2")}
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
        <link
          rel="preload"
          href={withBasePath("/fonts/ibm-plex-sans-latin-var.woff2")}
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
