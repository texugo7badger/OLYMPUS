/**
 * delivery-profile-store.ts — v0.0.98-15: the lane's profile selection.
 *
 * The plan is the execution contract; the profile file is the user's
 * per-project choice. The file is read at the walk boundary, never mutated
 * mid-walk. A project without a file keeps the old behavior (no profile cap).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DispatchPlan } from './hop-runtime/plan-schema';
import { isDeliveryProfileId, resolveProfile, type DeliveryProfileId } from './delivery-profiles';

export const DELIVERY_PROFILE_FILENAME = '.olympus-delivery-profile.json';

export interface DeliveryProfileFile {
  version: 1;
  profile: DeliveryProfileId;
  updatedAt: string;
  updatedBy?: string;
}

export function deliveryProfilePath(laneRoot: string): string {
  return path.join(laneRoot, DELIVERY_PROFILE_FILENAME);
}

export function readDeliveryProfile(laneRoot: string): DeliveryProfileFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(deliveryProfilePath(laneRoot), 'utf-8'));
    if (!isDeliveryProfileId(raw?.profile)) return null;
    return {
      version: 1,
      profile: raw.profile,
      updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
      ...(typeof raw.updatedBy === 'string' ? { updatedBy: raw.updatedBy } : {}),
    };
  } catch { return null; }
}

export function writeDeliveryProfile(laneRoot: string, profile: DeliveryProfileId, updatedBy = 'apollo'): DeliveryProfileFile {
  const file: DeliveryProfileFile = { version: 1, profile, updatedAt: new Date().toISOString(), updatedBy };
  fs.mkdirSync(laneRoot, { recursive: true });
  fs.writeFileSync(deliveryProfilePath(laneRoot), JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
  return file;
}

/** Plan-level choice wins; the file is the user's fallback. */
export function resolveLaneProfile(laneRoot: string, plan?: DispatchPlan | null): DeliveryProfileId | null {
  const planProfile = (plan as any)?.profile;
  if (isDeliveryProfileId(planProfile)) return planProfile;
  const file = readDeliveryProfile(laneRoot);
  return file?.profile ?? null;
}

export function laneProfileState(laneRoot: string, plan?: DispatchPlan | null) {
  const id = resolveLaneProfile(laneRoot, plan);
  const profile = id ? resolveProfile(id) : null;
  return { id, profile, file: readDeliveryProfile(laneRoot) };
}
