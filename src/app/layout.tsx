import type { Metadata, Viewport } from 'next';
import { ThemeScript } from '@/components/shell/theme-script';
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
  themeColor: '#081B33',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        {/* The theme has to be applied before first paint, so this runs blocking. */}
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
