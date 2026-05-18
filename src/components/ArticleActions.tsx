"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendOrQueue } from "@/lib/vault-bridge";
import { pendingCount } from "@/lib/write-queue";

type SaveState = "idle" | "saving" | "saved" | "queued" | "error";

const AUTOSAVE_MS = 5000;

export default function ArticleActions({
  slug,
  title,
  url,
  mode,
}: {
  slug: string;
  title: string;
  url: string;
  mode?: string;
}) {
  const draftKey = `libstack:note:${slug}`;
  const [note, setNote] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [read, setRead] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setNote(localStorage.getItem(draftKey) ?? "");
    void pendingCount().then(setPending);
    const onSync = () => void pendingCount().then(setPending);
    window.addEventListener("libstack:sync", onSync);
    return () => window.removeEventListener("libstack:sync", onSync);
  }, [draftKey]);

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
    setReadMsg(null);
    const r = await sendOrQueue("/api/mark-read", { url });
    if (r.status === "ok") setReadMsg("marked read — drops off the feed shortly");
    else if (r.status === "queued") setReadMsg("offline — will sync on reconnect");
    else {
      setRead(false); // revert: the queue line didn't match (404/409)
      setReadMsg(`couldn't mark read: ${r.message}`);
    }
    void pendingCount().then(setPending);
  }

  const saveLabel: Record<SaveState, string> = {
    idle: note.trim() ? "unsaved" : "",
    saving: "saving…",
    saved: "saved to vault",
    queued: "pending sync",
    error: "sync error — see settings",
  };

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <button
          onClick={markRead}
          disabled={read}
          className="rounded bg-accent px-3 py-1.5 text-sm text-paper hover:opacity-90 disabled:opacity-50"
        >
          {read ? "✓ read" : "Mark read"}
        </button>
        <span className="text-xs text-muted">
          {pending > 0 ? `pending sync (${pending})` : saveLabel[save]}
        </span>
      </div>
      {readMsg && <p className="text-xs text-muted">{readMsg}</p>}
      <textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        onBlur={() => {
          clearTimeout(timer.current);
          void flushNote(note);
        }}
        placeholder="Notes — autosaves to the vault for /compile"
        rows={4}
        className="w-full resize-y rounded border border-black/15 bg-transparent p-2 text-sm dark:border-white/15"
      />
    </div>
  );
}
