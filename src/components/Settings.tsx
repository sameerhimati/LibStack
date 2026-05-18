"use client";

import { useEffect, useState } from "react";
import {
  clearFailed,
  listFailed,
  removeFailed,
  type QueueEntry,
} from "@/lib/write-queue";
import {
  getSecret,
  getWorkerUrl,
  setSecret,
  setWorkerUrl,
} from "@/lib/vault-bridge";

export default function Settings() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [secret, setSecretInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<QueueEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    void (async () => {
      setUrl((await getWorkerUrl()) ?? "");
      setSecretInput((await getSecret()) ?? "");
      setFailed(await listFailed());
    })();
  }, [open]);

  async function save() {
    await setWorkerUrl(url);
    await setSecret(secret);
    setSaved(true);
  }

  async function dismissFailed() {
    await clearFailed();
    setFailed([]);
  }

  return (
    <>
      <button
        aria-label="Settings"
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:text-accent"
      >
        settings
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-lg bg-paper p-5 text-sm shadow-xl dark:bg-[#1d1c16]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Vault sync</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-accent"
              >
                close
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-muted">Worker URL</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://vault-bridge.<acct>.workers.dev"
                className="w-full rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-muted">Shared secret</span>
              <input
                value={secret}
                onChange={(e) => setSecretInput(e.target.value)}
                type="password"
                className="w-full rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>

            <button
              onClick={save}
              className="rounded bg-accent px-3 py-1.5 text-paper hover:opacity-90"
            >
              Save
            </button>
            {saved && <span className="ml-2 text-muted">saved — stored on device</span>}

            {failed.length > 0 && (
              <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">
                    Failed writes ({failed.length})
                  </span>
                  <button
                    onClick={dismissFailed}
                    className="text-muted hover:text-accent"
                  >
                    clear all
                  </button>
                </div>
                <ul className="space-y-1 text-xs text-muted">
                  {failed.map((f) => (
                    <li key={f.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {f.endpoint} · {f.lastError ?? "unknown error"}
                      </span>
                      <button
                        onClick={async () => {
                          await removeFailed(f.id);
                          setFailed(await listFailed());
                        }}
                        className="shrink-0 hover:text-accent"
                      >
                        dismiss
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
