"use client";

import { useEffect, useRef, useState } from "react";
import { sendOrQueue } from "@/lib/vault-bridge";
import { dropOrphanHighlights, pendingCount, randomId, removePendingByClientId } from "@/lib/write-queue";
import { markReadLocally, unmarkReadLocally } from "@/lib/read-state";

type SaveState = "idle" | "saving" | "saved" | "queued" | "error";

// Trim leading/trailing whitespace from a Range. Long-press selections on iOS
// (and double/triple-click on desktop) frequently include trailing spaces or
// the trailing newline before the closing tag — without this the <mark>
// extends past the visible text.
function trimRangeWhitespace(range: Range): Range {
  const t = range.cloneRange();
  if (t.startContainer.nodeType === Node.TEXT_NODE) {
    const txt = t.startContainer.textContent ?? "";
    let off = t.startOffset;
    while (off < txt.length && /\s/.test(txt[off])) off++;
    if (off > t.startOffset) t.setStart(t.startContainer, off);
  }
  if (t.endContainer.nodeType === Node.TEXT_NODE) {
    const txt = t.endContainer.textContent ?? "";
    let off = t.endOffset;
    while (off > 0 && /\s/.test(txt[off - 1])) off--;
    if (off < t.endOffset) t.setEnd(t.endContainer, off);
  }
  return t;
}

// Wrap a Range with one <mark> per intersected text run, sharing one id. Going
// text-node by text-node (instead of surroundContents/extractContents on the
// whole range) is what keeps a cross-paragraph selection from producing a
// <mark> that swallows block <p> elements — or, when the drag grabs only the
// whitespace between blocks, a tall thin ghost bar. Blank runs are skipped, so
// neither artifact can form. Returns the first mark (the edit handler resolves
// the rest by id).
function applyMark(range: Range, id: string): HTMLElement | null {
  if (range.collapsed) return null;
  if (range.toString().trim().length === 0) return null;

  // Collect text nodes the range touches, in document order.
  const root = range.commonAncestorContainer;
  const textNodes: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) {
    textNodes.push(root as Text);
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (range.intersectsNode(n)) textNodes.push(n as Text);
    }
  }

  let first: HTMLElement | null = null;
  for (const node of textNodes) {
    const sub = document.createRange();
    sub.selectNodeContents(node);
    if (range.startContainer === node) sub.setStart(node, range.startOffset);
    if (range.endContainer === node) sub.setEnd(node, range.endOffset);
    // Skip blank runs (the inter-block whitespace that became ghost bars).
    if (sub.collapsed || sub.toString().trim().length === 0) continue;
    const mark = document.createElement("mark");
    mark.className = "libstack-highlight";
    mark.dataset.libstackId = id;
    try {
      sub.surroundContents(mark); // single text node → always safe
      if (!first) first = mark;
    } catch {
      // A boundary node that isn't cleanly wrappable — skip it rather than
      // risk a malformed mark.
    }
  }
  return first;
}

