"use client";

import { useEffect, useState } from "react";

const KEY = "libstack:read-slugs";
const EVENT = "libstack:read-changed";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(s: Set<string>): void {
  localStorage.setItem(KEY, JSON.stringify([...s]));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function markReadLocally(slug: string): void {
  if (typeof window === "undefined") return;
  const s = readSet();
  if (s.has(slug)) return;
  s.add(slug);
  writeSet(s);
}

export function unmarkReadLocally(slug: string): void {
  if (typeof window === "undefined") return;
  const s = readSet();
  if (!s.delete(slug)) return;
  writeSet(s);
}

/**
 * Drop entries that the server already considers read — keeps the local set
 * bounded once the vault rebuild propagates.
 */
export function reconcileLocalReadSet(serverReadSlugs: Iterable<string>): void {
  if (typeof window === "undefined") return;
  const local = readSet();
  const server = new Set(serverReadSlugs);
  let changed = false;
  for (const slug of local) {
    if (server.has(slug)) {
      local.delete(slug);
      changed = true;
    }
  }
  if (changed) writeSet(local);
}

export function useLocalReadSet(): Set<string> {
  const [s, setS] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setS(readSet());
    const update = () => setS(readSet());
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);
  return s;
}
