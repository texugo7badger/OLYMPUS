import type { Metadata, Viewport } from 'next';

/**
 * /m/widget — the installable OLYMPUS live widget (v0.0.85).
 *
 * Same icon and palette as /m; only the start surface differs. The manifest
 * is generated per request from the active theme.
 */
export const metadata: Metadata = {
  title: 'OLYMPUS · live widget',
  description: 'A live view of the campaign: progress, GO Plus buckets, hops and the terminal queue.',
  applicationName: 'OLYMPUS Live',
  manifest: '/m/widget/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OLYMPUS Live',
  },
  icons: {
    icon: [{ url: '/m/icon/192', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/m/icon/180', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0A0E16',
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
