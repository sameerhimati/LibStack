"use client";

import { useEffect, useState } from "react";

const LAST_OPENED_KEY = "libstack:last-opened";
const LAST_OPENED_EVENT = "libstack:last-opened-changed";
const COLLAPSED_KEY = "libstack:collapsed-clusters";
const COLLAPSED_EVENT = "libstack:collapsed-changed";

export type LastOpened = { slug: string; openedAt: number };

function readLastOpened(): LastOpened | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_OPENED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.slug === "string" &&
      typeof parsed.openedAt === "number"
    ) {
      return parsed as LastOpened;
    }
    return null;
  } catch {
    return null;
  }
}

export function recordLastOpened(slug: string): void {
  if (typeof window === "undefined") return;
  const payload: LastOpened = { slug, openedAt: Date.now() };
  try {
    localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(LAST_OPENED_EVENT));
  } catch {
    // localStorage may be unavailable (private mode, quota) — fail silently
  }
}

export function useLastOpened(): LastOpened | null {
  const [value, setValue] = useState<LastOpened | null>(null);
  useEffect(() => {
    setValue(readLastOpened());
    const update = () => setValue(readLastOpened());
    window.addEventListener(LAST_OPENED_EVENT, update);
    window.addEventListener("storage", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.removeEventListener(LAST_OPENED_EVENT, update);
      window.removeEventListener("storage", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);
  return value;
}

// --- Cluster collapse state ---------------------------------------------------

function readCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function writeCollapsed(s: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...s]));
    window.dispatchEvent(new CustomEvent(COLLAPSED_EVENT));
  } catch {
    // ignore
  }
}

export function useClusterCollapsed(title: string): {
  collapsed: boolean;
  toggle: () => void;
} {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => setCollapsed(readCollapsed().has(title));
    sync();
    window.addEventListener(COLLAPSED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(COLLAPSED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [title]);

  function toggle() {
    const s = readCollapsed();
    if (s.has(title)) s.delete(title);
    else s.add(title);
    writeCollapsed(s);
    setCollapsed(s.has(title));
  }

  return { collapsed, toggle };
}
