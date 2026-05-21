/**
 * IndexedDB-backed write queue + settings store for the vault-bridge round-trip.
 *
 * Three object stores in the `libstack` DB:
 *   - settings        one-time shared secret + worker URL (durable on iOS)
 *   - pending_writes  POSTs awaiting a successful send
 *   - failed_writes   POSTs that exhausted retries or hit a terminal 4xx
 *
 * All functions are client-only. They reject if called without IndexedDB
 * (SSR / static prerender) so callers must guard with a mounted effect.
 */

const DB_NAME = "libstack";
const DB_VERSION = 1;
const SETTINGS = "settings";
const PENDING = "pending_writes";
const FAILED = "failed_writes";

export const MAX_ATTEMPTS = 5;

export type Endpoint = "/api/notes" | "/api/mark-read" | "/api/unmark-read" | "/api/highlights";

export interface QueueEntry {
  id: string;
  endpoint: Endpoint;
  payload: unknown;
  attempts: number;
  queuedAt: number;
  lastError?: string;
}

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

// crypto.randomUUID() is gated behind secure-context (HTTPS or localhost). On
// a LAN-IP dev server over plain HTTP it throws, which silently breaks the
// queue. This fallback uses non-cryptographic random — fine for queue IDs.
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* secure-context gate failed — fall through */
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIDB()) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(PENDING)) db.createObjectStore(PENDING, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FAILED)) db.createObjectStore(FAILED, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

// ── settings ───────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | undefined> {
  if (!hasIDB()) return undefined;
  const row = await tx<{ key: string; value: string } | undefined>(
    SETTINGS,
    "readonly",
    (s) => s.get(key),
  );
  return row?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await tx(SETTINGS, "readwrite", (s) => s.put({ key, value }));
}

// ── queue ──────────────────────────────────────────────────────────────────

export async function enqueue(endpoint: Endpoint, payload: unknown): Promise<QueueEntry> {
  const entry: QueueEntry = {
    id: randomId(),
    endpoint,
    payload,
    attempts: 0,
    queuedAt: Date.now(),
  };
  await tx(PENDING, "readwrite", (s) => s.put(entry));
  return entry;
}

export async function listPending(): Promise<QueueEntry[]> {
  if (!hasIDB()) return [];
  const all = await tx<QueueEntry[]>(PENDING, "readonly", (s) => s.getAll());
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function listFailed(): Promise<QueueEntry[]> {
  if (!hasIDB()) return [];
  return tx<QueueEntry[]>(FAILED, "readonly", (s) => s.getAll());
}

export async function updatePending(entry: QueueEntry): Promise<void> {
  await tx(PENDING, "readwrite", (s) => s.put(entry));
}

export async function removePending(id: string): Promise<void> {
  await tx(PENDING, "readwrite", (s) => s.delete(id));
}

export async function moveToFailed(entry: QueueEntry): Promise<void> {
  await tx(PENDING, "readwrite", (s) => s.delete(entry.id));
  await tx(FAILED, "readwrite", (s) => s.put(entry));
}

export async function removeFailed(id: string): Promise<void> {
  await tx(FAILED, "readwrite", (s) => s.delete(id));
}

export async function clearFailed(): Promise<void> {
  await tx(FAILED, "readwrite", (s) => s.clear());
}

export async function pendingCount(): Promise<number> {
  if (!hasIDB()) return 0;
  return tx<number>(PENDING, "readonly", (s) => s.count());
}

/**
 * Remove any pending entry whose payload has the given clientId. Used when a
 * highlight is unhighlighted before the worker has flushed it — drops the
 * unsent write so the vault never sees an entry the user already removed.
 */
export async function removePendingByClientId(clientId: string): Promise<number> {
  if (!hasIDB()) return 0;
  const all = await listPending();
  const matching = all.filter(
    (e) => typeof e.payload === "object" && e.payload !== null && (e.payload as { clientId?: string }).clientId === clientId,
  );
  for (const e of matching) await removePending(e.id);
  return matching.length;
}
