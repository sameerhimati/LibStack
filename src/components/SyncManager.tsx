"use client";

import { useEffect } from "react";
import { flushQueue } from "@/lib/vault-bridge";

// Drains the offline write-queue on the triggers from PLAN-vault-bridge.md:
// PWA open (mount), browser `online` event, and tab becoming visible again
// (covers iOS PWA resume, which doesn't always fire `online`). After each
// drain it dispatches `libstack:sync` so article UIs can refresh their state.
export default function SyncManager() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const run = () => {
      void flushQueue().then((s) => {
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent("libstack:sync", { detail: s }));
        }
      });
    };

    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
