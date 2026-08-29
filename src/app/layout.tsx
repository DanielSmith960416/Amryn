import type { Metadata, Viewport } from 'next';
import { ThemeScript } from '@/components/shell/theme-script';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Amryn™ AIGrowthIntelligence® Software',
    template: '%s · Amryn™',
  },
  description:
    'See your business. See your market. Know what to do next. Amryn combines a continuously ' +
    'updated AI DigitalTwin® of your operations with external AI OpportunityRadar® intelligence, ' +
    'in one Executive Command Centre.',
  icons: { icon: '/brand/amryn-icon-mark.png' },
  applicationName: 'Amryn',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F7FA' },
    { media: '(prefers-color-scheme: dark)', color: '#081B33' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
