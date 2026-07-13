"use client";

import { useEffect } from "react";

// Persist + restore the home-page scroll position across navigations. Static
// export + the Link-push navigation pattern reset scroll to the top, and iOS
// PWA bfcache is inconsistent, so we own it: save scrollY to sessionStorage as
// the user scrolls / leaves, restore it on mount and on pageshow (bfcache).
const KEY = "libstack:scroll:/";

export default function ScrollRestorer() {
  useEffect(() => {
    // Opt out of the browser's own attempt so it doesn't fight our restore.
    const prev = history.scrollRestoration;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    const restore = () => {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      const y = Number(raw);
      if (!Number.isNaN(y)) {
        // Wait a frame so the (server-rendered) list has laid out.
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
    };

    let queued = false;
    const save = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        sessionStorage.setItem(KEY, String(window.scrollY));
      });
    };
    const saveNow = () => sessionStorage.setItem(KEY, String(window.scrollY));

    restore();
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", saveNow);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", saveNow);

    return () => {
      saveNow();
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", saveNow);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", saveNow);
      if ("scrollRestoration" in history) history.scrollRestoration = prev;
    };
  }, []);

  return null;
}
