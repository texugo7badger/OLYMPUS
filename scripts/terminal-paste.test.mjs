#!/usr/bin/env node
/**
 * terminal-paste.test.mjs — v0.0.74.
 *
 * The composer must accept what the clipboard carries (images, documents,
 * archives) and show each attachment as a compact `[name]` token — the same
 * contract the reference terminal uses. Source-level assertions plus the
 * upload routes the paste path reuses.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'src/components/olympus/interactive-terminal.tsx'), 'utf-8');
let failures = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 200)}`);
  if (!cond) failures++;
};

check('P-1: the composer handles paste', /onPaste=\{handlePaste\}/.test(src), 'no onPaste on the textarea');
check('P-2: paste reads clipboard files', /clipboardData\?\.items/.test(src) && /kind === 'file'/.test(src) && /getAsFile\(\)/.test(src), 'clipboard files not read');
check('P-3: a pasted file becomes a [name] token', /const token = `\[\$\{name\}\]`/.test(src) && /insertToken\(/.test(src), 'no [name] token');
check('P-4: images go to the reference-image lane', /\/api\/olympus\/image-upload/.test(src) && /setPendingImage/.test(src), 'image lane missing');
check('P-5: documents and archives go to the upload lane', /\/api\/olympus\/upload/.test(src) && /setUploadedFileDetails/.test(src), 'file lane missing');
check('P-6: the staged image renders as [name], not a big chip', /\[\{pendingImage\.filename\}\]/.test(src), 'pending image still renders as a bare thumbnail');
check('P-7: plain text paste is left to the browser', /if \(files\.length === 0\) return;/.test(src), 'text paste is swallowed');
check('P-8: the send path carries the attachments', /uploadedFiles: uploadedFileDetails\.map/.test(src) && /imageSavedPath: attachedImage\?\.savedPath/.test(src), 'attachments do not ride the message');

console.log(`\nterminal-paste: ${failures === 0 ? 'PASS' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
