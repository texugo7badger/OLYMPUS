#!/usr/bin/env node
/**
 * preview-share.test.mjs — v0.0.79.
 *
 * The share link is a capability: random, hashed at rest, expiring, revocable,
 * and it rewrites root-relative URLs so the recipient stays inside the preview.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-share-'));
process.env.OLYMPUS_HOME = HOME;

const { createShare, resolveShare, revokeShare, listShares, rewriteHtml } = await import('../src/lib/preview-share.ts');
let failures = 0;
const check = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + String(d).slice(0, 200)}`); if (!c) failures++; };

const now = Date.parse('2026-11-04T18:00:00Z');
const { share, token } = createShare({ project: 'aime', port: 3038, url: 'http://127.0.0.1:3038/', ttlHours: 24, now });
check('S-1: the token is 32 random bytes (64 hex)', /^[a-f0-9]{64}$/.test(token), token);
check('S-2: only the hash is stored', share.tokenHash !== token && /^[a-f0-9]{64}$/.test(share.tokenHash), share.tokenHash);
check('S-3: the record names the project and port', share.project === 'aime' && share.port === 3038, JSON.stringify(share));

const resolved = resolveShare(token, now + 1000);
check('S-4: a valid token resolves', resolved?.id === share.id, JSON.stringify(resolved));
check('S-5: a wrong token does not', resolveShare('a'.repeat(64), now + 1000) === null, 'wrong token resolved');
check('S-6: the token expires', resolveShare(token, now + 25 * 3600_000) === null, 'expired token resolved');

const revoked = revokeShare(share.id, now + 2000);
check('S-7: revoke works and is idempotent', revoked === true && revokeShare(share.id, now + 2000) === false, 'revoke failed');
check('S-8: a revoked token does not resolve', resolveShare(token, now + 3000) === null, 'revoked token resolved');

const list = listShares('aime');
check('S-9: the list never exposes the hash', list.length === 1 && !('tokenHash' in list[0]), JSON.stringify(list));

const html = '<html><head><link href="/style.css"><script src="/app.js"></script></head><body><a href="/about">x</a><img src="https://x/y.png"></body></html>';
const out = rewriteHtml(html, '/share/preview/abc');
check('S-10: root-relative URLs move into the share prefix', out.includes('href="/share/preview/abc/style.css"') && out.includes('src="/share/preview/abc/app.js"') && out.includes('href="/share/preview/abc/about"'), out);
check('S-11: absolute URLs are untouched', out.includes('src="https://x/y.png"'), out);

fs.rmSync(HOME, { recursive: true, force: true });
console.log(`\npreview-share: ${failures === 0 ? 'PASS' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
