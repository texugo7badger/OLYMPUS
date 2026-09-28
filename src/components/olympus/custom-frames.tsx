/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * Custom Frames — URL-only.
 *
 * The Frames tab is exclusively for adding custom URL frames (websites,
 * dashboards, docs, etc.). The old VSCodium and OpenCode TUI built-in
 * presets were removed — code editing now happens in the user's
 * external editor (Zed, VSCode, VSCodium, Cursor, etc.) launched from
 * the Editor Bridge tab, and the OpenCode TUI is accessible via the
 * Terminal tab's mode toggle + the IDE's TerminalTabs.
 *
 * Features:
 * - Add any HTTPS or localhost HTTP URL as a frame
 * - Frames persist to ~/.olympus/user-frames.json
 * - Each frame renders as a <webview> (Electron) that bypasses
 * X-Frame-Options and CSP frame-ancestors natively
 * - Manage frames (rename, delete) via the Manage dialog
 * - Favicons fetched from DuckDuckGo's privacy-friendly service
 */

import { useEffect, useRef, useState, useCallback, useMemo, createElement } from 'react';
import {
 ExternalLink, Plus, RefreshCw, Globe, Trash2, Settings,
 Loader2, AlertCircle, type LucideIcon,
} from 'lucide-react';
import {
 Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isValidFrameUrl, defaultSandboxFor } from '@/lib/custom-frames-engine';
import OlympusTooltip from './olympus-tooltip';

function faviconFor(url: string | undefined | null): string | null {
 if (!url) return null;
 try {
 const u = new URL(url);
 if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
 return `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`;
 } catch {
 return null;
 }
}

interface Frame {
 id: string;
 displayName: string;
 url: string;
 Icon?: LucideIcon;
 sandbox: string;
 custom?: boolean;
}

interface UserFrameDTO {
 id: string;
 displayName: string;
 url: string;
 sandbox: string;
 custom: true;
 createdAt: string;
}

const STORAGE_KEY = 'olympus-custom-frames';
const DISABLED_KEY = 'olympus-custom-frames-disabled';

function loadDisabledIds(): Set<string> {
 if (typeof window === 'undefined') return new Set();
 try {
 const r = localStorage.getItem(DISABLED_KEY);
 return r ? new Set(JSON.parse(r)) : new Set();
 } catch { return new Set(); }
}

function saveDisabledIds(ids: Set<string>) {
 if (typeof window === 'undefined') return;
 try { localStorage.setItem(DISABLED_KEY, JSON.stringify([...ids])); } catch {}
}

function loadFromStorage(): UserFrameDTO[] {
 if (typeof window === 'undefined') return [];
 try {
 const r = localStorage.getItem(STORAGE_KEY);
 return r ? JSON.parse(r) : [];
 } catch { return []; }
}

function saveToStorage(f: UserFrameDTO[]) {
 if (typeof window === 'undefined') return;
 try { localStorage.setItem(STORAGE_KEY, JSON.stringify(f)); } catch {}
}

