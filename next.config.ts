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
  serverExternalPackages: ['@alloc/quick-lru', '@radix-ui/primitive'],
};

export default nextConfig;
