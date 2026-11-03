import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'OLYMPUS · mobile',
  description: 'The OLYMPUS companion — campaign, projects, prompts and voice.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // v0.0.63 — pinch-zoom stays available (WCAG 1.4.4). The old maximumScale:1
  // locked the page at 100% on a phone.
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0b0b0f',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
