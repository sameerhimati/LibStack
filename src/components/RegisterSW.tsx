"use client";

import { useEffect } from "react";

// Registers /sw.js once, only on production builds served over https.
// Guards:
//   - file:// (offline bundle on iPad) — `serviceWorker` exists but registration
//     is meaningless; we skip via the protocol check.
//   - dev — registering during `next dev` poisons the cache for development.
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:") return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[libstack] sw register failed:", err));
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
