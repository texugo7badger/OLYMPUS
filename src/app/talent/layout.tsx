import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OLYMPUS · Talent Studio',
  description: 'Name a combination, fork a shelf preset, publish a talent.',
};

export default function TalentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
