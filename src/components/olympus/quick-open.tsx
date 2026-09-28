/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * QuickOpen — fuzzy file finder (Cmd/Ctrl+P).
 *
 * Launches the user's external editor on the selected file.
 * Falls back to a toast pointing to the Editor Bridge tab if no editor is configured.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { File, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
}

interface QuickOpenProps {
  open: boolean;
  onClose: () => void;
  onSelect: (filePath: string) => void;
}

export default function QuickOpen({ open, onClose, onSelect }: QuickOpenProps) {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load files on open.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setFiles([]);
      setSelectedIdx(0);
      setError(null);
      return;
    }
    setLoading(true);
    fetch('/api/olympus/fs/quick-open', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.files) {
          setFiles(d.files.filter((f: FileEntry) => !f.isDirectory).slice(0, 500));
        } else if (d.error) {
          setError(d.error);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  // Focus the input on open.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Fuzzy filter.
  const filtered = useMemo(() => {
    if (!query.trim()) return files.slice(0, 50);
    const q = query.toLowerCase();
    return files
      .filter(f => {
        const lower = f.path.toLowerCase();
        // Simple fuzzy: every char of query must appear in order.
        let qi = 0;
        for (let i = 0; i < lower.length && qi < q.length; i++) {
          if (lower[i] === q[qi]) qi++;
        }
        return qi === q.length;
      })
      .slice(0, 50);
  }, [files, query]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  const handleSelect = useCallback((idx: number) => {
    const f = filtered[idx];
    if (!f) return;
    onSelect(f.path);
    onClose();
  }, [filtered, onSelect, onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(selectedIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(b) => !b && onClose()}>
      <DialogContent className="bg-olympus-panel border-olympus-gold/20 text-olympus-text max-w-2xl p-0">
        <div className="border-b border-olympus-gold/10 p-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Fuzzy search files… (opens in your external editor)"
            className="bg-olympus-bg border-olympus-gold/20 text-olympus-text font-mono text-[12px] h-8"
          />
        </div>
        <div className="max-h-80 overflow-y-auto custom-scroll">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-olympus-text-dim text-[11px] font-mono">
              <Loader2 size={11} className="animate-spin" /> Indexing files…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-olympus-red">
              <AlertCircle size={11} /> {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] font-mono text-olympus-text-dim">
              No files match.
            </div>
          )}
          {filtered.map((f, i) => (
            <button
              key={f.path}
              onClick={() => handleSelect(i)}
              onMouseEnter={() => setSelectedIdx(i)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                i === selectedIdx ? 'bg-olympus-gold/10' : 'hover:bg-olympus-gold/5',
              )}
            >
              <File size={11} className={i === selectedIdx ? 'text-olympus-gold' : 'text-olympus-text-dim'} />
              <span className={cn(
                'text-[11px] font-mono truncate',
                i === selectedIdx ? 'text-olympus-gold' : 'text-olympus-text',
              )}>
                {f.name}
              </span>
              <span className="text-[9px] font-mono text-olympus-text-dim truncate ml-auto">
                {f.path}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
