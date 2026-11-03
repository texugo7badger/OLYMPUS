'use client';

/**
 * /talent — the Talent Studio as a first-class surface.
 *
 * Until v0.0.59 the studio lived three clicks deep (Craft → Builds → talent
 * editor). The talent is a creation surface, not a sub-tab: this route makes
 * it reachable from the status bar in one click and deep-linkable.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { useRouter } from 'next/navigation';
import BuildTalentPage from '@/components/olympus/build-talent-page';

export default function TalentRoute() {
  const router = useRouter();
  return (
    <div className="fixed inset-0 bg-olympus-bg">
      <BuildTalentPage
        onClose={() => { router.push('/'); }}
        onCreated={() => { /* the studio reloads its own shelf */ }}
      />
    </div>
  );
}