export default function CustomFrames() {
 const [customFrames, setCustomFrames] = useState<Frame[]>([]);
 const [active, setActive] = useState<Frame | null>(null);
 const [refreshKey, setRefreshKey] = useState(0);
 const [addOpen, setAddOpen] = useState(false);
 const [manageOpen, setManageOpen] = useState(false);
 const [disabledIds, setDisabledIds] = useState<Set<string>>(loadDisabledIds());
 const [mountedIds, setMountedIds] = useState<Set<string>>(new Set());
 const [addFrameError, setAddFrameError] = useState<string | null>(null);

 useEffect(() => {
 // Load user frames from localStorage first (instant), then sync with server.
 setCustomFrames(loadFromStorage().map(f => ({
 id: f.id, displayName: f.displayName, url: f.url, sandbox: f.sandbox, custom: true,
 })));
 fetch('/api/olympus/user-frames')
 .then(r => r.json())
 .then(d => {
 if (d.frames && Array.isArray(d.frames)) {
 const frames: Frame[] = d.frames.map((f: UserFrameDTO) => ({
 id: f.id, displayName: f.displayName, url: f.url, sandbox: f.sandbox, custom: true,
 }));
 setCustomFrames(frames);
 saveToStorage(d.frames);
 }
 })
 .catch(() => {});
 }, []);

 // Auto-select the first enabled frame on mount.
 const enabledFrames = customFrames.filter(f => !disabledIds.has(f.id));
 useEffect(() => {
 if (!active && enabledFrames.length > 0) {
 setActive(enabledFrames[0]);
 setMountedIds(new Set([enabledFrames[0].id]));
 }
 }, [enabledFrames, active]);

 const toggleFrame = useCallback((id: string) => {
 setDisabledIds(prev => {
 const next = new Set<string>(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 saveDisabledIds(next);
 return next;
 });
 }, []);

 const handleSelectFrame = useCallback((f: Frame) => {
 setActive(f);
 setMountedIds(p => {
 if (p.has(f.id)) return p;
 const n = new Set(p);
 n.add(f.id);
 return n;
 });
 }, []);

 const handleAddFrame = async (f: { displayName: string; url: string; sandbox: string }) => {
 try {
 const r = await fetch('/api/olympus/user-frames', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ action: 'add', displayName: f.displayName, url: f.url, sandbox: f.sandbox }),
 });
 if (!r.ok) {
 const d = await r.json().catch(() => ({}));
 throw new Error(d.error || `HTTP ${r.status}`);
 }
 const d = await r.json();
 if (d.frame) {
 const nf: Frame = {
 id: d.frame.id, displayName: d.frame.displayName,
 url: d.frame.url, sandbox: d.frame.sandbox, custom: true,
 };
 setCustomFrames(p => [...p, nf]);
 handleSelectFrame(nf);
 setAddOpen(false);
 }
 } catch (e: any) {
 setAddFrameError(e.message || 'Failed to add frame');
 }
 };

 const handleDeleteFrame = async (id: string) => {
 try {
 await fetch('/api/olympus/user-frames', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ action: 'delete', id }),
 });
 } catch {}
 setCustomFrames(p => {
 const u = p.filter(f => f.id !== id);
 saveToStorage(u.map(x => ({
 id: x.id, displayName: x.displayName, url: x.url, sandbox: x.sandbox,
 custom: true, createdAt: new Date().toISOString(),
 })));
 return u;
 });
 setMountedIds(p => { const n = new Set(p); n.delete(id); return n; });
 if (active?.id === id) {
 setActive(customFrames.find(f => f.id !== id) || null);
 }
 };

 return (
 <div className="w-full h-full flex bg-[#0A0E16]">
 {/* Sidebar -- frame list */}
 <div className="w-48 shrink-0 border-r border-[#D4A574]/10 bg-[#0E1320] overflow-y-auto custom-scroll">
 <div className="px-3 py-2 text-[10px] font-semibold text-[#8B8B8B] uppercase tracking-wide sticky top-0 bg-[#0E1320] border-b border-[#D4A574]/10 flex items-center justify-between z-10">
 <span>Custom Frames</span>
 <div className="flex items-center gap-1.5">
 <OlympusTooltip content="Manage frames" side="bottom">
 <button onClick={() => setManageOpen(true)} className="text-[#8B8B8B] hover:text-[#D4A574] transition-colors">
 <Settings size={11} />
 </button>
 </OlympusTooltip>
 <OlympusTooltip content="Add custom frame by URL" side="bottom">
 <button onClick={() => { setAddOpen(true); setAddFrameError(null); }} className="text-[#D4A574] hover:text-[#D4A574]/80 transition-colors">
 <Plus size={11} />
 </button>
 </OlympusTooltip>
 </div>
 </div>
 <div className="py-1">
 {enabledFrames.length === 0 ? (
 <div className="px-3 py-4 text-center">
 <Globe size={18} className="text-[#5A5A5A] mx-auto mb-2" />
 <p className="text-[10px] text-[#8B8B8B] font-mono leading-relaxed">
 No frames yet.<br />Click + to add a URL.
 </p>
 </div>
 ) : (
 enabledFrames.map(f => (
 <FrameListItem
 key={f.id}
 frame={f}
 active={active?.id === f.id}
 onClick={() => handleSelectFrame(f)}
 onDelete={() => handleDeleteFrame(f.id)}
 />
 ))
 )}
 </div>
 <div className="px-3 py-2 mt-2 border-t border-[#D4A574]/10 text-[9px] text-[#8B8B8B] font-mono leading-relaxed">
 {enabledFrames.length} active · {customFrames.length - enabledFrames.length} disabled · {customFrames.length} total.
 </div>
 </div>

 {/* Main area -- active frame webview */}
 <div className="flex-1 min-w-0 relative">
 {active && mountedIds.has(active.id) && (
 <div className="absolute inset-0">
 <FrameView
 key={active.id + refreshKey}
 frame={active}
 onRefresh={() => setRefreshKey(k => k + 1)}
 />
 </div>
 )}
 {!active && (
 <div className="absolute inset-0 flex flex-col items-center justify-center text-[#8B8B8B] gap-3">
 <Globe size={32} className="text-[#D4A574]/40" />
 <p className="text-xs font-mono">No frame selected.</p>
 <button
 onClick={() => { setAddOpen(true); setAddFrameError(null); }}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#D4A574]/20 text-[#D4A574] hover:bg-[#D4A574]/30 text-[11px] font-mono"
 >
 <Plus size={12} /> Add a frame
 </button>
 </div>
 )}
 </div>

 <AddFrameDialog
 open={addOpen}
 onOpenChange={(b) => { setAddOpen(b); if (b) setAddFrameError(null); }}
 onAdd={handleAddFrame}
 externalError={addFrameError}
 />
 <ManageFramesDialog
 open={manageOpen}
 onOpenChange={setManageOpen}
 frames={customFrames}
 disabledIds={disabledIds}
 onToggle={toggleFrame}
 onDelete={handleDeleteFrame}
 />
 </div>
 );
}

