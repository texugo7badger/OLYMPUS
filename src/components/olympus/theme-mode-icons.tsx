/**
 * theme-mode-icons.tsx — v0.0.32: the animated sun/moon for the Appearance
 * toggle. Pure SVG + CSS keyframes; the ACTIVE icon animates, the inactive
 * one rests dim. Small (16px) and cheap: two transforms, two opacity tweens.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

export function SunModeIcon({ active, size = 14 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={active ? 'tmi-sun-active' : 'tmi-idle'}>
      <style>{`
        .tmi-sun-active .tmi-rays { transform-origin: 12px 12px; animation: tmi-spin 12s linear infinite; }
        .tmi-sun-active .tmi-core { animation: tmi-breathe 2.6s ease-in-out infinite; transform-origin: 12px 12px; }
        .tmi-idle .tmi-rays, .tmi-idle .tmi-core { animation: none; }
        @keyframes tmi-spin { to { transform: rotate(360deg); } }
        @keyframes tmi-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @media (prefers-reduced-motion: reduce) { .tmi-rays, .tmi-core { animation: none; } }
      `}</style>
      <g className="tmi-rays" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
      </g>
      <circle className="tmi-core" cx="12" cy="12" r="4.2" fill="currentColor" />
    </svg>
  );
}

export function MoonModeIcon({ active, size = 14 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={active ? 'tmi-moon-active' : 'tmi-idle'}>
      <style>{`
        .tmi-moon-active .tmi-moon { animation: tmi-float 4.2s ease-in-out infinite; transform-origin: 12px 12px; }
        .tmi-moon-active .tmi-star { animation: tmi-twinkle 2.4s ease-in-out infinite; }
        .tmi-moon-active .tmi-star2 { animation: tmi-twinkle 2.4s ease-in-out infinite; animation-delay: .9s; }
        .tmi-idle .tmi-moon, .tmi-idle .tmi-star, .tmi-idle .tmi-star2 { animation: none; }
        @keyframes tmi-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1px); } }
        @keyframes tmi-twinkle { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .tmi-moon, .tmi-star, .tmi-star2 { animation: none; } }
      `}</style>
      <path className="tmi-moon" d="M15.5 3.2a8.8 8.8 0 1 0 5.3 13.4 7 7 0 1 1-5.3-13.4Z" fill="currentColor" />
      <circle className="tmi-star" cx="18.5" cy="5.5" r="1" fill="currentColor" />
      <circle className="tmi-star2" cx="21" cy="9.5" r=".7" fill="currentColor" />
    </svg>
  );
}
