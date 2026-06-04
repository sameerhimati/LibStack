/**
 * vault-bridge client — POST helpers, result classification, and the
 * offline write-queue flush. The worker contract lives in
 * workers/vault-bridge/src/index.ts.
 *
 * Classification drives retry policy:
 *   ok        200 — done
 *   transient 401 / 5xx / network — keep in queue, retry on reconnect
 *   terminal  400 / 404 / 409 / 413 — will never succeed; surface to user
 */

import {
  enqueue,
  getSetting,
  listPending,
  MAX_ATTEMPTS,
  moveToFailed,
  removePending,
  setSetting,
  updatePending,
  type Endpoint,
} from "./write-queue";

const SECRET_KEY = "secret";
const URL_KEY = "workerUrl";

// The worker URL is not a secret — only SHARED_SECRET is. Defaulting it means a
// fresh origin only needs the shared secret entered, instead of two fields. (We
// run on several aliased origins — see CanonicalRedirect — and per-origin
// IndexedDB doesn't carry config across them.)
export const DEFAULT_WORKER_URL = "https://vault-bridge.sameerhimati98.workers.dev";

export async function getSecret(): Promise<string | undefined> {
  return getSetting(SECRET_KEY);
}
export async function setSecret(v: string): Promise<void> {
  return setSetting(SECRET_KEY, v.trim());
}
export async function getWorkerUrl(): Promise<string> {
  return (await getSetting(URL_KEY)) || DEFAULT_WORKER_URL;
}
export async function setWorkerUrl(v: string): Promise<void> {
  return setSetting(URL_KEY, v.trim().replace(/\/$/, ""));
}
export async function isConfigured(): Promise<boolean> {
  // URL always resolves to a default now, so configuration = the secret.
  return Boolean(await getSecret());
}

type PostResult =
  | { kind: "ok"; data: unknown }
  | { kind: "unconfigured" }
  | { kind: "transient"; error: string }
  | { kind: "terminal"; status: number; error: string };

function classify(status: number, body: { error?: string } | null): PostResult {
  if (status >= 200 && status < 300) return { kind: "ok", data: body };
  const msg = body?.error || `HTTP ${status}`;
  // 401 = bad/absent secret — recoverable once the user fixes Settings.
  if (status === 401 || status >= 500) return { kind: "transient", error: msg };
  return { kind: "terminal", status, error: msg };
}

async function post(endpoint: Endpoint, payload: unknown): Promise<PostResult> {
  const [secret, base] = await Promise.all([getSecret(), getWorkerUrl()]);
  // No secret = never set up on this origin. Distinct from offline: queuing it
  // would silently pile up writes that can't succeed, so surface it instead.
  if (!secret) return { kind: "unconfigured" };
  try {
    const res = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-secret": secret },
      body: JSON.stringify(payload),
    });
    let body: { error?: string } | null = null;
    try {
      body = await res.json();
    } catch {
      /* empty/non-JSON body */
    }
    return classify(res.status, body);
  } catch (e) {
    return { kind: "transient", error: e instanceof Error ? e.message : "network error" };
  }
}

export type SendOutcome =
  | { status: "ok" }
  | { status: "queued" }
  | { status: "error"; message: string };

/**
 * Send now; on transient failure queue for later flush; on terminal failure
 * surface the error (no queue — it will never succeed).
 */
export async function sendOrQueue(endpoint: Endpoint, payload: unknown): Promise<SendOutcome> {
  const r = await post(endpoint, payload);
  if (r.kind === "ok") return { status: "ok" };
  if (r.kind === "unconfigured")
    return { status: "error", message: "Add your vault secret in Settings →" };
  if (r.kind === "terminal") return { status: "error", message: r.error };
  await enqueue(endpoint, payload);
  return { status: "queued" };
}

let flushing = false;

export interface FlushSummary {
  sent: number;
  failed: number;
  remaining: number;
}

/**
 * Drain pending writes oldest-first. Sequential (never concurrent). Stops at
 * the first transient failure so we don't hammer a down network — the next
 * `online` event or PWA open resumes. Entries past MAX_ATTEMPTS or hitting a
 * terminal 4xx move to failed_writes for manual review in Settings.
 */
export async function flushQueue(): Promise<FlushSummary> {
  if (flushing) return { sent: 0, failed: 0, remaining: (await listPending()).length };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const pending = await listPending();
    for (const entry of pending) {
      const r = await post(entry.endpoint, entry.payload);
      if (r.kind === "ok") {
        await removePending(entry.id);
        sent++;
        continue;
      }
      if (r.kind === "unconfigured") {
        // No secret yet — stop the drain without burning attempts. Resumes once
        // the secret is entered and the next flush trigger fires.
        break;
      }
      if (r.kind === "terminal") {
        await moveToFailed({ ...entry, lastError: r.error });
        failed++;
        continue;
      }
      // transient: bump attempt count, give up after MAX_ATTEMPTS, else
      // stop the drain and wait for the next reconnect trigger.
      const next = { ...entry, attempts: entry.attempts + 1, lastError: r.error };
      if (next.attempts >= MAX_ATTEMPTS) {
        await moveToFailed(next);
        failed++;
        continue;
      }
      await updatePending(next);
      break;
    }
  } finally {
    flushing = false;
  }
  const remaining = (await listPending()).length;
  return { sent, failed, remaining };
}
