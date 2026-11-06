import type { Metadata, Viewport } from 'next';

/**
 * /m — the installable OLYMPUS mobile companion (v0.0.85).
 *
 * The manifest is generated per request from the active theme; the icon route
 * renders the same mark in that palette. `scope: /m` covers the live widget
 * too, so the in-app switcher stays inside the installed window.
 */
export const metadata: Metadata = {
  title: 'OLYMPUS · mobile',
  description: 'The OLYMPUS companion — campaign, projects, prompts and voice.',
  applicationName: 'OLYMPUS Mobile',
  manifest: '/m/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OLYMPUS',
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
  // v0.0.63 — pinch-zoom stays available (WCAG 1.4.4). The old maximumScale:1
  // locked the page at 100% on a phone.
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0A0E16',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
