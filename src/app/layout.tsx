import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OLYMPUS",
  description:
    "10-god multi-agent operating system built on OpenCode. Cascading token compression, self-curating brain, 3D brain atlas, click-to-element bridge, unified workspace.",
  keywords: [
    "OLYMPUS",
    "multi-agent",
    "OpenCode",
    "ECC",
    "caveman",
    "impeccable",
    "superpowers",
    "Obsidian",
    "parallel agents",
    "brain vault",
  ],
  authors: [{ name: "OLYMPUS Contributors" }],
  // Icons: Next.js 16 file conventions (src/app/icon.svg, src/app/apple-icon.png)
  // have HIGHER priority than metadata.icons. We delete those file-based icons
  // and rely entirely on metadata.icons pointing to /public/ assets.
  // This ensures the multi-resolution ICO (logo.ico) is used as the favicon,
  // which gives crisp rendering at all sizes (16/32/48/64/128/256).
  icons: {
    icon: [
      { url: '/logo.ico', sizes: 'any' },
      { url: '/logo.png', sizes: '256x256', type: 'image/png' },
      { url: '/logo.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcut: ['/logo.ico'],
    apple: [
      { url: '/logo.png', sizes: '256x256', type: 'image/png' },
    ],
  },
};

/**
 * DarkReader hydration fix — three layers of defense prevent attribute
 * mismatches when the DarkReader extension injects styles into SVG
 * elements (lucide icons) before React hydration:
 *
 * 1. `<meta name="color-scheme" content="dark" />` — standard signal
 * 2. `<meta name="darkreader-lock" content="dark">` — DarkReader-specific
 *    opt-out (skips DOM injection entirely for modern versions)
 * 3. Inline `<script>` that calls `DarkReader.disable()` synchronously
 *    in <head> before React hydration
 * 4. `suppressHydrationWarning` on <html>, <body>, and root <div> in
 *    page.tsx as a final safety net
 */
const DARKREADER_DISABLE_SCRIPT = `
(function() {
  try {
    // Method 1: DarkReader official API (v4.9.40+)
    if (typeof window !== 'undefined' && window.DarkReader) {
      if (typeof window.DarkReader.disable === 'function') {
        window.DarkReader.disable();
      }
      // Some builds expose autoFetch || disable
      if (typeof window.DarkReader.autoFetch === 'function') {
        try { window.DarkReader.autoFetch(false); } catch (e) {}
      }
    }
    // Method 2: Set a flag that DarkReader's content script checks
    // (some versions read window.__darkreader before injecting)
    if (typeof window !== 'undefined') {
      window.__darkreader = false;
      window.__darkreaderDisabled = true;
    }
  } catch (e) {
    // Swallow - never break the page
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-darkreader-lock="dark"
      suppressHydrationWarning
      className="dark"
      style={{ colorScheme: "dark" }}
    >
      <head>
        {/* Standard dark-mode signal */}
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#0A0E16" />
        {/* DarkReader-specific opt-out - when present, DarkReader skips
            the page entirely and does NOT inject attributes into SVGs */}
        <meta name="darkreader-lock" content="dark" />
        <meta name="darkreader" content="dark" />
        {/* NOTE: favicon <link> tags are intentionally NOT here.
            Next.js 16 auto-generates them from src/app/icon.svg and
            src/app/apple-icon.png with cache-busting ?url=<hash> params.
            Adding manual <link> tags here would conflict with the
            file-based ones and could cause stale-cache issues. */}
        {/* Synchronous script - runs before React hydration, disables
            DarkReader if it's already loaded, and sets flags for
            content-script-based versions */}
        <script dangerouslySetInnerHTML={{ __html: DARKREADER_DISABLE_SCRIPT }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-olympus-bg text-olympus-text overflow-hidden`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
