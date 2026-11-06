'use client';

/**
 * use-mobile-pwa — v0.0.85: the install lane shared by both phone surfaces.
 *
 * Registers ONE service worker (`/m-sw.js`, scope `/m`) for `/m` and
 * `/m/widget`, migrates the v0.0.84 widget worker (scope `/m/widget`), and
 * exposes the deferred `beforeinstallprompt` so the page can offer install
 * without a browser-specific banner.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useCallback, useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface MobilePwaState {
  /** The deferred install prompt, when the browser is ready to install. */
  installEvent: InstallPromptEvent | null;
  /** True once the app runs standalone (installed) or after `appinstalled`. */
  installed: boolean;
  /** Ask the browser to install; returns whether the user accepted. */
  install: () => Promise<boolean>;
}

export function useMobilePwa(): MobilePwaState {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (!cancelled) setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      if (!cancelled) {
        setInstalled(true);
        setInstallEvent(null);
      }
    };

    try {
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true;
      setInstalled(Boolean(standalone));
    } catch { /* older browser */ }

    if ('serviceWorker' in navigator) {
      void (async () => {
        try {
          // v0.0.84 installed the widget with its own worker. One scope now
          // owns both surfaces; retire the narrow worker so it cannot serve a
          // stale shell after an update.
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(async (registration) => {
            const url = registration.active?.scriptURL
              || registration.waiting?.scriptURL
              || registration.installing?.scriptURL
              || '';
            if (url.endsWith('/widget-sw.js')) {
              await registration.unregister().catch(() => {});
            }
          }));
          await navigator.serviceWorker.register('/m-sw.js', { scope: '/m' });
        } catch { /* http LAN: installability needs HTTPS */ }
      })();
    }

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return false;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      return choice.outcome === 'accepted';
    } catch {
      return false;
    }
  }, [installEvent]);

  return { installEvent, installed, install };
}
