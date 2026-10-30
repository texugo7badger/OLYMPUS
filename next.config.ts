/** @type {import('next').NextConfig} */
const nextConfig = {
  // Olympus v0.0.1 — minimal Next.js config
  //
  // Olympus is a standalone Electron desktop application. The Next.js server
  // runs on localhost:3737 inside the Electron main process (see
  // electron/main.ts). The Electron BrowserWindow loads
  // http://localhost:3737 — there is no browser-mode deployment.
  //
  // API routes spawn OpenCode subprocesses and stream SSE events.
  reactStrictMode: true,
  // Hide the Next.js dev indicator (the floating "N" button).
  devIndicators: false,
  // For production Electron builds (`npm run build`), enable
  // `output: 'standalone'` so Next.js produces a self-contained server
  // at .next/standalone/ with its own minimal node_modules. This
  // dramatically reduces the electron-builder output size (no need to
  // ship the full node_modules tree). The electron-builder.yml copies
  // .next/standalone/ + .next/static/ + public/ into the packaged app.
  //
  // We enable this UNCONDITIONALLY because Olympus is always packaged
  // via electron-builder — there's no Vercel/Netlify deployment target.
  // If you need to run `next start` directly (without Electron) for
  // debugging, comment out this line temporarily.
  // Docs: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: 'standalone',
  // #BUILD-BLOAT (the v0.0.9 release-cut specimen, 2026-10-23): Turbopack's
  // dynamic-FS tracing (the lane/config reads use path.resolve(process.cwd(),
  // …)) decided the WHOLE project was a runtime input and copied every
  // non-excluded tree into .next/standalone — including dist-electron/ (the
  // PREVIOUS packaged build, 7.8 GB at the cut). The result: a standalone
  // output that grows by the size of the last release, an AppImage that
  // balloons, and a build that sits for minutes copying files it will never
  // serve. Nothing below is read by the Next server at runtime; the Electron
  // builder reads dist-electron-tsc/ and extensions/ directly from the repo.
  // Verified at the cut: standalone 7.8 GB → ~600 MB with these excludes.
  outputFileTracingExcludes: {
    '/*': [
      'dist-electron/**',
      'dist-electron-tsc/**',
      '.git/**',
      'docs/**',
      'extensions/**',
      'Todas as estratégias*.md',
    ],
  },
  // #STANDALONE-WS (v0.0.25, the boot crash): the instrumentation hook loads
  // `ws` via eval('require("ws")'), so Turbopack's tracer never sees it and
  // the standalone copy lost `ws/lib/websocket.js` — `ws/lib/stream.js`
  // requires './websocket' at module load, so `next start` died with
  // "Cannot find module './websocket'" (nondeterministic: a rebuild could
  // "fix" it by copying one more file). `ws` is externalized so it is read
  // from node_modules at runtime, and the whole package is force-traced into
  // the standalone output. scripts/verify-standalone.mjs gates the build.
  outputFileTracingIncludes: {
    '/*': ['./node_modules/ws/**'],
  },
  // No rewrites needed (Monaco editor removed — users edit in their preferred IDE).
  async rewrites() {
    return [];
  },
  // Turbopack is the default in Next.js 16. The old webpack override
  // (fallback for fs/path on server) is no longer needed — Turbopack
  // handles this natively.
  turbopack: {},
  // Ensure CJS packages with minimal exports maps are available to Turbopack's
  // server-side bundle (postcss plugin dependencies, radix-ui primitives).
  // These packages are installed in node_modules but Turbopack may not resolve
  // them automatically due to missing "exports" fields in their package.json.
  serverExternalPackages: ['@alloc/quick-lru', '@radix-ui/primitive', 'ws'],
};

export default nextConfig;
