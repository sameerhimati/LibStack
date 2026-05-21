"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendOrQueue } from "@/lib/vault-bridge";
import { pendingCount } from "@/lib/write-queue";
import { markReadLocally, unmarkReadLocally } from "@/lib/read-state";

type SaveState = "idle" | "saving" | "saved" | "queued" | "error";

const AUTOSAVE_MS = 5000;

export default function ArticleActions({
  slug,
  title,
  url,
  mode,
  existingNotes,
  existingNotesHtml,
}: {
  slug: string;
  title: string;
  url: string;
  mode?: string;
  existingNotes?: string;
  existingNotesHtml?: string;
}) {
  const draftKey = `libstack:note:${slug}`;
  const [note, setNote] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [read, setRead] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNote(localStorage.getItem(draftKey) ?? "");
    void pendingCount().then(setPending);
    const onSync = () => void pendingCount().then(setPending);
    window.addEventListener("libstack:sync", onSync);
    return () => window.removeEventListener("libstack:sync", onSync);
  }, [draftKey]);

  // Auto-expand the textarea to fit its content. Recomputed when the sheet
  // opens (so the initial height is right) and on every keystroke.
  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(() => {
    if (sheetOpen) autosize();
  }, [sheetOpen, note, autosize]);

  // Close on Esc; lock scroll while the sheet is open.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const flushNote = useCallback(
    async (body: string) => {
      if (!body.trim()) return;
      setSave("saving");
      const r = await sendOrQueue("/api/notes", { slug, title, url, mode, body });
      if (r.status === "ok") setSave("saved");
      else if (r.status === "queued") setSave("queued");
      else setSave("error");
      void pendingCount().then(setPending);
    },
    [slug, title, url, mode],
  );

  function onNoteChange(v: string) {
    setNote(v);
    localStorage.setItem(draftKey, v);
    setSave("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushNote(v), AUTOSAVE_MS);
  }

  async function markRead() {
    setRead(true); // optimistic
    markReadLocally(slug); // cluster index reflects immediately
    setReadMsg(null);
    const r = await sendOrQueue("/api/mark-read", { url });
    if (r.status === "ok") setReadMsg("marked read — drops off the feed shortly");
    else if (r.status === "queued") setReadMsg("offline — will sync on reconnect");
    else {
      setRead(false); // revert: the queue line didn't match (404/409)
      unmarkReadLocally(slug);
      setReadMsg(`couldn't mark read: ${r.message}`);
    }
    void pendingCount().then(setPending);
  }

  const hasExisting = Boolean(existingNotes && existingNotes.trim());
  // Rough "note count" for the pill badge: paragraph-ish chunks, capped.
  const existingCount = hasExisting
    ? Math.max(1, (existingNotes!.match(/\n\s*\n/g)?.length ?? 0) + 1)
    : 0;

  const saveStateMeta: Record<SaveState, { dot: string; label: string }> = {
    idle: { dot: "bg-muted/40", label: note.trim() ? "unsaved" : "no changes" },
    saving: { dot: "bg-accent animate-pulse", label: "saving to vault…" },
    saved: { dot: "bg-emerald-600", label: "saved to vault" },
    queued: { dot: "bg-amber-500", label: "queued — will sync on reconnect" },
    error: { dot: "bg-red-600", label: "sync error — see settings" },
  };
  const saveMeta = saveStateMeta[save];

  return (
    <>
      {/* Inline action row — sits above the article title, not sticky. */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={markRead}
          disabled={read}
          className="rounded border border-black/15 px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-50 dark:border-white/15"
        >
          {read ? "✓ read" : "Mark read"}
        </button>
        <span className="truncate text-xs text-muted">
          {readMsg ?? (pending > 0 ? `pending sync (${pending})` : "")}
        </span>
      </div>

      {/* Floating notes pill — bottom-right, safe-area aware. */}
      <button
        onClick={() => setSheetOpen(true)}
        aria-label={hasExisting ? `Notes (${existingCount})` : "Notes"}
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
          <path d="M3 2.5h7L13 5.5v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
          <path d="M9.5 2.5v3h3" />
          <path d="M5 8.5h6M5 11h4" />
        </svg>
        <span>Notes</span>
        {hasExisting && (
          <span className="rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold leading-none text-paper">
            {existingCount}
          </span>
        )}
        {!hasExisting && note.trim() && (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        )}
      </button>

      {/* Bottom sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center"
          aria-modal="true"
          role="dialog"
          aria-label="Notes"
        >
          <button
            type="button"
            aria-label="Close notes"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border-t border-black/10 bg-paper shadow-2xl dark:border-white/10 dark:bg-[#15140f] sm:max-h-[80vh] sm:rounded-2xl sm:border"
            style={{
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            {/* drag handle / header */}
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-3 dark:border-white/10">
              <div className="flex items-center gap-3">
                <span className="hidden h-1 w-10 rounded-full bg-black/15 sm:block dark:bg-white/15" />
                <h2 className="text-sm font-semibold tracking-tight">Notes</h2>
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-muted hover:text-accent"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 4l10 10M14 4L4 14" />
                </svg>
              </button>
            </div>

            {/* scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {hasExisting ? (
                <section className="mb-5">
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">
                    From the vault
                  </div>
                  <div
                    className="prose prose-sm prose-stone max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: existingNotesHtml ?? "" }}
                  />
                </section>
              ) : (
                <section className="mb-5">
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">
                    From the vault
                  </div>
                  <p className="text-sm text-muted">
                    No notes yet. Anything you write below will save to the vault and
                    show up here next build.
                  </p>
                </section>
              )}

              <section>
                <label
                  htmlFor={`note-${slug}`}
                  className="mb-2 block text-[11px] uppercase tracking-wider text-muted"
                >
                  New note
                </label>
                <textarea
                  id={`note-${slug}`}
                  ref={textareaRef}
                  value={note}
                  onChange={(e) => {
                    onNoteChange(e.target.value);
                    autosize();
                  }}
                  onBlur={() => {
                    clearTimeout(timer.current);
                    void flushNote(note);
                  }}
                  rows={6}
                  placeholder="Thoughts, quotes, questions — autosaves to the vault for /compile."
                  className="block w-full rounded border border-black/15 bg-transparent p-3 leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-white/15"
                  style={{ fontSize: 16 }}
                />
              </section>
            </div>

            {/* footer: save status + secondary mark-read */}
            <div className="flex items-center justify-between gap-3 border-t border-black/10 px-5 py-3 text-xs dark:border-white/10">
              <div className="flex items-center gap-2 text-muted">
                <span className={`inline-block h-2 w-2 rounded-full ${saveMeta.dot}`} aria-hidden="true" />
                <span className="truncate">
                  {pending > 0 ? `${saveMeta.label} · ${pending} pending` : saveMeta.label}
                </span>
              </div>
              <button
                onClick={markRead}
                disabled={read}
                className="shrink-0 rounded border border-black/15 px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50 dark:border-white/15"
              >
                {read ? "✓ read" : "Mark read"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
