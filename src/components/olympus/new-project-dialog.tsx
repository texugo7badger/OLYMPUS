/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * NewProjectDialog — the wizard for creating a new Olympus project.
 *
 * Workflow:
 * 1. User enters a project name (required) and a project path (required).
 * 2. On "Detect Stacks", we POST { path } to /api/olympus/stack/scan
 * and show the detected stacks as removable chips + the option to
 * add more from the catalog.
 * 3. Optional description field.
 * 4. Checkbox: "Open in <detected-editor> now" — if checked, after
 * creation we POST to /api/olympus/editor/launch to spawn the user's
 * configured external editor (Zed, VSCode, VSCodium, Cursor, etc.) at
 * the project path. replaces the old
 * "Open in VSCodium now" checkbox that spawned code-server.
 * 5. On "Create":
 * - POST /api/olympus/projects { name, path, stacks, description }
 * - Server creates the vault note + .code-workspace file
 * - On success: setActiveProject, refresh list, close dialog
 * - If "Open in editor" was checked: launch the external editor
 *
 * Stack picking UX:
 * - Detected stacks appear as filled chips (removable)
 * - A "Add stack" search lets the user add any from STACK_CATALOG
 * - Free-form stack strings are also accepted (for unusual stacks)
 *
 * References:
 * - shadcn Dialog, Input, Button, Checkbox components
 * - VSCode "Add Folder to Workspace" flow
 */

