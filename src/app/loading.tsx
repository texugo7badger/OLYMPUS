/**
 * OLYMPUS — Route-level loading fallback.
 *
 * Without this file, the Next.js dev server returns the SSR'd shell with no
 * Suspense fallback while Turbopack compiles the page's JS chunks. This can
 * take 5-30 seconds on cold start — during which the user sees only the dark
 * body background. This loading.tsx streams a full-viewport spinner on the
 * OLYMPUS dark background immediately, before any page chunks compile.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export default function Loading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: '#0A0E16',
        color: '#8B8B8B',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '12px',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: '2px solid rgba(212, 165, 116, 0.3)',
          borderTopColor: '#D4A574',
          animation: 'olympus-spin 0.9s linear infinite',
        }}
      />
      <div style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        OLYMPUS is waking the gods…
      </div>
      <style>{`
        @keyframes olympus-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
