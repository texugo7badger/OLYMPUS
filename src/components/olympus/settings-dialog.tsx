/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOlympus, GOD_ICONS, GOD_IDS, type LLMStrategy } from '@/lib/olympus-store';
import { Settings, Save, Loader2, Check, AlertCircle, AlertTriangle, Zap, BarChart3, Lock, Plus, X, Trash2, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { strategyApiRequirement, modelClassesForStrategy, estimateStrategyCost, type CostEstimate } from '@/lib/model-strategies';

/* ------------------------------------------------------------------ */
/* Settings Dialog — minimalist refactor.                              */
/*                                                                     */
/* impeccable `distill` pass:                                          */
/*   - Was 635 lines covering: active CLI, LLM strategy (2 grids),     */
/*     provider select, per-god model class, network mode, metrics     */
/*     toggle, auto-fallback toggle, locked theme. Most of it was      */
/*     either redundant (active CLI always OpenCode, theme locked)     */
/*     or already surfaced in the Provider Settings panel.             */
/*   - Now ~250 lines. Only Olympus-relevant settings remain:          */
/*     1. LLM Strategy (segmented control — 3 GO plans + custom)       */
/*     2. Default provider (single select)                             */
/*     3. Per-god model class (compact grid, only dirty ones          */
/*        highlighted)                                                 */
/*   - Removed: Active CLI badge (always OpenCode), Network Mode       */
/*     (legacy), Metrics toggle (collect regardless), Auto-fallback    */
/*     (OpenCode handles internally), Theme (locked dark).             */
/*   - API configuration moved to a separate dialog opened from the    */
/*     status bar (already in place).                                  */
/* ------------------------------------------------------------------ */

interface StrategyEntry {
  id: string;
  label: string;
  description: string;
  plan?: 'GO' | 'ZEN' | 'CUSTOM';
  tier?: 'quality' | 'balanced' | 'budget' | 'free' | 'custom';
  terminalModel?: string;
  estCostPerDay: 'low' | 'moderate' | 'higher' | 'free' | string;
  /** Per-god model map (custom strategies only — loaded from disk). */
  gods?: Record<string, string>;
}

interface ProviderEntry {
  id: string;
  displayName: string;
  isFree: boolean;
  description: string;
}

/**
 * Which APIs are authorized right now (server-side check, returned by
 * /api/olympus/providers/gods). A strategy whose required API is not
 * authorized is BLOCKED — the card is disabled and cannot be activated.
 */
interface ApiAuth {
  go: boolean;
  zen: boolean;
  groq: boolean;
  openrouter: boolean;
  nvidia: boolean;
}

interface SettingsData {
  provider: string;
  defaultProvider: string;
  availableProviders: ProviderEntry[];
  perGodClass: Record<string, string>;
  availableClasses: string[];
  /** All model classes grouped by strategy family (GO / ZEN / FREE). */
  classFamilies?: Record<'GO' | 'ZEN' | 'FREE', string[]>;
  strategy: LLMStrategy;
  availableStrategies: StrategyEntry[];
  customStrategies?: StrategyEntry[];
  /** null = unknown (offline fallback) → never block. */
  auth?: ApiAuth | null;
  go_plan_last_verified?: string;
  go_plan_docs_url?: string;
}

const GOD_DOMAINS: Record<string, string> = {
  apollo: 'Planning',
  atlas: 'Orchestration',
  hephaestus: 'Backend',
  athena: 'Frontend',
  hermes: 'Integrations',
  artemis: 'Security',
  dionysus: 'QA',
  persephone: 'Database',
  prometheus: 'DevOps',
  callimachus: 'Vault curator',
};

// MIRROR of src/lib/model-strategies.ts (go-balanced gods).
// Do NOT edit by hand — update the canonical file and run `npm run check-strategy-sync`.
// Enforced by scripts/check-strategy-sync.js in CI.
const DEFAULT_CLASSES: Record<string, string> = {
  apollo: 'opencode-go/glm-5.3-flash',
  atlas: 'opencode-go/hy3',
  artemis: 'opencode-go/glm-5.3-flash',
  athena: 'opencode-go/qwen3.7-plus',
  dionysus: 'opencode-go/glm-5.3-flash',
  hephaestus: 'opencode-go/kimi-k2.7-code',
  hermes: 'opencode-go/kimi-k2.7-code',
  persephone: 'opencode-go/qwen3.7-plus',
  prometheus: 'opencode-go/minimax-m3',
  callimachus: 'opencode-go/glm-5.3-flash',
};

const ALL_CLASSES = [
  // GO plan — mirrors GO_MODEL_CLASSES in src/lib/model-strategies.ts
  // (verified 2026-09-28).
  'opencode-go/hy3',
  'opencode-go/glm-5.3',
  'opencode-go/glm-5.3-flash',
  'opencode-go/glm-5.2',
  'opencode-go/kimi-k3',
  'opencode-go/kimi-k2.7-code',
  'opencode-go/kimi-k2.6',
  'opencode-go/deepseek-v4.1-flash',
  'opencode-go/deepseek-v4-pro',
  'opencode-go/deepseek-v4-flash',
  'opencode-go/qwen3.8-max',
  'opencode-go/qwen3.8-flash',
  'opencode-go/qwen3.7-plus',
  'opencode-go/mimo-v2.6-flash',
  'opencode-go/mimo-v2.6-pro',
  'opencode-go/mimo-v2.5',
  'opencode-go/grok-4.7',
  'opencode-go/grok-4.6',
  'opencode-go/grok-4.5',
  'opencode-go/minimax-m3',
  'opencode-go/minimax-m2.7',
  'opencode-go/gpt-6-luna',
  'opencode-go/gpt-5.6-luna',
  'opencode-go/longcat-2.0',
  // OpenCode Zen (pay-as-you-go) — mirrors ZEN_MODEL_CLASSES in
  // src/lib/model-strategies.ts (verified 2026-09-28, deprecated excluded).
  'opencode/gpt-6-astra',
  'opencode/gpt-6-sol',
  'opencode/gpt-6-luna',
  'opencode/gpt-5.6-sol',
  'opencode/gpt-5.6-terra',
  'opencode/gpt-5.6-luna',
  'opencode/gpt-5.5',
  'opencode/gpt-5.5-pro',
  'opencode/gpt-5.4',
  'opencode/gpt-5.4-pro',
  'opencode/gpt-5.4-mini',
  'opencode/gpt-5.4-nano',
  'opencode/gpt-5.3-codex',
  'opencode/gpt-5.3-codex-spark',
  'opencode/gpt-5.2',
  'opencode/gpt-5.1',
  'opencode/gpt-5',
  'opencode/gpt-5-nano',
  'opencode/claude-fable-5-1',
  'opencode/claude-fable-5',
  'opencode/claude-opus-5-5',
  'opencode/claude-opus-5',
  'opencode/claude-opus-4-8',
  'opencode/claude-opus-4-7',
  'opencode/claude-opus-4-6',
  'opencode/claude-opus-4-5',
  'opencode/claude-sonnet-5',
  'opencode/claude-sonnet-4-6',
  'opencode/claude-sonnet-4-5',
  'opencode/claude-haiku-4-5',
  'opencode/gemini-3.8-flash',
  'opencode/gemini-3.7-flash',
  'opencode/gemini-3.6-flash',
  'opencode/gemini-3.5-flash',
  'opencode/gemini-3.5-flash-lite',
  'opencode/gemini-3.1-pro',
  'opencode/gemini-3-flash',
  'opencode/grok-4.7',
  'opencode/grok-4.6',
  'opencode/grok-4.5',
  'opencode/grok-build-0.1',
  'opencode/muse-spark-1.3',
  'opencode/muse-spark-1.2',
  'opencode/qwen3.8-max',
  'opencode/qwen3.8-flash',
  'opencode/qwen3.7-max',
  'opencode/qwen3.7-plus',
  'opencode/qwen3.6-plus',
  'opencode/qwen3.5-plus',
  'opencode/kimi-k3',
  'opencode/kimi-k2.7-code',
  'opencode/kimi-k2.6',
  'opencode/minimax-m3',
  'opencode/minimax-m2.7',
  'opencode/glm-5.3-flash',
  'opencode/glm-5.3',
  'opencode/glm-5.2',
  'opencode/glm-5.1',
  'opencode/deepseek-v4.1-flash',
  'opencode/deepseek-v4-pro',
  'opencode/deepseek-v4-flash',
  'opencode/deepseek-v4-flash-vision-exp',
  'opencode/big-pickle',
  'opencode/space-bunny-free',
  'opencode/longcat-2.5-preview-free',
  'opencode/mimo-v2.6-flash-free',
  'opencode/mimo-v2.5-free',
  'opencode/ling-3.0-flash-fin-free',
  'opencode/nemotron-3-ultra-free',
  'opencode/nemotron-3.5-lightning-free',
  'opencode/muse-spark-1.3-contributor-free',
  // Free-tier models (verified live 2026-07-31 — mirrors the model list in
  // scripts/apply-strategy.js so overrides always route). The refresh script
  // (scripts/refresh-free-models.js) may add more at runtime.
  'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
  'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
  'openrouter/inclusionai/ling-3.0-flash:free',
  'openrouter/google/gemma-4-31b-it:free',
  'openrouter/google/gemma-4-26b-a4b-it:free',
  'openrouter/poolside/laguna-s-2.1:free',
  'openrouter/openai/gpt-oss-20b:free',
  'openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'openrouter/poolside/laguna-xs-2.1:free',
  'openrouter/cohere/north-mini-code:free',
  'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
  // NVIDIA Build free endpoints (build.nvidia.com) — resolved by OpenCode's
  // built-in `nvidia` provider (no `:free` suffix; every Build endpoint is
  // free with an nvapi-... key).
  'nvidia/nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/z-ai/glm-5.3',
  'nvidia/nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nvidia/nemotron-3-nano-30b-a3b',
  'nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'nvidia/deepseek-ai/deepseek-v4-pro',
  'nvidia/deepseek-ai/deepseek-v4-flash',
  'nvidia/openai/gpt-oss-120b',
  'nvidia/moonshotai/kimi-k2.6',
];

// Curated per-strategy per-god model maps — the canonical defaults shown in
// the per-god dropdown. Mirrors LLM_STRATEGIES[*].gods in
// src/lib/model-strategies.ts (kept in sync by hand; check-strategy-sync.js
// covers the apply-strategy.js mirror). For free strategies these are the
// curated fallbacks aligned with the live provider lists; apply-strategy.js
// may route to a newer live model at apply time. Custom strategies carry
// their own gods map from ~/.olympus/custom-strategies.json (merged in on
// load) and are FREE-ONLY.
// MIRROR of src/lib/model-strategies.ts (LLM_STRATEGIES[*].gods).
// Do NOT edit by hand — update the canonical file and run `npm run check-strategy-sync`.
// Enforced by scripts/check-strategy-sync.js in CI.
const STRATEGY_MODELS: Record<string, Record<string, string>> = {
  'go-max-quality': {
    apollo: 'opencode-go/glm-5.3',
    atlas: 'opencode-go/hy3',
    hephaestus: 'opencode-go/kimi-k2.7-code',
    athena: 'opencode-go/glm-5.3-flash',
    artemis: 'opencode-go/glm-5.3',
    dionysus: 'opencode-go/glm-5.3-flash',
    hermes: 'opencode-go/kimi-k2.7-code',
    persephone: 'opencode-go/glm-5.3-flash',
    prometheus: 'opencode-go/minimax-m3',
    callimachus: 'opencode-go/glm-5.3-flash',
  },
  'go-balanced': {
    apollo: 'opencode-go/glm-5.3-flash',
    atlas: 'opencode-go/hy3',
    hephaestus: 'opencode-go/kimi-k2.7-code',
    athena: 'opencode-go/qwen3.7-plus',
    artemis: 'opencode-go/glm-5.3-flash',
    dionysus: 'opencode-go/glm-5.3-flash',
    hermes: 'opencode-go/kimi-k2.7-code',
    persephone: 'opencode-go/qwen3.7-plus',
    prometheus: 'opencode-go/minimax-m3',
    callimachus: 'opencode-go/glm-5.3-flash',
  },
  'go-budget': {
    apollo: 'opencode-go/glm-5.3-flash',
    atlas: 'opencode-go/hy3',
    artemis: 'opencode-go/glm-5.3-flash',
    athena: 'opencode-go/glm-5.3-flash',
    dionysus: 'opencode-go/glm-5.3-flash',
    hephaestus: 'opencode-go/glm-5.3-flash',
    hermes: 'opencode-go/glm-5.3-flash',
    persephone: 'opencode-go/glm-5.3-flash',
    prometheus: 'opencode-go/glm-5.3-flash',
    callimachus: 'opencode-go/glm-5.3-flash',
  },
  // Zen — full 128-agent shape on OpenCode Zen (pay-as-you-go). Models
  // use the opencode/<id> prefix (distinct from GO's opencode-go/<id>).
  // Zen is built around PROPRIETARY APIs (GPT, Claude, Gemini, Kimi,
  // MiniMax) — the GO plan runs the open-weight line.
  'zen-max-quality': {
    apollo: 'opencode/glm-5.3',
    atlas: 'opencode/gpt-6-sol',
    hephaestus: 'opencode/claude-sonnet-5',
    athena: 'opencode/gpt-5.6-terra',
    artemis: 'opencode/claude-sonnet-5',
    dionysus: 'opencode/gpt-5.6-luna',
    hermes: 'opencode/claude-sonnet-5',
    persephone: 'opencode/gemini-3.1-pro',
    prometheus: 'opencode/grok-build-0.1',
    callimachus: 'opencode/claude-haiku-4-5',
  },
  'zen-balanced': {
    apollo: 'opencode/glm-5.3',
    atlas: 'opencode/gpt-6-sol',
    hephaestus: 'opencode/claude-sonnet-5',
    athena: 'opencode/gpt-5.6-terra',
    artemis: 'opencode/claude-sonnet-5',
    dionysus: 'opencode/gpt-5.6-luna',
    hermes: 'opencode/gpt-5.4-mini',
    persephone: 'opencode/gemini-3.1-pro',
    prometheus: 'opencode/grok-build-0.1',
    callimachus: 'opencode/claude-haiku-4-5',
  },
  'zen-budget': {
    apollo: 'opencode/glm-5.3',
    atlas: 'opencode/gpt-6-luna',
    artemis: 'opencode/glm-5.3-flash',
    athena: 'opencode/glm-5.3-flash',
    dionysus: 'opencode/glm-5.3-flash',
    hephaestus: 'opencode/glm-5.3-flash',
    hermes: 'opencode/glm-5.3-flash',
    persephone: 'opencode/glm-5.3-flash',
    prometheus: 'opencode/glm-5.3-flash',
    callimachus: 'opencode/claude-haiku-4-5',
  },
  'free-big-pickle': {
    apollo: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    atlas: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    artemis: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    athena: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    dionysus: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    hephaestus: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    hermes: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    persephone: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    prometheus: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    callimachus: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
  },
  'free-openrouter': {
    apollo: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    atlas: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    artemis: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    athena: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    dionysus: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    hephaestus: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    hermes: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    persephone: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    prometheus: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    callimachus: 'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
  },
  'free-nvidia-build': {
    apollo: 'nvidia/nvidia/nemotron-3-ultra-550b-a55b',
    atlas: 'nvidia/nvidia/nemotron-3-ultra-550b-a55b',
    hephaestus: 'nvidia/z-ai/glm-5.3',
    athena: 'nvidia/z-ai/glm-5.3',
    dionysus: 'nvidia/z-ai/glm-5.3',
    artemis: 'nvidia/z-ai/glm-5.3',
    hermes: 'nvidia/z-ai/glm-5.3',
    persephone: 'nvidia/z-ai/glm-5.3',
    prometheus: 'nvidia/z-ai/glm-5.3',
    callimachus: 'nvidia/nvidia/nemotron-3-nano-30b-a3b',
  },
};

// Fallback family split (used when the API is offline). The live API sends
// class_families from src/lib/model-strategies.ts.
const FALLBACK_CLASS_FAMILIES: Record<'GO' | 'ZEN' | 'FREE', string[]> = {
  GO: ALL_CLASSES.filter(c => c.startsWith('opencode-go/')),
  ZEN: ALL_CLASSES.filter(c => c.startsWith('opencode/')),
  FREE: ALL_CLASSES.filter(c => c.startsWith('openrouter/') || c.startsWith('nvidia/')),
};

// Map a strategy entry to the family whose models it may use. GO strategies
// only offer opencode-go/*; Zen only opencode/*; Free only openrouter/* +
// nvidia/*. custom-* strategies are FREE-ONLY (money safety — a
// paid model in a custom strategy could silently burn credits).
type StrategyFamilyKey = 'GO' | 'ZEN' | 'FREE' | 'ALL';
function familyForStrategy(s: StrategyEntry | undefined): StrategyFamilyKey {
  if (!s) return 'GO';
  if (s.plan === 'GO') return 'GO';
  if (s.plan === 'ZEN') return 'ZEN';
  return 'FREE'; // free-* + custom-* (custom is free-only)
}

function fallbackData(): SettingsData {
  const initial: Record<string, string> = {};
  for (const god of GOD_IDS) initial[god] = DEFAULT_CLASSES[god] || ALL_CLASSES[2];
  return {
    provider: 'opencode-go',
    defaultProvider: 'opencode-go',
    availableProviders: [
      { id: 'opencode-go', displayName: 'OpenCode GO', isFree: false, description: 'Paid subscription — see docs for current pricing' },
      { id: 'opencode', displayName: 'OpenCode ZEN', isFree: false, description: 'Pay-as-you-go — see docs for current pricing' },
    ],
    perGodClass: initial,
    availableClasses: ALL_CLASSES,
    classFamilies: FALLBACK_CLASS_FAMILIES,
    strategy: 'go-balanced',
    // Offline fallback — auth unknown, so the activation gate never blocks.
    auth: null,
    availableStrategies: [
      // shortened descriptions to prevent text overflow.
      // The old descriptions were too long for the 3-column card layout.
	      { id: 'go-max-quality',  label: 'GO Max Quality',  description: 'Best models. Apollo: GLM-5.2. Specialists: Kimi K3 / K2.7 Code. Vault: Flash.', plan: 'GO', tier: 'quality',  terminalModel: 'glm-5.2',           estCostPerDay: 'higher' },
	      { id: 'go-balanced',     label: 'GO Balanced',     description: 'Default. Apollo: GLM-5.2. Specialists: DeepSeek V4 Pro / Qwen3.7 Plus.',     plan: 'GO', tier: 'balanced', terminalModel: 'glm-5.2',           estCostPerDay: 'moderate' },
	      { id: 'go-budget',       label: 'GO Budget',       description: 'Lowest cost. Apollo: GLM-5.2. Atlas: Hy3 (orchestration). All others: DeepSeek V4 Flash.',       plan: 'GO',  tier: 'budget',   terminalModel: 'hy3',            estCostPerDay: 'low' },
      // Zen — full 128-agent OLYMPUS on OpenCode Zen (pay-as-you-go).
      { id: 'zen-max-quality', label: 'ZEN Max Quality', description: 'Best quality on OpenCode Zen — proprietary APIs. Apollo: GLM-5.2. Athena+Hephaestus: Claude Sonnet 5. Others: GPT-5.4.', plan: 'ZEN', tier: 'quality', terminalModel: 'opencode/glm-5.2', estCostPerDay: 'higher' },
      { id: 'zen-balanced',    label: 'ZEN Balanced', description: 'Full OLYMPUS on OpenCode Zen — pay-as-you-go, no request caps. Apollo: GLM-5.2. Athena+Hephaestus: Claude Sonnet 5. Specialists: Kimi K2.7 Code.', plan: 'ZEN', tier: 'balanced', terminalModel: 'opencode/glm-5.2', estCostPerDay: 'moderate' },
      { id: 'zen-budget',      label: 'ZEN Budget',   description: 'Lowest cost on OpenCode Zen — proprietary APIs. Apollo: GLM-5.2. Atlas: Gemini 3.5 Flash. All others: MiniMax M2.7.', plan: 'ZEN', tier: 'budget', terminalModel: 'opencode/glm-5.2', estCostPerDay: 'low' },
      // Free strategies — for users without a GO plan.
      { id: 'free-openrouter', label: 'Free OpenRouter', description: 'All gods on OpenRouter\'s strongest free models live right now — primary trio on #1, specialists on #2, Callimachus on a fast background model.', plan: 'CUSTOM', tier: 'free', terminalModel: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', estCostPerDay: 'free' },
      { id: 'free-big-pickle', label: 'Free Big Pickle', description: 'All 10 gods (Callimachus included) on one free model — the strongest currently live. Refreshes automatically.', plan: 'CUSTOM', tier: 'free', terminalModel: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', estCostPerDay: 'free' },
      { id: 'free-nvidia-build', label: 'Free Nvidia Build', description: 'NVIDIA Build free endpoints (build.nvidia.com) — Apollo + Atlas on the strongest NVIDIA free model live right now, coding gods (Hephaestus/Athena/Dionysus) on GLM-5.2 (best coding), other specialists on #2, Callimachus on a fast background model. Refreshes automatically.', plan: 'CUSTOM', tier: 'free', terminalModel: 'nvidia/nvidia/nemotron-3-ultra-550b-a55b', estCostPerDay: 'free' },
    ],
    go_plan_last_verified: '2026-07-29',
    go_plan_docs_url: 'https://opencode.ai/docs/go/',
  };
}

export default function SettingsDialog() {
  const open = useOlympus(s => s.settingsOpen);
  const setOpen = useOlympus(s => s.setSettingsOpen);
  const setStoreStrategy = useOlympus(s => s.setLlmStrategy);

  const [data, setData] = useState<SettingsData | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [customGodModels, setCustomGodModels] = useState<Record<string, Record<string, string>>>({});
  const [strategy, setStrategy] = useState<LLMStrategy>('go-balanced');
  const [provider, setProvider] = useState<string>('opencode-go');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  // Settings toggle for opt-in benchmark
  // recording. When enabled, every dispatch is logged to
  // ~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl.
  const [benchRecording, setBenchRecording] = useState(false);
  const [benchSessionLabel, setBenchSessionLabel] = useState('');
  const [benchSaving, setBenchSaving] = useState(false);
  // Custom Strategy Creator modal
  const [customStrategyOpen, setCustomStrategyOpen] = useState(false);
  const [customStrategyName, setCustomStrategyName] = useState('');
  const [customStrategyGodModels, setCustomStrategyGodModels] = useState<Record<string, string>>({});
  const [customStrategyAuth, setCustomStrategyAuth] = useState<ApiAuth | null>(null);
  const [customStrategyCost, setCustomStrategyCost] = useState<'free' | 'low' | 'moderate' | 'higher' | 'unknown'>('unknown');
  const [customStrategyDescription, setCustomStrategyDescription] = useState('');
  const [customStrategyCreating, setCustomStrategyCreating] = useState(false);
  const [customStrategyError, setCustomStrategyError] = useState<string | null>(null);
  const [overrideCount, setOverrideCount] = useState(0);
  const [clearingOverrides, setClearingOverrides] = useState(false);

  // Fix C2: providers loader shared by the mount effect and the
  // "Clear overrides and re-apply" action (so the dropdowns refresh to the
  // strategy's clean values without closing the modal).
  const loadProvidersData = useCallback(async (cancelledCheck?: () => boolean) => {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch('/api/olympus/providers/gods', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timeout);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const d = await r.json();
      if (!d || typeof d !== 'object' || !Array.isArray(d.gods)) throw new Error('Invalid API response');

      const initial: Record<string, string> = {};
      for (const g of d.gods) {
        if (g && g.id) initial[g.id] = g.current_class || g.override?.class || g.default_class || DEFAULT_CLASSES[g.id];
      }
      for (const god of GOD_IDS) if (!initial[god]) initial[god] = DEFAULT_CLASSES[god] || ALL_CLASSES[2];

      // Custom strategies carry their own per-god map from disk — used for
      // the "(default)" marker when a custom strategy is selected.
      const customGods: Record<string, Record<string, string>> = {};
      for (const c of (Array.isArray(d.customStrategies) ? d.customStrategies : [])) {
        if (c && c.gods) customGods[c.id] = c.gods;
      }

      if (cancelledCheck?.()) return;
      setData({
        provider: d.default_provider || 'opencode-go',
        defaultProvider: d.default_provider || 'opencode-go',
        availableProviders: Array.isArray(d.availableProviders) ? d.availableProviders : [],
        perGodClass: initial,
        availableClasses: d.available_classes || ALL_CLASSES,
        classFamilies: d.class_families || FALLBACK_CLASS_FAMILIES,
        strategy: (d.strategy as LLMStrategy) || 'go-balanced',
        auth: d.auth ?? null,
        availableStrategies: Array.isArray(d.availableStrategies) ? d.availableStrategies : fallbackData().availableStrategies,
        customStrategies: Array.isArray(d.customStrategies) ? d.customStrategies : [],
      });
      setEdits(initial);
      setCustomGodModels(customGods);
      setProvider(d.default_provider || 'opencode-go');
      setStrategy((d.strategy as LLMStrategy) || 'go-balanced');
      setOverrideCount(Object.keys(d.per_god_overrides || {}).length);
    } catch {
      if (cancelledCheck?.()) return;
      const fb = fallbackData();
      setData(fb);
      setEdits(fb.perGodClass);
      setCustomGodModels({});
      setProvider(fb.provider);
      setStrategy(fb.strategy);
      setOverrideCount(0);
      setUsingFallback(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setUsingFallback(false);
    loadProvidersData(() => cancelled);

    // load benchmark config in parallel.
    (async () => {
      try {
        const br = await fetch('/api/olympus/benchmarks', { cache: 'no-store' });
        if (br.ok) {
          const bd = await br.json();
          if (bd?.config) {
            setBenchRecording(!!bd.config.recordingEnabled);
            setBenchSessionLabel(bd.config.sessionLabel || '');
          }
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [open, loadProvidersData]);

  // Fix C2: clear all per-god overrides via the API and re-apply the
  // selected strategy, then refresh the dropdowns from the clean config.
  const clearOverrides = async () => {
    if (clearingOverrides) return;
    setClearingOverrides(true);
    try {
      const res = await fetch('/api/olympus/providers/gods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearOverrides: true, strategy }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        toast.success('Overrides cleared', { description: `${d.strategy} re-applied cleanly.` });
        await loadProvidersData();
      } else {
        toast.error('Failed to clear overrides', { description: d?.error || 'API error' });
      }
    } catch {
      toast.error('Failed to clear overrides');
    } finally {
      setClearingOverrides(false);
    }
  };

  // Reset the SELECTED strategy to its canonical god → model mapping:
  // clears per-god overrides server-side and re-applies the strategy,
  // then refreshes the dropdowns from the clean config.
  const resetToDefaults = async () => {
    if (clearingOverrides) return;
    setClearingOverrides(true);
    try {
      const res = await fetch('/api/olympus/providers/gods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToDefaults: true, strategy }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        toast.success('Strategy reset to defaults', { description: `${d.strategy} re-applied with the canonical model map.` });
        await loadProvidersData();
      } else {
        toast.error('Failed to reset', { description: d?.error || 'API error' });
      }
    } catch {
      toast.error('Failed to reset');
    } finally {
      setClearingOverrides(false);
    }
  };

  // Compute available models for custom strategies based on authorized APIs
  // GO plan -> GO models, Zen plan -> Zen models, Free keys -> their free models
  const getCustomStrategyModels = () => {
    if (!data?.auth) return [];
    const models: string[] = [];
    if (data.auth.go) models.push(...ALL_CLASSES.filter(c => c.startsWith('opencode-go/')));
    if (data.auth.zen) models.push(...ALL_CLASSES.filter(c => c.startsWith('opencode/')));
    if (data.auth.openrouter) models.push(...ALL_CLASSES.filter(c => c.startsWith('openrouter/')));
    if (data.auth.nvidia) models.push(...ALL_CLASSES.filter(c => c.startsWith('nvidia/')));
    // Always include free models as fallback
    if (models.length === 0) models.push(...ALL_CLASSES.filter(c => c.startsWith('openrouter/') || c.startsWith('nvidia/')));
    return [...new Set(models)]; // deduplicate
  };

  const customStrategyModels = getCustomStrategyModels();

  // Update cost estimate when god models change
  useEffect(() => {
    if (!data) return;
    const auth = data.auth ?? null;
    const cost = estimateStrategyCost(customStrategyGodModels, auth);
    setCustomStrategyCost(cost.tier);
    setCustomStrategyDescription(cost.description);
  }, [customStrategyGodModels, data?.auth]);

  const isDirty = (god: string) => edits[god] !== (data?.perGodClass[god] ?? DEFAULT_CLASSES[god]);

  // REAL-TIME Per-God Model Class updates.
  // When the user changes the LLM strategy (without saving), the per-god
  // model classes update immediately to reflect the strategy's model map.
  // Free strategies show their curated defaults here (the live refresh in
  // apply-strategy.js may pick a newer model at apply time).
  useEffect(() => {
    if (!data) return;
    const newEdits: Record<string, string> = { ...edits };

    // Apply the selected strategy's curated model map (the live refresh in
    // apply-strategy.js may pick a newer model at apply time). Custom
    // strategies have no curated entry — their own gods map (already applied)
    // stays as-is.
    const models = STRATEGY_MODELS[strategy];
    if (models) {
      for (const god of GOD_IDS) {
        if (models[god]) newEdits[god] = models[god];
      }
    }

    // Groq override removed. Everything stays within the GO plan.

    setEdits(newEdits);
  }, [strategy, provider]);

  // Map cost estimate tier to valid LLMStrategyTier for the API
  const getStrategyTier = (costTier: string): 'quality' | 'balanced' | 'budget' | 'free' | 'custom' => {
    switch (costTier) {
      case 'free': return 'free';
      case 'low': return 'budget';
      case 'moderate': return 'balanced';
      case 'higher': return 'quality';
      default: return 'custom';
    }
  };

  const createCustomStrategy = async () => {
    if (!data || !customStrategyName.trim() || Object.keys(customStrategyGodModels).length < GOD_IDS.length) {
      setCustomStrategyError('Please fill in all fields and select a model for every god');
      return;
    }
    setCustomStrategyCreating(true);
    setCustomStrategyError(null);
    try {
      const id = `custom-${customStrategyName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '')}`;
      if (!id.startsWith('custom-') || id.length <= 7) {
        throw new Error('Invalid strategy name');
      }
      // Build the custom strategy config
      const gods: Record<string, string> = {};
      for (const god of GOD_IDS) {
        gods[god] = customStrategyGodModels[god];
      }
      const terminalModel = gods.apollo;
      const smallModel = customStrategyGodModels.callimachus || terminalModel;
      
      const body = {
        id,
        name: customStrategyName.trim(),
        description: customStrategyDescription,
        plan: 'CUSTOM',
        tier: getStrategyTier(customStrategyCost),
        gods,
        terminal_llm: { model: terminalModel },
        vault_llm: { model: smallModel },
        estCostPerDay: customStrategyCost,
      };
      const res = await fetch('/api/olympus/providers/gods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customStrategy: body }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create custom strategy');
      
      // Refresh strategies list
      const r = await fetch('/api/olympus/providers/gods', { cache: 'no-store' });
      const d = await r.json();
      if (d?.customStrategies) {
        setCustomGodModels(prev => ({
          ...prev,
          [id]: d.customStrategies.find((s: any) => s.id === id)?.gods || gods,
        }));
      }
      
      toast.success('Custom strategy created', { description: `${customStrategyName} is now available in the strategy picker` });
      setCustomStrategyOpen(false);
      setCustomStrategyName('');
      setCustomStrategyGodModels({});
      setCustomStrategyCost('unknown');
      setCustomStrategyDescription('');
      // Select the new strategy
      setStrategy(id as LLMStrategy);
    } catch (e: any) {
      setCustomStrategyError(e.message);
    } finally {
      setCustomStrategyCreating(false);
    }
  };

  const deleteCustomStrategy = async (customStrategyId: string) => {
    if (!confirm(`Delete custom strategy ${customStrategyId}?`)) return;
    try {
      const res = await fetch(`/api/olympus/providers/gods?customStrategy=${customStrategyId}`, {
        method: 'DELETE',
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to delete custom strategy');
      toast.success('Custom strategy deleted');
      // Refresh strategies list
      const r = await fetch('/api/olympus/providers/gods', { cache: 'no-store' });
      const d = await r.json();
      if (d?.customStrategies) {
        // Update customGodModels
        setCustomGodModels(prev => {
          const next = { ...prev };
          delete next[customStrategyId];
          return next;
        });
      }
      // If we were using this strategy, switch to default
      if (strategy === customStrategyId) {
        setStrategy('go-balanced');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      for (const god of GOD_IDS) {
        const cls = edits[god] || DEFAULT_CLASSES[god];
        // Compare against the SELECTED strategy's curated default (not the
        // previously-applied model): the edits-sync effect above already put
        // every god on the target strategy's default, so a pure strategy
        // switch produces no spurious override POSTs. Only genuine manual
        // pins (or values that differ from both) reach the API.
        const orig = STRATEGY_MODELS[strategy]?.[god] ?? data.perGodClass[god] ?? DEFAULT_CLASSES[god];
        const override = cls !== DEFAULT_CLASSES[god] ? { class: cls } : null;
        if (cls !== orig) {
          const res = await fetch('/api/olympus/providers/gods', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send the target strategy so the API validates this override
            // against the target's catalog (a stale persisted strategy would
            // otherwise reject a valid pin, e.g. on free-big-pickle).
            body: JSON.stringify({ god, override, strategy }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || `Failed to save ${god} (${res.status})`);
          }
        }
      }
      if (strategy !== data.strategy) {
        // Client-side activation gate (the server enforces too): the strategy
        // cards are disabled when the required API is missing, but guard the
        // save path as well in case the selection was set some other way.
        const req = strategyApiRequirement(strategy);
        if (req && data.auth && data.auth[req.kind] === false) {
          throw new Error(`${req.label} not configured — this strategy is blocked. ${req.hint}`);
        }
        // Strategy switch: POST to /api/olympus/providers/gods with the strategy
        // field, which runs apply-strategy.js to rewrite opencode.json's agent
        // models. This ensures the strategy switch takes effect immediately.
        const r = await fetch('/api/olympus/providers/gods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategy }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `Failed to apply strategy (${r.status})`);
        }
        setStoreStrategy(strategy);
        // Notify other components to refresh their cached strategy value.
        try {
          window.dispatchEvent(new CustomEvent('olympus:strategy-changed', { detail: { strategy } }));
        } catch {}
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setUsingFallback(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // save the benchmark recording config.
  // Called immediately when the toggle changes (no need to click Save).
  const saveBenchmark = async (recordingEnabled: boolean, sessionLabel: string) => {
    setBenchSaving(true);
    try {
      const r = await fetch('/api/olympus/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingEnabled,
          sessionLabel: sessionLabel.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success(recordingEnabled ? 'Benchmark recording enabled' : 'Benchmark recording disabled', {
        description: recordingEnabled
          ? `Logging every dispatch to ~/OLYMPUS-VAULT/07_Reviews/benchmarks/${sessionLabel ? ` (session: ${sessionLabel})` : ''}`
          : 'No new benchmark entries will be written.',
      });
    } catch (e: any) {
      toast.error(`Failed to save benchmark config: ${e.message}`);
    } finally {
      setBenchSaving(false);
    }
  };

  // show ALL built-in strategies (GO + Zen + free) in
  // the same grid. Custom user-defined strategies are shown separately below.
  const goStrategies = (data?.availableStrategies ?? []);
  const customStrategies = data?.customStrategies ?? [];

  // Per-God Model Class dropdown: only show the models that belong to the
  // SELECTED strategy (GO -> opencode-go/*, Zen -> opencode/*, each free
  // strategy -> its own provider's free models, custom-* -> all free models).
  // The dropdown updates live when the user picks another strategy.
  const selectedStrategyEntry = [...goStrategies, ...customStrategies].find(s => s.id === strategy);
  const selectedFamily = familyForStrategy(selectedStrategyEntry);
  const familyLabel =
    selectedFamily === 'GO' ? 'GO models'
    : selectedFamily === 'ZEN' ? 'ZEN models'
    : strategy === 'free-openrouter' ? 'OpenRouter free models'
    : strategy === 'free-nvidia-build' ? 'NVIDIA free models'
    : strategy === 'free-big-pickle' ? 'Big Pickle flagship'
    : 'Free models (all providers)';
  // Activation gate — a strategy whose required API is not authorized cannot
  // be selected. Unknown auth (offline fallback) never blocks.
  const activeReq = strategyApiRequirement(strategy);
  const activeBlocked = activeReq ? data?.auth?.[activeReq.kind] === false : false;
  const displayClasses = (() => {
    // Per-strategy catalog — the same canonical function the API uses to
    // validate overrides, so the dropdown only offers models that would be
    // accepted: GO -> opencode-go/*, ZEN -> opencode/*, each free strategy ->
    // its own provider's free models, custom-* -> all free models.
    const perStrategy = modelClassesForStrategy(strategy);
    if (perStrategy.length > 0) return perStrategy;
    if (!data?.classFamilies) return data?.availableClasses || ALL_CLASSES;
    if (selectedFamily === 'ALL') {
      return [...data.classFamilies.GO, ...data.classFamilies.ZEN, ...data.classFamilies.FREE];
    }
    return data.classFamilies[selectedFamily] || data.availableClasses;
  })();
  // The "(default)" model for a god under the SELECTED strategy — the best
  // model that strategy routes that god to (GO/Zen/curated free map; custom
  // strategies carry their own gods map from disk). Falls back to the first
  // option of the visible list so the select always has a valid value.
  const strategyDefaultFor = (god: string) => {
    const d = STRATEGY_MODELS[strategy]?.[god] || customGodModels[strategy]?.[god] || DEFAULT_CLASSES[god];
    return d && displayClasses.includes(d) ? d : (displayClasses[0] || DEFAULT_CLASSES[god] || ALL_CLASSES[2]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-olympus-panel border-olympus-gold/20 text-olympus-text max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-olympus-gold">
            <Settings size={16} /> Settings
          </DialogTitle>
          <DialogDescription className="text-olympus-text-dim">
            LLM strategy, default provider, and per-god model classes.
            Changes persist to <code className="text-olympus-gold">~/.olympus/llm-providers.json</code>.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin text-olympus-gold" />
            <span className="text-[10px] font-mono text-olympus-text-dim">loading…</span>
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scroll pr-1">
            {usingFallback && (
              <div className="flex items-start gap-2 rounded-lg border border-olympus-amber-soft/30 bg-olympus-amber-soft/5 p-2.5">
                <AlertCircle size={12} className="text-olympus-amber-soft mt-0.5 shrink-0" />
                <div className="text-[10px] font-mono text-olympus-text leading-relaxed">
                  <span className="text-olympus-amber-soft font-semibold">Offline:</span>{' '}
                  showing defaults. Edits save when the API is back.
                </div>
              </div>
            )}

            {/* LLM Strategy — segmented control */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={12} className="text-olympus-gold" />
                <h3 className="text-[11px] font-semibold text-olympus-text uppercase tracking-wide">LLM Strategy</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCustomStrategyOpen(true)}
                  className="ml-auto text-olympus-gold hover:bg-olympus-gold/10"
                  aria-label="Create custom strategy"
                >
                  <Plus size={12} />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {activeBlocked && (
                  <div className="col-span-3 flex items-start gap-2 rounded-md border border-olympus-amber-soft/30 bg-olympus-amber-soft/5 p-2">
                    <AlertCircle size={11} className="text-olympus-amber-soft mt-0.5 shrink-0" />
                    <div className="text-[9px] font-mono text-olympus-text leading-relaxed">
                      <span className="text-olympus-amber-soft font-semibold">Active strategy blocked:</span>{' '}
                      the {activeReq?.label} is not configured. Add it inside OpenCode (`olympus opencode` → Settings)
                      to keep using this strategy — or pick another strategy above.
                    </div>
                  </div>
                )}
                {goStrategies.map(s => {
                  const isActive = strategy === s.id;
                  const req = strategyApiRequirement(s.id);
                  const blocked = req ? data?.auth?.[req.kind] === false : false;
                  return (
                    <button
                      key={s.id}
                      disabled={blocked}
                      onClick={() => setStrategy(s.id as LLMStrategy)}
                      className={cn(
                        'rounded-md border p-2 text-left transition-all overflow-hidden',
                        isActive
                          ? 'border-olympus-gold/40 bg-olympus-gold/10'
                          : 'border-olympus-gold/10 bg-olympus-card/50 hover:bg-olympus-gold/5',
                        blocked && 'opacity-50 olympus-ban-cursor hover:bg-olympus-card/50',
                      )}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        {isActive && <Check size={10} className="text-olympus-gold shrink-0" />}
                        {blocked && <Lock size={9} className="text-olympus-amber-soft shrink-0" />}
                        <span className={cn('text-[11px] font-mono font-semibold truncate', isActive ? 'text-olympus-gold' : blocked ? 'text-olympus-text-dim' : 'text-olympus-text')}>
                          {s.label}
                        </span>
                      </div>
                      {/* line-clamp-2 to prevent overflow */}
                      <div className="text-[9px] font-mono text-olympus-text-dim leading-relaxed mb-1 line-clamp-2">{s.description}</div>
                      <div className="text-[9px] font-mono uppercase tracking-wide">
                        {blocked ? (
                          <span className="text-olympus-amber-soft inline-flex items-center gap-1">needs {req?.label} <Lock size={9} /></span>
                        ) : (
                          <span className="text-olympus-text-dim">{s.tier === 'free' ? 'FREE' : `cost: ${s.estCostPerDay}`}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {customStrategies.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {customStrategies.map(s => {
                    const isActive = strategy === s.id;
                    return (
                      <div key={s.id} className="flex items-center gap-1">
                        <button
                          onClick={() => setStrategy(s.id as LLMStrategy)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono transition-all',
                            isActive
                              ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30'
                              : 'bg-olympus-card/50 text-olympus-text-dim hover:bg-olympus-gold/5',
                          )}
                        >
                          {isActive && <Check size={9} />}
                          {s.label}
                        </button>
                        <button
                          onClick={() => deleteCustomStrategy(s.id)}
                          className="p-1 rounded hover:bg-olympus-red/10 text-olympus-text-dim hover:text-olympus-red transition-colors"
                          aria-label={`Delete ${s.label}`}
                          title="Delete custom strategy"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

	                {/* Per-god model class — compact grid */}
	            {overrideCount > 0 && (
	              <div className="flex items-start gap-2 rounded-md border border-olympus-amber-soft/30 bg-olympus-amber-soft/5 p-2 mb-2">
	                <AlertTriangle size={12} className="text-olympus-amber-soft mt-0.5 shrink-0" />
	                <div className="flex-1 min-w-0 text-[10px] font-mono text-olympus-amber-soft leading-relaxed">
	                  ⚠ {overrideCount} per-god override{overrideCount === 1 ? '' : 's'} active — {overrideCount === 1 ? 'it will' : 'they will'} override the selected strategy.{' '}
	                  <button
	                    onClick={clearOverrides}
	                    disabled={clearingOverrides}
	                    className="underline underline-offset-2 hover:text-olympus-amber-soft/80 disabled:opacity-50"
	                  >
	                    {clearingOverrides ? 'Clearing…' : 'Clear overrides and re-apply'}
	                  </button>
	                </div>
	              </div>
	            )}
	            <section>
	              <div className="flex items-center gap-2 mb-2">
	                <h3 className="text-[11px] font-semibold text-olympus-text uppercase tracking-wide">Per-God Model Class</h3>
	                <button
	                  onClick={resetToDefaults}
	                  disabled={clearingOverrides}
	                  className="text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold underline underline-offset-2 disabled:opacity-50"
	                >
	                  {clearingOverrides ? 'Resetting…' : 'Reset to defaults'}
	                </button>
	                <span className="text-[9px] font-mono text-olympus-text-dim ml-auto">{familyLabel} · {displayClasses.length}</span>
	              </div>
	              <div className="grid grid-cols-3 gap-1.5">
	                {GOD_IDS.map(god => {
	                  const Icon = GOD_ICONS[god];
	                  const dirty = isDirty(god);
	                  const def = strategyDefaultFor(god);
	                  const val = edits[god] || def;
	                  // Guard against a stale edit pointing outside the visible
	                  // list (e.g. a live-refreshed model not in the catalog).
	                  const safeVal = displayClasses.includes(val) ? val : def;
	                  return (
	                    <div
	                      key={god}
	                      className={cn(
	                        'rounded-md border p-1.5 transition-colors',
	                        dirty
	                          ? 'border-olympus-gold/40 bg-olympus-gold/5'
	                          : 'border-olympus-gold/10 bg-olympus-card/50',
	                      )}
	                    >
	                      <div className="flex items-center gap-1 mb-1">
	                        <Icon size={11} className="text-olympus-gold shrink-0" />
	                        <span className="text-[10px] font-mono text-olympus-text truncate flex-1">{god.charAt(0).toUpperCase() + god.slice(1)}</span>
	                        {dirty && <span className="w-1 h-1 rounded-full bg-olympus-gold" />}
	                      </div>
	                      <select
	                        value={safeVal}
	                        onChange={(e) => setEdits(prev => ({ ...prev, [god]: e.target.value }))}
	                        className="w-full bg-olympus-bg border border-olympus-gold/15 rounded px-1.5 py-1 text-[9px] font-mono text-olympus-text outline-none focus:border-olympus-gold/40"
	                      >
	                        {displayClasses.map(c => (
	                          <option key={c} value={c}>
	                            {c.replace(/^[^/]+\//, '')}
	                            {c === def ? ' (default)' : ''}
	                          </option>
	                        ))}
	                      </select>
	                    </div>
	                  );
	                })}
	              </div>
	            </section>

            {/* opt-in toggle for real-world
                benchmark recording. When enabled, each finished run is logged
                to ~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl as
                it goes idle. The Benchmarks panel shows the running totals. */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-semibold text-olympus-text uppercase tracking-wide flex items-center gap-1.5">
                  <BarChart3 size={11} className="text-olympus-gold" />
                  Benchmark Recording
                </h3>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] font-mono', benchRecording ? 'text-olympus-green' : 'text-olympus-text-dim')}>
                    {benchRecording ? 'RECORDING' : 'OFF'}
                  </span>
                  <Switch
                    checked={benchRecording}
                    onCheckedChange={(v) => {
                      setBenchRecording(v);
                      // Save immediately so the toggle takes effect right away.
                      saveBenchmark(v, benchSessionLabel);
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] text-olympus-text-dim font-mono uppercase">
                  Session label (optional)
                </Label>
                <Input
                  value={benchSessionLabel}
                  onChange={e => setBenchSessionLabel(e.target.value)}
                  placeholder="e.g. refactor-2026-07"
                  className="bg-olympus-bg border-olympus-gold/20 text-olympus-text font-mono text-[11px] h-7"
                  onBlur={() => saveBenchmark(benchRecording, benchSessionLabel)}
                />
                <div className="text-[9px] text-olympus-text-dim font-mono leading-relaxed">
                  When enabled, each finished run (one row per session and agent:
                  model, strategy, tokens, cost, duration, outcome)
                  is logged to <code className="text-olympus-gold">~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl</code>.
                  Use the Benchmarks panel (Activity Bar → Benchmarks) to view running totals.
                  Off by default — only enable when you want to record real-world metrics.
                </div>
              </div>
            </section>

            {error && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-olympus-red">
                <AlertCircle size={11} /> {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            className="text-olympus-text-dim hover:text-olympus-text hover:bg-olympus-gold/5"
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !data}
            className="bg-olympus-gold/15 text-olympus-gold border border-olympus-gold/30 hover:bg-olympus-gold/25"
          >
            {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> :
             saved ? <Check size={12} className="mr-1.5" /> :
             <Save size={12} className="mr-1.5" />}
            {saved ? 'Saved' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Custom Strategy Creator Modal */}
    <Dialog open={customStrategyOpen} onOpenChange={setCustomStrategyOpen}>
      <DialogContent className="bg-olympus-panel border-olympus-gold/20 text-olympus-text max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-olympus-gold">
            <Plus size={16} /> Create Custom Strategy
          </DialogTitle>
          <DialogDescription className="text-olympus-text-dim">
            Pick a model for each god from your authorized APIs. Cost tier is estimated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto custom-scroll pr-1">
          {/* Strategy Name */}
          <div>
            <Label className="text-[10px] font-mono text-olympus-text uppercase tracking-wide mb-1 block">Strategy Name</Label>
            <Input
              value={customStrategyName}
              onChange={e => setCustomStrategyName(e.target.value.trim())}
              placeholder="e.g. my-hybrid-strategy"
              className="bg-olympus-bg border-olympus-gold/20 text-olympus-text font-mono text-[11px] h-8"
              maxLength={50}
            />
            <div className="text-[9px] text-olympus-text-dim font-mono mt-1">Must be unique. Will be prefixed with 'custom-'.</div>
          </div>

          {/* Cost Estimate Banner */}
          <div className={cn(
            'rounded-md border p-3 text-[10px] font-mono',
            customStrategyCost === 'free' ? 'border-olympus-green/30 bg-olympus-green/5 text-olympus-green' :
            customStrategyCost === 'low' ? 'border-olympus-gold/30 bg-olympus-gold/5 text-olympus-gold' :
            customStrategyCost === 'moderate' ? 'border-olympus-amber-soft/30 bg-olympus-amber-soft/5 text-olympus-amber-soft' :
            customStrategyCost === 'higher' ? 'border-olympus-red/30 bg-olympus-red/5 text-olympus-red' :
            'border-olympus-gold/10 bg-olympus-card/50 text-olympus-text-dim'
          )}>
            <div className="flex items-center gap-2">
              <Calculator size={11} />
              <span className="uppercase tracking-wide">Estimated Cost: {customStrategyCost.toUpperCase()}</span>
            </div>
            <div className="mt-1">{customStrategyDescription}</div>
          </div>

          {/* Per-God Model Selection */}
          <div>
            <Label className="text-[10px] font-mono text-olympus-text uppercase tracking-wide mb-2 block flex items-center gap-1">
              <span>Per-God Models</span>
              <span className="text-[9px] text-olympus-text-dim">({customStrategyModels.length} available)</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {GOD_IDS.map(god => {
                const Icon = GOD_ICONS[god];
                const val = customStrategyGodModels[god] || customStrategyModels[0] || '';
                return (
                  <div key={god} className="rounded-md border border-olympus-gold/15 bg-olympus-card/50 p-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon size={11} className="text-olympus-gold shrink-0" />
                      <span className="text-[10px] font-mono text-olympus-text">{god.charAt(0).toUpperCase() + god.slice(1)}</span>
                      <span className="text-[9px] text-olympus-text-dim font-mono">{GOD_DOMAINS[god]}</span>
                    </div>
                    <Select value={val} onValueChange={v => setCustomStrategyGodModels(prev => ({ ...prev, [god]: v }))}>
                      <SelectTrigger className="bg-olympus-bg border-olympus-gold/20 text-olympus-text font-mono text-[9px] h-8">
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {customStrategyModels.map(m => (
                          <SelectItem key={m} value={m}>
                            {m.replace(/^[^/]+\//, '')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Auto-generated description preview */}
          <div className="rounded-md border border-olympus-gold/10 bg-olympus-card/50 p-2">
            <div className="text-[9px] font-mono text-olympus-text-dim mb-1">Card Description Preview:</div>
            <div className="text-[9px] font-mono text-olympus-text leading-relaxed">
              {customStrategyDescription || 'Select models to generate description'}
            </div>
          </div>

          {customStrategyError && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-olympus-red">
              <AlertCircle size={11} /> {customStrategyError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setCustomStrategyOpen(false);
              setCustomStrategyName('');
              setCustomStrategyGodModels({});
              setCustomStrategyCost('unknown');
              setCustomStrategyDescription('');
              setCustomStrategyError(null);
            }}
            className="text-olympus-text-dim hover:text-olympus-text hover:bg-olympus-gold/5"
          >
            Cancel
          </Button>
          <Button
            onClick={createCustomStrategy}
            disabled={customStrategyCreating || !customStrategyName.trim() || Object.keys(customStrategyGodModels).length < GOD_IDS.length || customStrategyCost === 'unknown'}
            className="bg-olympus-gold/15 text-olympus-gold border border-olympus-gold/30 hover:bg-olympus-gold/25"
          >
            {customStrategyCreating ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
            {customStrategyCreating ? 'Creating...' : 'Create Strategy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