function FrameListItem({ frame, active, onClick, onDelete }: {
 frame: Frame; active: boolean; onClick: () => void; onDelete: () => void;
}) {
 const [faviconFailed, setFaviconFailed] = useState(false);
 const faviconUrl = !faviconFailed ? faviconFor(frame.url) : null;

 return (
 <div
 className={cn(
 'group w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono hover:bg-[#D4A574]/5 transition-colors ',
 active && 'bg-[#D4A574]/10 text-[#D4A574]',
 )}
 onClick={onClick}
 >
 {faviconUrl ? (
 <img
 src={faviconUrl}
 alt=""
 width={13}
 height={13}
 className="shrink-0 rounded-[2px] object-contain"
 onError={() => setFaviconFailed(true)}
 />
 ) : (
 <Globe size={13} className="shrink-0" />
 )}
 <span className="truncate flex-1">{frame.displayName}</span>
 <button
 onClick={(e) => { e.stopPropagation(); onDelete(); }}
 className="opacity-0 group-hover:opacity-100 text-[#8B8B8B] hover:text-[#C4756A] transition-all"
 aria-label="Delete frame"
 >
 <Trash2 size={11} />
 </button>
 </div>
 );
}

function FrameView({ frame, onRefresh }: { frame: Frame; onRefresh: () => void }) {
 const ref = useRef<any>(null);

 return (
 <div className="w-full h-full flex flex-col bg-[#0A0E16]">
 <div className="h-7 shrink-0 flex items-center gap-2 px-3 bg-[#0E1320] border-b border-[#D4A574]/10 text-[10px] font-mono text-[#8B8B8B]">
 <Globe size={10} />
 <span className="truncate flex-1">{frame.url}</span>
 <OlympusTooltip content="Open in system browser" side="bottom">
 <button
 onClick={() => window.olympus?.openExternal?.(frame.url)}
 className="text-[#8B8B8B] hover:text-[#D4A574] transition-colors"
 >
 <ExternalLink size={11} />
 </button>
 </OlympusTooltip>
 <OlympusTooltip content="Reload frame" side="bottom">
 <button onClick={onRefresh} className="text-[#8B8B8B] hover:text-[#D4A574] transition-colors">
 <RefreshCw size={11} />
 </button>
 </OlympusTooltip>
 </div>
 <div className="flex-1 min-h-0">
 {createElement('webview', {
 ref,
 src: frame.url,
 title: frame.displayName,
 className: 'w-full h-full',
 style: { border: 'none' },
 sandbox: frame.sandbox,
 allowpopups: '',
 })}
 </div>
 </div>
 );
}

