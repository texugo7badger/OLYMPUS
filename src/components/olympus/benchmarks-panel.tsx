/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * BenchmarksPanel — read-only panel showing real-world benchmark totals.
 *
 * Reads from /api/olympus/benchmarks which parses
 * ~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl (written by the
 * olympus-hooks overlay plugin when recording is enabled in Settings).
 *
 * The panel shows:
 *   - Aggregate KPIs (total dispatches, tokens, success rate, short-circuit rate)
 *   - 14-day sparkline of dispatch volume + token cost
 *   - Per-god breakdown
 *   - Top 10 demigods by dispatch count
 *   - Per-session breakdown (grouped by session_label)
 *
 * Recording is OFF by default — the user enables it in Settings → Benchmark
 * Recording. When OFF, this panel shows the last recorded session's data
 * (or an empty state if no data has ever been recorded).
 */

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3, Activity, Zap, Coins, Clock, CheckCircle2, AlertCircle, RefreshCw, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedNumber from './animated-number';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface BenchmarkEntry {
  ts: string;
  god: string;
  demigod: string;
  short_circuited: boolean;
  outcome: string;
  tokens_total: number;
  duration_ms: number | null;
}

interface BenchmarkStats {
  config: { recordingEnabled: boolean; sessionLabel?: string };
  total_dispatches: number;
  total_short_circuits: number;
  short_circuit_rate: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  success_rate: number;
  error_count: number;
  per_god: Record<string, {
    dispatches: number;
    short_circuits: number;
    short_circuit_rate: number;
    tokens: number;
    avg_duration_ms: number;
    success_rate: number;
  }>;
  per_demigod_top: Array<{ demigod: string; count: number; tokens: number; success_rate: number }>;
  sparkline: Array<{ date: string; dispatches: number; tokens: number; short_circuits: number }>;
  per_session: Array<{ label: string | null; dispatches: number; tokens: number; success_rate: number; first_ts: string; last_ts: string }>;
  log_file: { path: string; exists: boolean; size_bytes: number; size_mb: number };
  generated_at: string;
}

