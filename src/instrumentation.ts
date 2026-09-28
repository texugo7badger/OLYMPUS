/**
 * Olympus Instrumentation entry point.
 *
 * Next.js instrumentation runs in BOTH the Node.js and Edge runtimes.
 * We use a dynamic import() so Turbopack only traces the Node-only code
 * for the Node.js bundle.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
  }
}