function AddFrameDialog({ open, onOpenChange, onAdd, externalError }: {
 open: boolean;
 onOpenChange: (b: boolean) => void;
 onAdd: (f: { displayName: string; url: string; sandbox: string }) => void;
 externalError: string | null;
}) {
 const [displayName, setDisplayName] = useState('');
 const [url, setUrl] = useState('');
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 if (open) { setDisplayName(''); setUrl(''); setError(externalError); }
 }, [open, externalError]);

 useEffect(() => { setError(externalError); }, [externalError]);

 const handleSubmit = () => {
 if (!displayName.trim()) { setError('Display name is required.'); return; }
 if (!url.trim()) { setError('URL is required.'); return; }
 if (!isValidFrameUrl(url)) { setError('URL must be http: or https: with a valid hostname.'); return; }
 onAdd({ displayName: displayName.trim(), url: url.trim(), sandbox: defaultSandboxFor(url) });
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="bg-[#0E1320] border-[#D4A574]/20 text-[#B8B8B8] max-w-md">
 <DialogHeader>
 <DialogTitle className="text-[#D4A574] flex items-center gap-2">
 <Plus size={16} /> Add Custom Frame
 </DialogTitle>
 <DialogDescription className="text-[#8B8B8B]">
 Add any website or localhost URL as an embedded frame.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 py-2">
 <div>
 <Label className="text-[#8B8B8B] text-[10px] font-mono uppercase">Display Name</Label>
 <Input
 value={displayName}
 onChange={e => setDisplayName(e.target.value)}
 placeholder="GitHub"
 className="bg-[#0A0E16] border-[#D4A574]/20 text-[#B8B8B8] mt-1"
 autoFocus
 />
 </div>
 <div>
 <Label className="text-[#8B8B8B] text-[10px] font-mono uppercase">URL</Label>
 <Input
 value={url}
 onChange={e => setUrl(e.target.value)}
 placeholder="https://github.com"
 className="bg-[#0A0E16] border-[#D4A574]/20 text-[#B8B8B8] mt-1 font-mono text-[11px]"
 onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
 />
 </div>
 {error && (
 <div className="flex items-start gap-2 text-[10px] font-mono text-[#C4756A] bg-[#C4756A]/10 border border-[#C4756A]/20 rounded px-2 py-1.5">
 <AlertCircle size={11} className="shrink-0 mt-0.5" />
 <span>{error}</span>
 </div>
 )}
 </div>
 <DialogFooter>
 <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#8B8B8B] hover:text-[#B8B8B8]">
 Cancel
 </Button>
 <Button onClick={handleSubmit} className="bg-[#D4A574]/20 text-[#D4A574] hover:bg-[#D4A574]/30 border-[#D4A574]/30">
 Add Frame
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

function ManageFramesDialog({ open, onOpenChange, frames, disabledIds, onToggle, onDelete }: {
 open: boolean;
 onOpenChange: (b: boolean) => void;
 frames: Frame[];
 disabledIds: Set<string>;
 onToggle: (id: string) => void;
 onDelete: (id: string) => void;
}) {
 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="bg-[#0E1320] border-[#D4A574]/20 text-[#B8B8B8] max-w-md">
 <DialogHeader>
 <DialogTitle className="text-[#D4A574] flex items-center gap-2">
 <Settings size={16} /> Manage Frames
 </DialogTitle>
 <DialogDescription className="text-[#8B8B8B]">
 Enable or disable your custom URL frames.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-1 py-2 max-h-[300px] overflow-y-auto custom-scroll">
 {frames.length === 0 ? (
 <div className="text-center py-6 text-[10px] font-mono text-[#8B8B8B]">
 No custom frames to manage.
 </div>
 ) : (
 frames.map(f => {
 const enabled = !disabledIds.has(f.id);
 return (
 <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#D4A574]/5 group">
 <Globe size={12} className={cn('shrink-0', enabled ? 'text-[#8B8B8B]' : 'text-[#5A5A5A]')} />
 <span className={cn('text-[11px] font-mono truncate flex-1', enabled ? 'text-[#B8B8B8]' : 'text-[#5A5A5A] line-through')}>{f.displayName}</span>
 <span className="text-[9px] font-mono text-[#5A5A5A] truncate max-w-[120px]">{f.url}</span>
 {/* Toggle switch */}
 <button
 onClick={() => onToggle(f.id)}
 className={cn(
 'relative w-8 h-4 rounded-full transition-colors shrink-0',
 enabled ? 'bg-[#D4A574]/40' : 'bg-[#3A3F4D]',
 )}
 aria-label={enabled ? 'Disable frame' : 'Enable frame'}
 >
 <span
 className={cn(
 'absolute top-0.5 w-3 h-3 rounded-full transition-all',
 enabled ? 'left-4 bg-[#D4A574]' : 'left-0.5 bg-[#8B8B8B]',
 )}
 />
 </button>
 <button
 onClick={() => onDelete(f.id)}
 className="opacity-0 group-hover:opacity-100 text-[#8B8B8B] hover:text-[#C4756A] transition-all shrink-0"
 aria-label="Delete frame"
 >
 <Trash2 size={11} />
 </button>
 </div>
 );
 })
 )}
 </div>
 <DialogFooter>
 <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#D4A574] hover:bg-[#D4A574]/10">
 Done
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
