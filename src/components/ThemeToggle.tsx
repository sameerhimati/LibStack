"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "libstack:theme";
const ORDER: Theme[] = ["system", "light", "dark"];

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Apply a theme to <html>: toggle the .dark class (which all dark styling keys
// off) and set color-scheme so native UI (scrollbars, form controls) matches.
// Kept in sync with the inline no-FOUC script in layout.tsx.
function apply(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
}

function read(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

const META: Record<Theme, { label: string; icon: JSX.Element }> = {
  system: {
    label: "System",
    icon: (
      <path d="M3 4.5h10v6H3zM6 13h4M8 10.5V13" />
    ),
  },
  light: {
    label: "Light",
    icon: (
      <>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
      </>
    ),
  },
  dark: {
    label: "Dark",
    icon: <path d="M13 9.3A5.5 5.5 0 1 1 6.7 3a4.4 4.4 0 0 0 6.3 6.3Z" />,
  },
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  // Sync state from storage on mount (the inline script already applied it to
  // the DOM, so no flash here — this just lights up the right label).
  useEffect(() => {
    setTheme(read());
  }, []);

  // When in "system" mode, follow live OS changes.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  const meta = META[theme];
  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${meta.label}. Tap to change.`}
      title={`Theme: ${meta.label}`}
      className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {meta.icon}
      </svg>
      <span>{meta.label}</span>
    </button>
  );
}