import { useState, useEffect } from 'react';
import { useOlympus } from '@/lib/olympus-store';
import {
 Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
 DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { X, FolderSearch, Plus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { STACK_CATALOG, stackColor, stackLabel } from '@/lib/stack-catalog';
import { toast } from 'sonner';

interface DetectedStack {
 stacks: string[];
 markers: { file: string; stack: string; found: boolean }[];
 path: string;
}

export default function NewProjectDialog() {
 const open = useOlympus(s => s.newProjectDialogOpen);
 const setOpen = useOlympus(s => s.setNewProjectDialogOpen);
 const setActiveProject = useOlympus(s => s.setActiveProject);
 const refreshProjects = useOlympus(s => s.refreshProjects);
 const setGraphData = useOlympus(s => s.setGraphData);

 const [name, setName] = useState('');
 const [path, setPath] = useState('');
 const [stacks, setStacks] = useState<string[]>([]);
 const [markers, setMarkers] = useState<{ file: string; stack: string; found: boolean }[]>([]);
 const [description, setDescription] = useState('');
 const [openInEditor, setOpenInEditor] = useState(true);
 const [scanning, setScanning] = useState(false);
 const [creating, setCreating] = useState(false);
 const [scanError, setScanError] = useState<string | null>(null);
 const [stackSearch, setStackSearch] = useState('');

 // Reset on close
 useEffect(() => {
 if (!open) {
 setName(''); setPath(''); setStacks([]); setMarkers([]);
 setDescription(''); setOpenInEditor(true); setScanError(null);
 setStackSearch('');
 }
 }, [open]);

 async function scanStacks() {
 if (!path.trim()) {
 setScanError('Enter a project path first');
 return;
 }
 setScanning(true);
 setScanError(null);
 try {
 const r = await fetch('/api/olympus/stack/scan', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ path: path.trim() }),
 });
 const d: DetectedStack = await r.json();
 if (!r.ok) throw new Error((d as any).error || 'Scan failed');
 setStacks(d.stacks);
 setMarkers(d.markers);
 toast.success(`Detected ${d.stacks.length} stack(s)`, {
 description: d.stacks.map(stackLabel).join(', ') || '(none)',
 });
 } catch (e: any) {
 setScanError(e.message);
 toast.error(`Stack scan failed: ${e.message}`);
 } finally {
 setScanning(false);
 }
 }

 function addStack(s: string) {
 if (!s || stacks.includes(s)) return;
 setStacks([...stacks, s]);
 setStackSearch('');
 }

 function removeStack(s: string) {
 setStacks(stacks.filter(x => x !== s));
 }

 async function handleCreate() {
 if (!name.trim()) { toast.error('Project name is required'); return; }
 if (!path.trim()) { toast.error('Project path is required'); return; }
 setCreating(true);
 try {
 const r = await fetch('/api/olympus/projects', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 name: name.trim(),
 path: path.trim(),
 stacks,
 description: description.trim(),
 }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'Create failed');

 // Server returns { project, detection }
 const project = d.project;

 // Set as active + reload graph
 setActiveProject(project);
 await refreshProjects();

 const graphR = await fetch(`/api/olympus/graph?project=${encodeURIComponent(project.slug)}`);
 const graphD = await graphR.json();
 setGraphData(graphD.graph);

 // Optional: launch the user's configured external editor on the new project.
 // replaces the old /api/olympus/vscodium/launch
 // flow that spawned code-server. The new /api/olympus/editor/launch route
 // resolves the user's configured editor binary (Zed, VSCode, VSCodium,
 // Cursor, etc.) and spawns it detached on the project path.
 if (openInEditor) {
 try {
 const eR = await fetch('/api/olympus/editor/launch', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 projectPath: project.path,
 projectSlug: project.slug,
 }),
 });
 const eD = await eR.json();
 if (!eR.ok) throw new Error(eD.error || 'Editor launch failed');
 toast.success(`Project created + ${eD.editorName || 'editor'} opened`, {
 description: `${project.name} @ ${project.path}`,
 });
 } catch (e: any) {
 toast.warning(`Project created, but editor launch failed: ${e.message}`);
 }
 } else {
 toast.success(`Project "${project.name}" created`);
 }

 setOpen(false);
 } catch (e: any) {
 toast.error(`Create failed: ${e.message}`);
 } finally {
 setCreating(false);
 }
 }

 const filteredCatalog = Object.keys(STACK_CATALOG).filter(s =>
 !stacks.includes(s) &&
 (stackSearch === '' || stackLabel(s).toLowerCase().includes(stackSearch.toLowerCase()))
 ).slice(0, 12);

 return (
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="max-w-2xl bg-olympus-panel border-olympus-gold/20 text-olympus-text">
 <DialogHeader>
 <DialogTitle className="text-olympus-gold flex items-center gap-2">
 <Plus size={16} /> New Olympus Project
 </DialogTitle>
 <DialogDescription className="text-olympus-text-dim">
 Register a project folder so Olympus can scope instincts to its stack.
 The brain stays global — only visibility changes per active project.
 </DialogDescription>
 </DialogHeader>

 <div className="flex flex-col gap-4 py-2">
 {/* Name */}
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="np-name" className="text-[11px] text-olympus-text-dim uppercase tracking-wide">
 Project name <span className="text-olympus-red">*</span>
 </Label>
 <Input
 id="np-name"
 value={name}
 onChange={e => setName(e.target.value)}
 placeholder="my-rust-app"
 className="bg-olympus-bg border-olympus-gold/20 text-olympus-text font-mono text-[12px]"
 />
 <span className="text-[10px] text-[#5A5A5A] font-mono">
 {name ? `slug: ${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)}` : ' '}
 </span>
 </div>

 {/* Path */}
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="np-path" className="text-[11px] text-olympus-text-dim uppercase tracking-wide">
 Project folder path <span className="text-olympus-red">*</span>
 </Label>
 <div className="flex gap-2">
 <Input
 id="np-path"
 value={path}
 onChange={e => setPath(e.target.value)}
 placeholder="/home/user/projects/my-rust-app"
 className="flex-1 bg-olympus-bg border-olympus-gold/20 text-olympus-text font-mono text-[12px]"
 />
 <Button
 onClick={scanStacks}
 disabled={scanning || !path.trim()}
 variant="outline"
 size="sm"
 className="border-olympus-gold/30 text-olympus-gold hover:bg-olympus-gold/10"
 >
 {scanning ? <Loader2 size={12} className="animate-spin" /> : <FolderSearch size={12} />}
 <span className="ml-1.5 text-[11px]">Detect</span>
 </Button>
 </div>
 {scanError && (
 <div className="flex items-center gap-1.5 text-[10px] text-olympus-red font-mono">
 <AlertCircle size={10} /> {scanError}
 </div>
 )}
 {markers.length > 0 && (
 <div className="text-[10px] text-[#5A5A5A] font-mono">
 Found: {markers.filter(m => m.found).map(m => m.file).join(', ') || '(no markers)'}
 </div>
 )}
 </div>

 {/* Stacks */}
 <div className="flex flex-col gap-1.5">
 <Label className="text-[11px] text-olympus-text-dim uppercase tracking-wide">
 Stacks {stacks.length > 0 && `(${stacks.length})`}
 </Label>
 <div className="flex flex-wrap gap-1.5 min-h-[28px] p-2 rounded border border-olympus-gold/15 bg-olympus-bg">
 {stacks.length === 0 && (
 <span className="text-[10px] text-[#5A5A5A] font-mono italic">
 Click “Detect” or add manually below
 </span>
 )}
 {stacks.map(s => (
 <Badge
 key={s}
 variant="outline"
 className="text-[10px] font-mono gap-1 pr-1"
 style={{
 background: `${stackColor(s)}20`,
 color: stackColor(s),
 borderColor: `${stackColor(s)}40`,
 }}
 >
 {stackLabel(s)}
 <button onClick={() => removeStack(s)} className="hover:text-olympus-red">
 <X size={9} />
 </button>
 </Badge>
 ))}
 </div>
 {/* Stack search/add */}
 <div className="flex gap-2">
 <Input
 value={stackSearch}
 onChange={e => setStackSearch(e.target.value)}
 placeholder="Search stacks to add (react, rust, go…)"
 className="flex-1 bg-olympus-bg border-olympus-gold/20 text-olympus-text font-mono text-[11px] h-8"
 />
 {stackSearch && !Object.keys(STACK_CATALOG).includes(stackSearch) && (
 <Button
 onClick={() => addStack(stackSearch)}
 variant="outline"
 size="sm"
 className="border-olympus-gold/30 text-olympus-gold"
 >
 <Plus size={10} /> Add “{stackSearch}”
 </Button>
 )}
 </div>
 {filteredCatalog.length > 0 && (
 <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
 {filteredCatalog.map(s => (
 <button
 key={s}
 onClick={() => addStack(s)}
 className="text-[10px] px-1.5 py-0.5 rounded font-mono hover:bg-olympus-gold/10"
 style={{ color: stackColor(s) }}
 >
 + {stackLabel(s)}
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Description */}
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="np-desc" className="text-[11px] text-olympus-text-dim uppercase tracking-wide">
 Description <span className="text-[#5A5A5A] normal-case">(optional)</span>
 </Label>
 <Textarea
 id="np-desc"
 value={description}
 onChange={e => setDescription(e.target.value)}
 placeholder="What is this project about?"
 className="bg-olympus-bg border-olympus-gold/20 text-olympus-text text-[12px] min-h-[48px] resize-none"
 />
 </div>

 {/* Open-in-editor checkbox */}
 <label className="flex items-center gap-2">
 <Checkbox
 checked={openInEditor}
 onCheckedChange={(v) => setOpenInEditor(v === true)}
 className="border-olympus-gold/40 data-[state=checked]:bg-olympus-gold data-[state=checked]:text-olympus-bg"
 />
 <span className="text-[11px] text-olympus-text">
 Open in external editor now (launches your configured Zed / VSCode / VSCodium / Cursor on this project)
 </span>
 </label>
 </div>

 <DialogFooter className="gap-2">
 <DialogClose asChild>
 <Button variant="ghost" size="sm" className="text-olympus-text-dim hover:text-olympus-text">
 Cancel
 </Button>
 </DialogClose>
 <Button
 onClick={handleCreate}
 disabled={creating || !name.trim() || !path.trim()}
 size="sm"
 className="bg-olympus-gold text-olympus-bg hover:bg-olympus-gold/90"
 >
 {creating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
 <span className="ml-1.5">Create Project</span>
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
