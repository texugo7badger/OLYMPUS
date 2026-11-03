/**
 * OLYMPUS — Route-level loading fallback.
 *
 * The SAME branded mark as the boot gate: there is one loader in OLYMPUS, and
 * it stays until the shell is ready. The old bare spinner was a second visual
 * language and violated the golden rule (a loading state always uses the
 * branded loader).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import OlympusLoader from '@/components/olympus/olympus-loader';

export default function Loading() {
  return <OlympusLoader fullscreen />;
}
