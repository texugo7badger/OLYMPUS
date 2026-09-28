/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * EditorBridgePanel — replaces the old IdePanel (Monaco editor + file explorer
 * + terminal tabs) as the right pane's "IDE" tab.
 *
 * What it does:
 *   1. Shows the user's configured external editor (Zed, VSCode, VSCodium,
 *      Cursor, or custom) with a big "Open in <editor>" button.
 *   2. Auto-detects installed editors on mount + on a 30s refresh.
 *   3. Lets the user switch the preferred editor without leaving the tab.
 *   4. Shows the Terminal Bridge status (port 3740, # of attached IDE
 *      extensions) so the user knows whether their VSCode extension is
 *      connected.
 *   5. Provides a "Install the IDE extension" section with one-click
 *      install commands for VSCode-family + Zed.
 *   6. Shows recent projects (read from /api/olympus/projects) with a
 *      one-click "Open in editor" for each.
 *
 * The panel is intentionally compact — it's a launchpad, not an editor.
 * The actual editing happens in the user's preferred IDE.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  ExternalLink, RefreshCw, Folder, Loader2, CheckCircle2, AlertCircle,
  Cable, ArrowUpRight, CodeXml, Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOlympus, type ProjectNote } from '@/lib/olympus-store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetectedEditor {
  id: string;
  displayName: string;
  binPath: string | null;
  source: 'PATH' | 'known-location' | null;
  homepage: string;
  tagline: string;
}

interface EditorConfig {
  preferred: string;
  customBinPath?: string;
  lastDetected?: DetectedEditor[];
  lastDetectedAt?: string;
}