export default function BenchmarksPanel() {
  const [stats, setStats] = useState<BenchmarkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local mirror of the recording config (for the inline toggle).
  const [recording, setRecording] = useState(false);
  const [sessionLabel, setSessionLabel] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/benchmarks', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: BenchmarkStats = await r.json();
      setStats(d);
      setRecording(!!d.config.recordingEnabled);
      setSessionLabel(d.config.sessionLabel || '');
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 30000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  const saveConfig = async (newRecording: boolean, newLabel: string) => {
    setSavingConfig(true);
    try {
      const r = await fetch('/api/olympus/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingEnabled: newRecording,
          sessionLabel: newLabel.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success(newRecording ? 'Recording enabled' : 'Recording disabled');
      await fetchStats();
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto custom-scroll p-4 bg-olympus-bg">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={16} className="text-olympus-gold animate-pulse" />
          <h2 className="text-sm font-semibold text-olympus-gold">Benchmarks</h2>
        </div>
        <div className="text-[11px] text-olympus-text-dim font-mono">Loading...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="h-full overflow-y-auto custom-scroll p-4 bg-olympus-bg">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={16} className="text-olympus-red" />
          <h2 className="text-sm font-semibold text-olympus-red">Benchmarks</h2>
        </div>
        <div className="text-[11px] text-olympus-red font-mono">
          Failed to load: {error || 'unknown error'}
        </div>
      </div>
    );
  }

  const hasData = stats.total_dispatches > 0;
  const maxSparkDispatches = Math.max(1, ...stats.sparkline.map(s => s.dispatches));

  return (
    <div className="h-full overflow-y-auto custom-scroll p-4 bg-olympus-bg">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-olympus-gold" />
        <h2 className="text-sm font-semibold text-olympus-gold">Benchmarks</h2>
        <span
          className={cn(
            'ml-2 text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider',
            recording ? 'bg-olympus-red/20 text-olympus-red animate-pulse' : 'bg-olympus-text-dim/20 text-olympus-text-dim',
          )}
        >
          {recording ? '● REC' : 'OFF'}
        </span>
        <span className="ml-auto text-[9px] text-olympus-text-dim font-mono">
          {stats.log_file.exists ? `${stats.log_file.size_mb} MB log` : 'no log yet'}
        </span>
        <button
          onClick={fetchStats}
          className="text-olympus-text-dim hover:text-olympus-gold transition-colors p-1"
          aria-label="Refresh"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Recording toggle (inline — mirrors the Settings dialog toggle) */}
      <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] font-mono text-olympus-text">Recording</div>
            <div className="text-[9px] font-mono text-olympus-text-dim mt-0.5">
              When enabled, every dispatch is logged to{' '}
              <code className="text-olympus-gold">~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl</code>.
            </div>
          </div>
          <Switch
            checked={recording}
            onCheckedChange={(v) => {
              setRecording(v);
              saveConfig(v, sessionLabel);
            }}
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-[9px] text-olympus-text-dim font-mono uppercase shrink-0">
            Session label
          </Label>
          <Input
            value={sessionLabel}
            onChange={e => setSessionLabel(e.target.value)}
            placeholder="e.g. refactor-2026-07"
            className="bg-olympus-bg border-olympus-gold/20 text-olympus-text font-mono text-[10px] h-6 flex-1"
            onBlur={() => saveConfig(recording, sessionLabel)}
          />
        </div>
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-6 text-center">
          <BarChart3 size={32} className="text-olympus-gold/40 mx-auto mb-3" />
          <div className="text-[12px] font-mono text-olympus-text mb-1">No benchmark data yet</div>
          <div className="text-[10px] font-mono text-olympus-text-dim leading-relaxed max-w-md mx-auto">
            Enable recording above, then dispatch tasks to OLYMPUS as you normally would.
            Every god → demigod dispatch will be logged with its token cost, duration,
            and outcome. Come back to this panel to see running totals.
          </div>
        </div>
      ) : (
        <>
          {/* Aggregate KPIs */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <KpiCard label="Dispatches" value={stats.total_dispatches} icon={Activity} color="text-olympus-cyan" bg="bg-olympus-cyan/10" ring="ring-olympus-cyan/20" />
            <KpiCard label="Tokens" value={stats.total_tokens} icon={Coins} color="text-olympus-gold" bg="bg-olympus-gold/10" ring="ring-olympus-gold/20" />
            <KpiCard label="Success" value={stats.success_rate * 100} suffix="%" decimals={1} icon={CheckCircle2} color="text-olympus-green" bg="bg-olympus-green/10" ring="ring-olympus-green/20" />
            <KpiCard label="Short-Circuit" value={stats.short_circuit_rate * 100} suffix="%" decimals={1} icon={Zap} color="text-olympus-gold" bg="bg-olympus-gold/10" ring="ring-olympus-gold/20" />
          </div>

          {/* 14-day sparkline */}
          <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-olympus-text">14-day dispatch volume</span>
              <span className="text-[10px] text-olympus-text-dim font-mono">
                avg {(stats.avg_duration_ms / 1000).toFixed(1)}s · {stats.error_count} errors
              </span>
            </div>
            <div className="flex items-end gap-[2px] h-[60px]">
              {stats.sparkline.map((s, i) => {
                const heightPct = (s.dispatches / maxSparkDispatches) * 100;
                const hasData = s.dispatches > 0;
                return (
                  <div
                    key={i}
                    className="flex-1 group relative"
                    title={`${s.date}: ${s.dispatches} dispatches, ${s.tokens} tokens, ${s.short_circuits} short-circuits`}
                  >
                    <div
                      className={cn(
                        'w-full rounded-t-sm transition-all',
                        hasData ? 'bg-olympus-gold' : 'bg-olympus-text-dim/20',
                      )}
                      style={{ height: `${hasData ? Math.max(2, heightPct) : 2}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1 text-[8px] text-olympus-text-dim font-mono">
              <span>{stats.sparkline[0]?.date.slice(5) ?? ''}</span>
              <span>today</span>
            </div>
          </div>

          {/* Per-god breakdown */}
          {Object.keys(stats.per_god).length > 0 && (
            <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-3 mb-4">
              <div className="text-[11px] font-semibold text-olympus-text mb-2">Per-god breakdown</div>
              <div className="space-y-1">
                {Object.entries(stats.per_god)
                  .sort(([,a], [,b]) => b.dispatches - a.dispatches)
                  .map(([god, s]) => (
                    <div key={god} className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-olympus-gold capitalize w-20 truncate">{god}</span>
                      <span className="text-olympus-text w-12 text-right">{s.dispatches}×</span>
                      <span className="text-olympus-green w-12 text-right">{(s.success_rate * 100).toFixed(0)}%</span>
                      <span className="text-olympus-cyan w-16 text-right">{s.tokens} tok</span>
                      <span className="text-olympus-text-dim w-16 text-right">{(s.avg_duration_ms / 1000).toFixed(1)}s</span>
                      <span className="text-olympus-gold/60 w-12 text-right">{(s.short_circuit_rate * 100).toFixed(0)}% SC</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Top 10 demigods */}
          {stats.per_demigod_top.length > 0 && (
            <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-3 mb-4">
              <div className="text-[11px] font-semibold text-olympus-text mb-2">Top demigods (by dispatch count)</div>
              <div className="space-y-1">
                {stats.per_demigod_top.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-olympus-text-dim w-4">{i + 1}.</span>
                    <span className="text-olympus-gold truncate flex-1">{d.demigod}</span>
                    <span className="text-olympus-text w-12 text-right">{d.count}×</span>
                    <span className="text-olympus-cyan w-16 text-right">{d.tokens} tok</span>
                    <span className="text-olympus-green w-12 text-right">{(d.success_rate * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-session breakdown */}
          {stats.per_session.length > 0 && (
            <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-3">
              <div className="text-[11px] font-semibold text-olympus-text mb-2">Per-session</div>
              <div className="space-y-1">
                {stats.per_session.slice(0, 5).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-olympus-gold truncate flex-1">{s.label || '(no label)'}</span>
                    <span className="text-olympus-text w-12 text-right">{s.dispatches}×</span>
                    <span className="text-olympus-cyan w-16 text-right">{s.tokens} tok</span>
                    <span className="text-olympus-green w-12 text-right">{(s.success_rate * 100).toFixed(0)}%</span>
                    <span className="text-olympus-text-dim text-right">{s.last_ts.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="text-[9px] text-olympus-text-dim font-mono mt-4 leading-relaxed">
        Benchmarks are local-only — no data leaves your machine. The log file is at{' '}
        <code className="text-olympus-gold">{stats.log_file.path}</code>.
        Vault TTL pruning (Settings → Vault Policy) rolls the log over when it exceeds 100MB.
      </div>
    </div>
  );
}

function KpiCard({ label, value, suffix, decimals, icon: Icon, color, bg, ring }: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  icon: any;
  color: string;
  bg: string;
  ring: string;
}) {
  return (
    <div className={cn('rounded-lg p-2 border border-olympus-gold/10', bg, `ring-1 ${ring}`)}>
      <Icon size={12} className={cn(color, 'mb-1')} />
      <div className={cn('text-sm font-mono font-bold tabular-nums', color)}>
        <AnimatedNumber value={value} decimals={decimals || 0} />
        {suffix}
      </div>
      <div className="text-[9px] text-olympus-text-dim font-mono mt-0.5">{label}</div>
    </div>
  );
}