// Unwrap a <mark> in place: replace it with its children. The text reverts to
// its un-highlighted form; downstream parents stay intact.
function unwrapMark(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  // Coalesce adjacent text nodes the unwrap created, so future selections
  // don't fragment at the old <mark> boundary.
  parent.normalize();
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

  const [selectionText, setSelectionText] = useState("");

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureQuote, setCaptureQuote] = useState("");
  const [captureComment, setCaptureComment] = useState("");
  const [captureSave, setCaptureSave] = useState<SaveState>("idle");
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Edit-existing-highlight state. editMark holds the clicked <mark> element so
  // we can unwrap it on remove; editId is its data-libstack-id (matches the
  // queue entry's payload.clientId).
  const [editMark, setEditMark] = useState<HTMLElement | null>(null);
  const [editId, setEditId] = useState<string>("");
  const [editQuote, setEditQuote] = useState("");

  const selectionRangeRef = useRef<Range | null>(null);
  const captureRangeRef = useRef<Range | null>(null);
  const captureIdRef = useRef<string>("");

  useEffect(() => {
    void pendingCount().then(setPending);
    const onSync = () => void pendingCount().then(setPending);
    window.addEventListener("libstack:sync", onSync);
    return () => window.removeEventListener("libstack:sync", onSync);
  }, []);

  // Clean up two kinds of cruft from before the whitespace guards landed:
  //   - ghost marks in the DOM (this session only — marks aren't persisted)
  //   - orphan queue entries in IndexedDB (persistent, sync to the vault
  //     once the worker endpoint ships if we don't drop them now)
  useEffect(() => {
    const prose = document.querySelector(".prose");
    if (prose) {
      const ghosts = Array.from(
        prose.querySelectorAll("mark.libstack-highlight"),
      ).filter((m) => (m.textContent ?? "").trim().length === 0) as HTMLElement[];
      for (const g of ghosts) {
        const id = g.dataset.libstackId;
        if (id) void removePendingByClientId(id);
        unwrapMark(g);
      }
    }
    void dropOrphanHighlights().then(() => pendingCount().then(setPending));
  }, []);

  // Track .prose selection — only mutate state when inside .prose so the value
  // survives opening the sheet (where another selection may briefly happen).
  // We also ignore selections that target an existing <mark> child, so tapping
  // an existing highlight doesn't double-up as a new selection.
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        if (document.activeElement?.closest(".prose")) {
          setSelectionText("");
          selectionRangeRef.current = null;
        }
        return;
      }
      const node = sel.anchorNode;
      const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
      if (!el?.closest(".prose")) return;
      const txt = sel.toString().trim();
      if (!txt) return;
      setSelectionText(txt);
      selectionRangeRef.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  // Click-on-mark → open edit/remove modal. Delegated on .prose so newly-added
  // marks pick up the handler without re-binding.
  useEffect(() => {
    const prose = document.querySelector(".prose");
    if (!prose) return;
    const onClick = (e: Event) => {
      const target = e.target as Element | null;
      const mark = target?.closest("mark.libstack-highlight") as HTMLElement | null;
      if (!mark) return;
      e.preventDefault();
      const id = mark.dataset.libstackId ?? "";
      setEditMark(mark);
      setEditId(id);
      // A highlight may be several adjacent <mark> fragments (it crossed an
      // inline/block boundary) — join them so the modal shows the whole quote.
      const fragments = id
        ? Array.from(prose.querySelectorAll(`mark.libstack-highlight[data-libstack-id="${id}"]`))
        : [mark];
      setEditQuote(fragments.map((f) => f.textContent ?? "").join(""));
    };
    prose.addEventListener("click", onClick);
    return () => prose.removeEventListener("click", onClick);
  }, []);

  // Close on Esc; lock scroll while any modal is open.
  useEffect(() => {
    const anyOpen = sheetOpen || captureOpen || editMark !== null;
    if (!anyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editMark) setEditMark(null);
      else if (captureOpen) setCaptureOpen(false);
      else setSheetOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sheetOpen, captureOpen, editMark]);

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
    // Trim whitespace inside the Range so the resulting <mark> hugs the text.
    const trimmed = selectionRangeRef.current
      ? trimRangeWhitespace(selectionRangeRef.current)
      : null;
    const trimmedText = (trimmed?.toString() ?? selectionText).trim();
    // Empty after trim — the selection was just whitespace between blocks.
    // Bail rather than open the modal on a dud quote.
    if (!trimmedText) {
      setSelectionText("");
      selectionRangeRef.current = null;
      return;
    }
    captureRangeRef.current = trimmed;
    captureIdRef.current = randomId();
    setCaptureQuote(trimmedText);
    setCaptureComment("");
    setCaptureSave("idle");
    setCaptureOpen(true);
    setSheetOpen(false);
    setTimeout(() => commentRef.current?.focus(), 30);
  }

  async function saveCapture() {
    if (!captureQuote.trim()) return;
    setCaptureSave("saving");
    try {
      const r = await sendOrQueue("/api/highlights", {
        clientId: captureIdRef.current,
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
        if (captureRangeRef.current) {
          applyMark(captureRangeRef.current, captureIdRef.current);
          window.getSelection()?.removeAllRanges();
          captureRangeRef.current = null;
        }
        setSelectionText("");
        selectionRangeRef.current = null;
        setTimeout(() => setCaptureOpen(false), 500);
      }
    } catch (e) {
      console.error("highlight save failed", e);
      setCaptureSave("error");
    }
  }

  async function removeHighlight() {
    if (!editMark) return;
    try {
      if (editId) await removePendingByClientId(editId);
    } catch (e) {
      console.error("queue removal failed", e);
    }
    // Unwrap every fragment of this highlight, not just the tapped one.
    const prose = document.querySelector(".prose");
    const fragments =
      editId && prose
        ? (Array.from(
            prose.querySelectorAll(`mark.libstack-highlight[data-libstack-id="${editId}"]`),
          ) as HTMLElement[])
        : [editMark];
    for (const f of fragments) unwrapMark(f);
    setEditMark(null);
    void pendingCount().then(setPending);
  }

  const captureMeta: Record<SaveState, { dot: string; label: string }> = {
    idle: { dot: "bg-muted/40", label: "" },
    saving: { dot: "bg-accent animate-pulse", label: "saving to vault…" },
    saved: { dot: "bg-emerald-600", label: "saved" },
    queued: { dot: "bg-amber-500", label: "queued — will sync on reconnect" },
    error: { dot: "bg-red-600", label: "save failed — see settings" },
  };

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
                  No highlights yet. Tap any highlight in the article to remove it.
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

      {/* Capture modal */}
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

      {/* Edit / remove existing highlight */}
      {editMark && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          aria-modal="true"
          role="dialog"
          aria-label="Edit highlight"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setEditMark(null)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border-t border-black/10 bg-paper shadow-2xl dark:border-white/10 dark:bg-[#15140f] sm:max-h-[80vh] sm:rounded-2xl sm:border"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="border-b border-black/10 px-5 py-3 dark:border-white/10">
              <h2 className="text-sm font-semibold tracking-tight">Highlight</h2>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <section>
                <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Quote</div>
                <blockquote className="rounded border-l-2 border-accent bg-accent/5 px-3 py-2 text-sm italic leading-relaxed">
                  {editQuote}
                </blockquote>
              </section>
              <p className="text-xs text-muted">
                Remove this highlight from the article. Editing the comment will land with phase 2 (vault round-trip).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/10 px-5 py-3 text-xs dark:border-white/10">
              <button
                type="button"
                onClick={() => setEditMark(null)}
                className="rounded border border-black/15 px-3 py-1.5 text-xs hover:border-accent hover:text-accent dark:border-white/15"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removeHighlight()}
                className="rounded border border-red-600/40 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-600 hover:text-paper dark:border-red-500/40 dark:text-red-400"
              >
                Remove highlight
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
