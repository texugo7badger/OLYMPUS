/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * Issue #44 — diff-aware tool frames.
 *
 * "edit — src/app/page.tsx" tells you a god touched a file. It does not tell
 * you whether it added a line, deleted one, or rewrote the whole thing. A
 * frame that shows the shape of the change costs one click and removes the
 * "did it actually do what it said" question entirely.
 *
 * The diff is derived from the arguments the tool was called with — the old
 * and new text for `edit`, the content for `write`. No file is read and no
 * real diff is computed, so this stays honest about being an approximation
 * and stays cheap.
 */

'use client';

import { useState } from 'react';
import { ChevronRight, FilePlus2, FilePenLine } from 'lucide-react';
import { cn } from '@/lib/utils';

/** How many lines of context a collapsed frame is willing to show. */
const PREVIEW_LINES = 8;

export type FileChangeKind = 'modified' | 'added';

/** Added lines in a `write`, removed lines in an `edit`. */
export function countDelta(oldText: string, newText: string): { added: number; removed: number } {
  const before = lineCount(oldText);
  const after = lineCount(newText);
  return { added: Math.max(0, after - before), removed: Math.max(0, before - after) };
}

/** An empty string is zero lines, not one — `''.split('\n')` would say
 *  otherwise, and that would make creating a file report one line short. */
function lineCount(text: string): number {
  return text === '' ? 0 : text.split('\n').length;
}

function firstLines(text: string, n: number): string[] {
  return text.split('\n').slice(0, n);
}

interface DiffPreviewProps {
  path: string;
  input: any;
  kind: FileChangeKind;
}

/**
 * The expandable body of a file-touching tool frame.
 *
 * `edit` shows what left (oldString) above what arrived (newString); `write`
 * shows the head of the content it laid down. Both are truncated — the point
 * is orientation, not a review surface.
 */
export function DiffPreview({ path, input, kind }: DiffPreviewProps) {
  const [open, setOpen] = useState(false);

  const oldText = String(input?.oldString ?? '');
  const newText = String(input?.newString ?? input?.content ?? '');
  const { added, removed } = kind === 'added'
    ? { added: newText ? newText.split('\n').length : 0, removed: 0 }
    : countDelta(oldText, newText);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[9px] font-mono text-olympus-text-dim hover:text-olympus-gold transition-colors"
      >
        <ChevronRight size={9} className={cn('transition-transform', open && 'rotate-90')} />
        {open ? 'hide change' : 'show change'}
        <span className="text-olympus-green">+{added}</span>
        {removed > 0 && <span className="text-olympus-red">-{removed}</span>}
        <span className="text-[#5A5A5A]">· first {PREVIEW_LINES} lines</span>
      </button>

      {open && (
        <div className="mt-1 border-l border-olympus-gold/20 pl-2 space-y-0.5">
          {kind === 'modified' && removed > 0 && firstLines(oldText, PREVIEW_LINES).map((line, i) => (
            <div key={`old-${i}`} className="text-[9px] font-mono text-olympus-red/80 whitespace-pre-wrap break-all">
              <span className="select-none opacity-60">- </span>{line || ' '}
            </div>
          ))}
          {newText
            ? firstLines(newText, PREVIEW_LINES).map((line, i) => (
              <div key={`new-${i}`} className="text-[9px] font-mono text-olympus-green/80 whitespace-pre-wrap break-all">
                <span className="select-none opacity-60">+ </span>{line || ' '}
              </div>
            ))
            : <div className="text-[9px] font-mono text-[#5A5A5A]">(no inline content in args)</div>}
          {(oldText.split('\n').length > PREVIEW_LINES || newText.split('\n').length > PREVIEW_LINES) && (
            <div className="text-[8px] font-mono text-[#5A5A5A]">… truncated</div>
          )}
        </div>
      )}
      <span className="sr-only">{path}</span>
    </div>
  );
}

interface ToolFrameProps {
  toolName: string;
  input: any;
  text: string;
}

/**
 * Render a tool line. Only the file-touching tools get the treatment; bash,
 * read and grep stay on the single compact line they already had.
 */
export function ToolFrame({ toolName, input, text }: ToolFrameProps) {
  const name = toolName.toLowerCase();
  const path = String(input?.filePath ?? input?.path ?? input?.file ?? '');
  const kind: FileChangeKind | null = name === 'write' ? 'added' : name === 'edit' ? 'modified' : null;

  if (!kind || !path) {
    return <span className="text-[11px] text-[#8A8A8A] wrap-break-word font-mono leading-snug">{text}</span>;
  }

  const Icon = kind === 'added' ? FilePlus2 : FilePenLine;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon size={10} className={kind === 'added' ? 'text-olympus-green shrink-0' : 'text-olympus-gold shrink-0'} />
        <span className={cn('text-[9px] font-mono font-semibold shrink-0', kind === 'added' ? 'text-olympus-green' : 'text-olympus-gold')}>
          {kind === 'added' ? 'A' : 'M'}
        </span>
        <span className="text-[11px] text-[#8A8A8A] font-mono truncate">{path}</span>
      </div>
      <DiffPreview path={path} input={input} kind={kind} />
    </div>
  );
}