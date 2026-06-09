"use client";

import { useRouter } from "next/navigation";

// "← Back" that returns to where you were (browser back restores the home
// scroll position) instead of pushing a fresh "/" navigation that lands at the
// top. Falls back to a push when there's no in-app history to pop — e.g. a
// deep-link or fresh PWA launch straight onto an article.
export default function BackLink() {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <button
      type="button"
      onClick={onBack}
      className="text-sm text-muted hover:text-accent"
    >
      ← Back
    </button>
  );
}
