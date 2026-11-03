import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'OLYMPUS · mobile',
  description: 'The OLYMPUS companion — campaign, projects, prompts and voice.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0f',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
