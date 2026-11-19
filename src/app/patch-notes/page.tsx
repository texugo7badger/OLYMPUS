import type { Metadata } from 'next';
import { PatchNotesPage } from '@/components/olympus/patch-notes';

export const metadata: Metadata = {
  title: 'Patch notes & updates — OLYMPUS',
  description: 'OLYMPUS release timeline, OpenCode v2 alignment and the tested conformance gate.',
};

export default function PatchNotesRoute() {
  return <PatchNotesPage />;
}