interface StatusResponse {
  config: EditorConfig;
  detected: DetectedEditor[];
  resolved: { editorId: string; editorName: string; binPath: string } | null;
  bridge: { port: number; host: string; listening: boolean; tokenFile: string };
  ts: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditorBridgePanel() {
  const activeProject = useOlympus(s => s.activeProject);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Initial fetch + 30s poll.
  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/olympus/editor/status', { cache: 'no-store' });
      if (!r.ok) return;
      const d: StatusResponse = await r.json();
      setStatus(d);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus().then(() => setLoading(false));
    const iv = setInterval(fetchStatus, 30000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const launchEditor = async (projectPath?: string) => {
    const path = projectPath ?? activeProject?.path;
    if (!path) {
      toast.error('No active project — open or create one first.');
      return;
    }
    setLaunching(true);
    try {
      const r = await fetch('/api/olympus/editor/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: path }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      toast.success(`Opened ${d.editorName} on ${path.split('/').pop()}`, {
        description: `PID ${d.pid ?? '?'}`,
      });
    } catch (e: any) {
      toast.error(`Editor launch failed: ${e.message}`);
    } finally {
      setLaunching(false);
    }
  };

  const detected = status?.detected ?? [];
  const resolved = status?.resolved ?? null;
  const bridgeListening = status?.bridge.listening ?? false;
  const installedEditors = detected.filter(e => e.binPath);
  const missingEditors = detected.filter(e => !e.binPath);

  return (
    <div className="w-full h-full flex bg-olympus-bg overflow-hidden">
      {/* Main column */}
      <div className="flex-1 min-w-0 overflow-y-auto custom-scroll">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-olympus-gold/10">
          <div className="flex items-center gap-2 mb-1">
            <CodeXml size={14} className="text-olympus-gold" />
            <h2 className="text-sm font-mono font-semibold text-olympus-gold uppercase tracking-wider">
              Editor Bridge
            </h2>
            <div className="flex-1" />
            <button
              onClick={() => { fetchStatus(); toast.info('Refreshed editor status'); }}
              className="text-olympus-text-dim hover:text-olympus-gold transition-colors p-1"
              aria-label="Refresh"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-olympus-text-dim hover:text-olympus-gold transition-colors p-1"
              aria-label="Editor settings"
            >
              <SettingsIcon size={11} />
            </button>
          </div>
          <p className="text-[11px] font-mono text-olympus-text-dim leading-relaxed">
            Launch your preferred IDE (Zed, VSCode, VSCodium, Cursor) on the active
            project. The Terminal Bridge keeps your editor's terminal in sync with OLYMPUS
            (port 3740).
          </p>
        </div>

        {/* Primary launch card */}
        <div className="px-6 py-5 border-b border-olympus-gold/10">
          <div className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide mb-2">
            Active Project
          </div>
          {activeProject ? (
            <div className="flex items-start gap-3 mb-4">
              <Folder size={20} className="text-olympus-gold mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-mono font-semibold text-olympus-text">
                  {activeProject.name}
                </div>
                <div className="text-[10px] font-mono text-olympus-text-dim truncate">
                  {activeProject.path}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-olympus-text-dim mb-4 italic">
              No active project. Create one with the + button in the top bar.
            </div>
          )}

          <div className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide mb-2">
            Configured Editor
          </div>
          {resolved ? (
            <div className="bg-olympus-panel border border-olympus-gold/20 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={12} className="text-olympus-green" />
                <span className="text-sm font-mono font-semibold text-olympus-gold">
                  {resolved.editorName}
                </span>
              </div>
              <div className="text-[10px] font-mono text-olympus-text-dim truncate">
                {resolved.binPath}
              </div>
            </div>
          ) : (
            <div className="bg-olympus-panel border border-olympus-red/30 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={12} className="text-olympus-red" />
                <span className="text-sm font-mono font-semibold text-olympus-red">
                  No editor detected
                </span>
              </div>
              <div className="text-[10px] font-mono text-olympus-text-dim">
                Install one of the editors below, or set a custom binary path in Settings.
              </div>
            </div>
          )}

          <Button
            onClick={() => launchEditor()}
            disabled={!resolved || !activeProject || launching}
            className="w-full bg-olympus-gold text-olympus-bg hover:bg-olympus-gold/90 font-mono text-[12px] h-9"
          >
            {launching ? (
              <Loader2 size={13} className="animate-spin mr-2" />
            ) : (
              <ExternalLink size={13} className="mr-2" />
            )}
            Open {resolved?.editorName ?? 'Editor'} on {activeProject?.name ?? 'project'}
          </Button>
        </div>

        {/* Terminal Bridge status */}
        <div className="px-6 py-4 border-b border-olympus-gold/10">
          <div className="flex items-center gap-2 mb-2">
            <Cable size={12} className="text-olympus-gold" />
            <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">
              Terminal Bridge
            </span>
            <span
              className={cn(
                'ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded',
                bridgeListening
                  ? 'bg-olympus-green/15 text-olympus-green'
                  : 'bg-olympus-red/15 text-olympus-red',
              )}
            >
              {bridgeListening ? 'LISTENING' : 'OFFLINE'}
            </span>
          </div>
          <div className="text-[10px] font-mono text-olympus-text-dim leading-relaxed">
            Token-gated WebSocket at{' '}
            <code className="text-olympus-gold">ws://127.0.0.1:3740</code>.
            The terminal inside your editor mirrors the one running in OLYMPUS —
            type in either, see it in both.
          </div>
          {bridgeListening && (
            <div className="text-[10px] font-mono text-olympus-text-dim mt-2">
              Token file: <code className="text-olympus-gold">~/.olympus/terminal-bridge-token</code>
            </div>
          )}
        </div>

        {/* Detected editors */}
        <div className="px-6 py-4 border-b border-olympus-gold/10">
          <div className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide mb-3">
            Detected Editors ({installedEditors.length}/{detected.length})
          </div>
          {detected.length === 0 && loading ? (
            <div className="text-[11px] font-mono text-olympus-text-dim italic">
              <Loader2 size={10} className="animate-spin inline mr-1" /> Detecting…
            </div>
          ) : (
            <div className="space-y-2">
              {installedEditors.map(ed => (
                <EditorRow
                  key={ed.id}
                  editor={ed}
                  isPreferred={status?.config.preferred === ed.id}
                  onUse={() => setPreferred(ed.id, fetchStatus)}
                />
              ))}
              {missingEditors.length > 0 && (
                <>
                  <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide pt-2 pb-1">
                    Not Installed
                  </div>
                  {missingEditors.map(ed => (
                    <EditorRow key={ed.id} editor={ed} isPreferred={false} onInstall={() => openInstallLink(ed.homepage)} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Settings dialog */}
      <EditorSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={status?.config}
        detected={detected}
        onSaved={fetchStatus}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EditorRow({
  editor, isPreferred, onUse, onInstall,
}: {
  editor: DetectedEditor;
  isPreferred: boolean;
  onUse?: () => void;
  onInstall?: () => void;
}) {
  const installed = !!editor.binPath;
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded border transition-colors',
        installed
          ? 'border-olympus-gold/20 bg-olympus-panel hover:bg-olympus-gold/5'
          : 'border-olympus-gold/10 bg-olympus-panel/50',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-[11px] font-mono font-semibold',
            installed ? 'text-olympus-text' : 'text-olympus-text-dim',
          )}>
            {editor.displayName}
          </span>
          {isPreferred && (
            <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-gold/20 text-olympus-gold uppercase tracking-wide">
              Preferred
            </span>
          )}
          {installed && (
            <span className="text-[8px] font-mono text-olympus-text-dim">
              ({editor.source})
            </span>
          )}
        </div>
        <div className="text-[9px] font-mono text-olympus-text-dim truncate">
          {installed ? editor.binPath : editor.tagline}
        </div>
      </div>
      {installed ? (
        <button
          onClick={onUse}
          disabled={isPreferred}
          className={cn(
            'text-[10px] font-mono px-2 py-1 rounded',
            isPreferred
              ? 'bg-olympus-gold/10 text-olympus-text-dim cursor-default'
              : 'bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30',
          )}
        >
          {isPreferred ? 'Active' : 'Use'}
        </button>
      ) : (
        <button
          onClick={onInstall}
          className="text-[10px] font-mono px-2 py-1 rounded bg-olympus-blue/20 text-olympus-blue hover:bg-olympus-blue/30 flex items-center gap-1"
        >
          Install <ArrowUpRight size={9} />
        </button>
      )}
    </div>
  );
}

function ProjectRow({
  project, isActive, onLaunch, disabled,
}: {
  project: ProjectNote;
  isActive: boolean;
  onLaunch: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded',
        isActive ? 'bg-olympus-gold/10' : 'hover:bg-olympus-gold/5',
      )}
    >
      <Folder size={11} className={isActive ? 'text-olympus-gold' : 'text-olympus-text-dim'} />
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-[11px] font-mono font-semibold truncate',
          isActive ? 'text-olympus-gold' : 'text-olympus-text',
        )}>
          {project.name}
        </div>
        <div className="text-[9px] font-mono text-olympus-text-dim truncate">
          {project.path}
        </div>
      </div>
      <button
        onClick={onLaunch}
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 text-[10px] font-mono px-2 py-0.5 rounded bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 transition-all disabled:opacity-30"
      >
        Open <ArrowUpRight size={9} className="inline" />
      </button>
    </div>
  );
}

function ExtensionInstallCard() {
  return (
    <div className="bg-olympus-panel border border-olympus-gold/20 rounded-lg p-3 space-y-2">
      <div className="text-[11px] font-mono text-olympus-text">
        Install the OLYMPUS extension in your IDE to embed the live terminal:
      </div>
      <div className="space-y-1.5">
        <ExtensionInstallRow
          editorName="VSCode / VSCodium / Cursor"
          command="code --install-extension olympus.olympus-bridge"
          altCommand="codium --install-extension olympus.olympus-bridge"
        />
        <ExtensionInstallRow
          editorName="Zed"
          command="zed extension install olympus-bridge"
          note="Zed extension API for embedded terminals is still maturing — for now this installs the slash-command + 'Open in OLYMPUS' integration."
        />
        <ExtensionInstallRow
          editorName="Any terminal"
          command="olympus terminal"
          note="Connects to the running OLYMPUS Terminal Bridge and streams the live PTY in your current shell."
        />
      </div>
      <div className="text-[9px] font-mono text-olympus-text-dim pt-1">
        The extension only works when OLYMPUS is running locally — it reads
        the per-install token from <code className="text-olympus-gold">~/.olympus/terminal-bridge-token</code>.
      </div>
    </div>
  );
}

function ExtensionInstallRow({
  editorName, command, altCommand, note,
}: {
  editorName: string;
  command: string;
  altCommand?: string;
  note?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <div className="bg-olympus-bg border border-olympus-gold/10 rounded p-2">
      <div className="text-[10px] font-mono text-olympus-gold mb-1">{editorName}</div>
      <div className="flex items-center gap-1">
        <code className="flex-1 text-[10px] font-mono text-olympus-text bg-olympus-bg/50 px-2 py-1 rounded truncate">
          $ {command}
        </code>
        <button
          onClick={() => copy(command)}
          className="text-[9px] font-mono px-2 py-1 rounded bg-olympus-gold/15 text-olympus-gold hover:bg-olympus-gold/25"
        >
          {copied === command ? '✓' : 'Copy'}
        </button>
      </div>
      {altCommand && (
        <div className="flex items-center gap-1 mt-1">
          <code className="flex-1 text-[10px] font-mono text-olympus-text-dim bg-olympus-bg/50 px-2 py-1 rounded truncate">
            $ {altCommand}
          </code>
          <button
            onClick={() => copy(altCommand)}
            className="text-[9px] font-mono px-2 py-1 rounded bg-olympus-gold/15 text-olympus-gold hover:bg-olympus-gold/25"
          >
            {copied === altCommand ? '✓' : 'Copy'}
          </button>
        </div>
      )}
      {note && (
        <div className="text-[9px] font-mono text-olympus-text-dim mt-1 leading-relaxed">
          {note}
        </div>
      )}
    </div>
  );
}

function EditorSettingsDialog({
  open, onOpenChange, config, detected, onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  config?: EditorConfig;
  detected: DetectedEditor[];
  onSaved: () => void;
}) {
  const [preferred, setPreferred] = useState<string>('auto');
  const [customBinPath, setCustomBinPath] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPreferred(config?.preferred ?? 'auto');
      setCustomBinPath(config?.customBinPath ?? '');
    }
  }, [open, config]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/olympus/editor/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred,
          customBinPath: customBinPath.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success('Editor preference saved');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-olympus-panel border-olympus-gold/20 text-olympus-text max-w-md">
        <DialogHeader>
          <DialogTitle className="text-olympus-gold flex items-center gap-2">
            <SettingsIcon size={14} /> Editor Settings
          </DialogTitle>
          <DialogDescription className="text-olympus-text-dim">
            Pick which detected editor OLYMPUS launches, or set a custom binary path.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-[10px] font-mono text-olympus-text-dim uppercase">
              Preferred editor
            </Label>
            <select
              value={preferred}
              onChange={e => setPreferred(e.target.value)}
              className="w-full mt-1 bg-olympus-bg border border-olympus-gold/20 text-olympus-text font-mono text-[11px] px-2 py-1.5 rounded"
            >
              <option value="auto">Auto (use first detected)</option>
              {detected.filter(e => e.binPath).map(ed => (
                <option key={ed.id} value={ed.id}>{ed.displayName} ({ed.binPath})</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[10px] font-mono text-olympus-text-dim uppercase">
              Custom binary path (override)
            </Label>
            <Input
              value={customBinPath}
              onChange={e => setCustomBinPath(e.target.value)}
              placeholder="/usr/local/bin/my-editor"
              className="bg-olympus-bg border-olympus-gold/20 text-olympus-text mt-1 font-mono text-[11px]"
            />
            <div className="text-[9px] font-mono text-olympus-text-dim mt-1">
              If set, OLYMPUS will use this binary instead of the detected one.
              Leave blank to use auto-detection.
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-olympus-text-dim">
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 border-olympus-gold/30"
          >
            {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setPreferred(editorId: string, refresh: () => Promise<void>) {
  try {
    const r = await fetch('/api/olympus/editor/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred: editorId }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    toast.success(`Preferred editor set`);
    await refresh();
  } catch (e: any) {
    toast.error(`Failed: ${e.message}`);
  }
}

function openInstallLink(url: string) {
  if (typeof window !== 'undefined' && window.olympus?.openExternal) {
    window.olympus.openExternal(url);
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
  }
}
