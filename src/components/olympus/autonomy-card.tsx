/**
 * autonomy-card.tsx — v0.0.47 (R47).
 *
 * The Settings surface for the unattended contract. Off by default; the card
 * states exactly what changes when the user leaves (gates auto-approve,
 * recommended choices, bounded park resumes) and what does not (the campaign
 * budget, the governor, the morning digest).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useEffect, useState } from 'react';
import { Moon, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { unattendedEnabled, setUnattendedEnabled, UNATTENDED_EVENT } from '@/lib/autonomy';

export default function AutonomyCard() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(unattendedEnabled());
    const sync = () => setOn(unattendedEnabled());
    window.addEventListener(UNATTENDED_EVENT, sync);
    return () => window.removeEventListener(UNATTENDED_EVENT, sync);
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold text-olympus-text uppercase tracking-wide flex items-center gap-1.5">
          <Moon size={11} className="text-olympus-purple" />
          Autonomy · unattended
        </h3>
        <span className={`text-[9px] font-mono ${on ? 'text-olympus-purple' : 'text-olympus-text-dim'}`}>{on ? 'UNATTENDED' : 'ATTENDED'}</span>
      </div>
      <div className="rounded-md border border-olympus-purple/20 bg-olympus-purple/5 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-semibold text-olympus-text">Run without me</div>
            <div className="text-[9px] font-mono text-olympus-text-dim leading-relaxed">
              The plan-walk gate auto-approves, design choices follow the recommended option and a parked wave
              auto-resumes up to 3 times. The 60-minute campaign budget and the resource governor still apply;
              the morning digest still lands in the lane.
            </div>
          </div>
          <Switch
            checked={on}
            onCheckedChange={(v) => { setOn(v); setUnattendedEnabled(v); }}
            aria-label="Unattended mode"
          />
        </div>
        <div className="flex items-center gap-1.5 text-[8.5px] font-mono text-olympus-text-dim">
          <ShieldCheck size={9} className="text-olympus-green" />
          never silent: the terminal shows UNATTENDED, every auto-approval is logged to the activity feed.
        </div>
      </div>
    </section>
  );
}
