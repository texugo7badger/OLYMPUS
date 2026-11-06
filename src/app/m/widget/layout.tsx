import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'OLYMPUS · live widget',
  description: 'A live, read-only view of the campaign: progress, GO Plus buckets and hops.',
  manifest: '/manifest-widget.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0b0b0f',
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
