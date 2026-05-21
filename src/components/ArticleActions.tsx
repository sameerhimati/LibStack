"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendOrQueue } from "@/lib/vault-bridge";
import { pendingCount } from "@/lib/write-queue";
import { markReadLocally, unmarkReadLocally } from "@/lib/read-state";

type SaveState = "idle" | "saving" | "saved" | "queued" | "error";

// Capture the current selection text only when it lives inside a .prose body —
// avoids overwriting the captured value if the user later selects something
// inside the sheet (a label, a comment textarea, etc).
function selectionInsideProse(): string {
  if (typeof window === "undefined") return "";
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return "";
  const node = sel.anchorNode;
  if (!node) return "";
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el?.closest(".prose")) return "";
  return sel.toString().trim();
}

export default function ArticleActions({
  slug,
  title,
  url,
  mode,
  initialRead = false,
}: {
  slug: string;
  title: string;
  url: string;
  mode?: string;
  initialRead?: boolean;
}) {
  const [read, setRead] = useState(initialRead);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  // selectionText is the live mirror of the article body's selection. Updated
  // by a selectionchange listener; the captured quote (in the modal) snapshots
  // it at the moment the user taps "Add from selection," so any later
  // selection drift doesn't affect a save in flight.
  const [selectionText, setSelectionText] = useState("");

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureQuote, setCaptureQuote] = useState("");
  const [captureComment, setCaptureComment] = useState("");
  const [captureSave, setCaptureSave] = useState<SaveState>("idle");
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void pendingCount().then(setPending);
    const onSync = () => void pendingCount().then(setPending);
    window.addEventListener("libstack:sync", onSync);
    return () => window.removeEventListener("libstack:sync", onSync);
  }, []);

  // Track .prose selection. Only mutate state when inside .prose so the value
  // survives opening the sheet (where another selection may briefly happen).
  useEffect(() => {
    const onSel = () => {
      const txt = selectionInsideProse();
      if (txt) setSelectionText(txt);
      // When the selection collapses inside .prose, clear; outside .prose we
      // leave the prior value intact (preserves the user's capture intent).
      else if (document.activeElement?.closest(".prose")) setSelectionText("");
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  // Close on Esc; lock scroll while the sheet (or capture modal) is open.
  useEffect(() => {
    if (!sheetOpen && !captureOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (captureOpen) setCaptureOpen(false);
      else setSheetOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sheetOpen, captureOpen]);

  async function toggleRead() {
    if (read) {
      setRead(false);
      unmarkReadLocally(slug);
      setReadMsg(null);
      const r = await sendOrQueue("/api/unmark-read", { url });
      if (r.status === "ok") setReadMsg("unmarked — back in the feed shortly");
      else if (r.status === "queued") setReadMsg("offline — will sync on reconnect");
      else {
        setRead(true);
        markReadLocally(slug);
        setReadMsg(`couldn't unmark: ${r.message}`);
      }
    } else {
      setRead(true);
      markReadLocally(slug);
      setReadMsg(null);
      const r = await sendOrQueue("/api/mark-read", { url });
      if (r.status === "ok") setReadMsg("marked read — drops off the feed shortly");
      else if (r.status === "queued") setReadMsg("offline — will sync on reconnect");
      else {
        setRead(false);
        unmarkReadLocally(slug);
        setReadMsg(`couldn't mark read: ${r.message}`);
      }
    }
    void pendingCount().then(setPending);
  }

  function openCapture() {
    if (!selectionText) return;
    setCaptureQuote(selectionText);
    setCaptureComment("");
    setCaptureSave("idle");
    setCaptureOpen(true);
    setSheetOpen(false);
    // Defer focus so the modal is mounted before we focus its textarea.
    setTimeout(() => commentRef.current?.focus(), 30);
  }

  async function saveCapture() {
    if (!captureQuote.trim()) return;
    setCaptureSave("saving");
    const r = await sendOrQueue("/api/highlights", {
      slug,
      title,
      url,
      mode,
      quote: captureQuote,
      comment: captureComment.trim() || undefined,
    });
    if (r.status === "ok") setCaptureSave("saved");
    else if (r.status === "queued") setCaptureSave("queued");
    else setCaptureSave("error");
    void pendingCount().then(setPending);
    if (r.status === "ok" || r.status === "queued") {
      setTimeout(() => setCaptureOpen(false), 500);
    }
  }

  const captureMeta: Record<SaveState, { dot: string; label: string }> = {
    idle: { dot: "bg-muted/40", label: "" },
    saving: { dot: "bg-accent animate-pulse", label: "saving to vault…" },
    saved: { dot: "bg-emerald-600", label: "saved" },
    queued: { dot: "bg-amber-500", label: "queued — will sync on reconnect" },
    error: { dot: "bg-red-600", label: "save failed — see settings" },
  };

  // Phase 1: existing-highlights list is empty (no build-time parsing yet).
  // The pill badge stays unrendered for now.
  const highlightCount = 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={toggleRead}
          className="rounded border border-black/15 px-3 py-1.5 text-sm hover:border-accent hover:text-accent dark:border-white/15"
        >
          {read ? "Unmark read" : "Mark read"}
        </button>
        <span className="truncate text-xs text-muted">
          {readMsg ?? (pending > 0 ? `pending sync (${pending})` : "")}
        </span>
      </div>

      {/* Floating highlights pill */}
      <button
        onClick={() => setSheetOpen(true)}
        aria-label={highlightCount > 0 ? `Highlights (${highlightCount})` : "Highlights"}
        className="fixed right-4 z-30 inline-flex items-center gap-2 rounded-full border border-black/10 bg-paper/95 px-4 py-2.5 text-sm font-medium text-ink shadow-lg shadow-black/10 backdrop-blur hover:border-accent hover:text-accent dark:border-white/15 dark:bg-[#15140f]/95 dark:text-[#ece8df] dark:shadow-black/40"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3v10l3-2 3 2 3-2 3 2V3" />
        </svg>
        <span>Highlights</span>
        {highlightCount > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold leading-none text-paper">
            {highlightCount}
          </span>
        )}
        {selectionText && (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" title="text selected" />
        )}
      </button>

      {/* Sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center"
          aria-modal="true"
          role="dialog"
          aria-label="Highlights"
        >
          <button
            type="button"
            aria-label="Close highlights"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border-t border-black/10 bg-paper shadow-2xl dark:border-white/10 dark:bg-[#15140f] sm:max-h-[80vh] sm:rounded-2xl sm:border"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-3 dark:border-white/10">
              <div className="flex items-center gap-3">
                <span className="hidden h-1 w-10 rounded-full bg-black/15 sm:block dark:bg-white/15" />
                <h2 className="text-sm font-semibold tracking-tight">Highlights</h2>
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-muted hover:text-accent"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 4l10 10M14 4L4 14" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <section className="mb-5">
                <button
                  type="button"
                  disabled={!selectionText}
                  onClick={openCapture}
                  className="flex w-full items-center justify-between gap-3 rounded border border-black/15 px-4 py-3 text-left text-sm font-medium hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none">+</span>
                    <span>Add from selection</span>
                  </span>
                  {selectionText && (
                    <span className="truncate text-xs text-muted">
                      {selectionText.length > 60
                        ? `“${selectionText.slice(0, 60)}…”`
                        : `“${selectionText}”`}
                    </span>
                  )}
                </button>
                {!selectionText && (
                  <p className="mt-2 text-xs text-muted">
                    Long-press text in the article to select, then come back here.
                  </p>
                )}
              </section>

              <section>
                <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">
                  Saved highlights
                </div>
                <p className="text-sm text-muted">
                  No highlights yet. Captures save to the vault and show up here next build.
                </p>
              </section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-black/10 px-5 py-3 text-xs dark:border-white/10">
              <span className="truncate text-muted">
                {pending > 0 ? `${pending} pending sync` : "synced"}
              </span>
              <button
                onClick={toggleRead}
                className="shrink-0 rounded border border-black/15 px-2.5 py-1 text-xs hover:border-accent hover:text-accent dark:border-white/15"
              >
                {read ? "Unmark read" : "Mark read"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capture modal — sits above the sheet, snapshots the selection on open */}
      {captureOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          aria-modal="true"
          role="dialog"
          aria-label="New highlight"
        >
          <button
            type="button"
            aria-label="Cancel highlight"
            onClick={() => setCaptureOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border-t border-black/10 bg-paper shadow-2xl dark:border-white/10 dark:bg-[#15140f] sm:max-h-[80vh] sm:rounded-2xl sm:border"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="border-b border-black/10 px-5 py-3 dark:border-white/10">
              <h2 className="text-sm font-semibold tracking-tight">New highlight</h2>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <section>
                <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Quote</div>
                <blockquote className="rounded border-l-2 border-accent bg-accent/5 px-3 py-2 text-sm italic leading-relaxed">
                  {captureQuote}
                </blockquote>
              </section>

              <section>
                <label
                  htmlFor={`highlight-comment-${slug}`}
                  className="mb-2 block text-[11px] uppercase tracking-wider text-muted"
                >
                  Comment (optional)
                </label>
                <textarea
                  id={`highlight-comment-${slug}`}
                  ref={commentRef}
                  value={captureComment}
                  onChange={(e) => setCaptureComment(e.target.value)}
                  rows={4}
                  placeholder="Why this quote? (optional)"
                  className="block w-full rounded border border-black/15 bg-transparent p-3 leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-white/15"
                  style={{ fontSize: 16 }}
                />
              </section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-black/10 px-5 py-3 text-xs dark:border-white/10">
              <div className="flex items-center gap-2 text-muted">
                <span className={`inline-block h-2 w-2 rounded-full ${captureMeta[captureSave].dot}`} aria-hidden="true" />
                <span className="truncate">{captureMeta[captureSave].label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCaptureOpen(false)}
                  className="rounded border border-black/15 px-3 py-1.5 text-xs hover:border-accent hover:text-accent dark:border-white/15"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveCapture()}
                  disabled={captureSave === "saving" || !captureQuote.trim()}
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-paper hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
