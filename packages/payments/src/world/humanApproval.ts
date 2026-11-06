// World ID 4 human approval for one payment intent (World's Human-in-the-loop pattern, on IDKit core).
//
//   server signs rp_context for action `${prefix}:${intentHash}`  →  IDKit bridge request (QR / deep link)
//   → human approves in World App  →  we poll  →  proof checked locally (action, nonce, env, signal, credential)
//   → POST {verifyBaseUrl}/api/v4/verify/{rp_id}  →  nullifier consumed once  →  approved.
//
// Every intent gets its own action, so the nullifier is fresh per payment and an approval can't be reused for
// another payment. The signal is the intent hash too (belt and braces). Only a fully validated result is an
// approval; anything else is denied, expired, cancelled or failed, and nothing moves.
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import type { IdkitConfig } from "./config";

export type Hex32 = `0x${string}`;

export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export interface BridgeStatus {
  type: "waiting_for_connection" | "awaiting_confirmation" | "confirmed" | "failed" | string;
  result?: unknown;
  error?: string;
}

export interface BridgeRequest {
  readonly connectorURI: string;
  readonly requestId: string;
  pollOnce(options?: { signal?: AbortSignal }): Promise<BridgeStatus>;
}

export type CreateBridgeRequest = (args: {
  appId: `app_${string}`;
  action: string;
  rpContext: RpContext;
  environment: IdkitConfig["environment"];
  allowLegacyProofs: boolean;
  credentials: IdkitConfig["credentials"];
  signal: string;
  description?: string;
}) => Promise<BridgeRequest>;

export type RpSigner = (args: { action: string; ttlSec: number }) => {
  sig: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
};

/** One accepted proof per (action, nullifier). Back it with durable storage in production. */
export interface ReplayStore {
  /** Atomically records `key`; returns false if it was already recorded. */
  claim(key: string): boolean | Promise<boolean>;
}

export class InMemoryReplayStore implements ReplayStore {
  readonly #seen = new Set<string>();
  claim(key: string): boolean {
    if (this.#seen.has(key)) return false;
    this.#seen.add(key);
    return true;
  }
}

export interface HumanApprovalDeps {
  appId: `app_${string}`;
  rpId: string;
  cfg: IdkitConfig;
  sign: RpSigner;
  createRequest: CreateBridgeRequest;
  replay: ReplayStore;
  fetchFn?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  isRetryable?: (e: unknown) => boolean;
}

export interface PendingApproval {
  intentHash: Hex32;
  action: string;
  nonce: string;
  expectedSignalHash: string;
  connectorURI: string; // contains the bridge key: show only to the owner (dashboard / QR), never log it
  requestId: string;
  userCode: string; // short, human-readable reference for the approval card (not a secret)
  startedAtMs: number;
  expiresAtMs: number;
  request: BridgeRequest;
}

export type VerifyResult = { ok: true; credential: string; nullifier: string } | { ok: false; error: string };

export type HumanDecision =
  | { status: "approved"; credential: string; nullifier: string }
  | { status: "denied"; reason: string }
  | { status: "expired" }
  | { status: "cancelled" }
  | { status: "failed"; error: string };

const HEX32 = /^0x[0-9a-f]{64}$/;
const DENY_CODES = new Set(["user_rejected", "verification_rejected"]);

export function approvalAction(prefix: string, intentHash: Hex32): string {
  const h = intentHash.toLowerCase();
  if (!HEX32.test(h)) throw new Error(`approval needs a 32-byte 0x intent hash, got ${JSON.stringify(intentHash)}`);
  return `${prefix}:${h}`;
}

export async function startHumanApproval(
  deps: HumanApprovalDeps,
  input: { intentHash: Hex32; description?: string },
): Promise<PendingApproval> {
  const now = deps.now ?? Date.now;
  const action = approvalAction(deps.cfg.actionPrefix, input.intentHash);
  const intentHash = input.intentHash.toLowerCase() as Hex32;
  const startedAtMs = now();
  const s = deps.sign({ action, ttlSec: deps.cfg.rpSignatureTtlSec });
  const rpContext: RpContext = {
    rp_id: deps.rpId,
    nonce: s.nonce,
    created_at: s.createdAt,
    expires_at: s.expiresAt,
    signature: s.sig,
  };
  const request = await deps.createRequest({
    appId: deps.appId,
    action,
    rpContext,
    environment: deps.cfg.environment,
    allowLegacyProofs: deps.cfg.allowLegacyProofs,
    credentials: deps.cfg.credentials,
    signal: intentHash,
    description: input.description,
  });
  const ref = request.requestId.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8).padEnd(8, "0");
  return {
    intentHash,
    action,
    nonce: s.nonce,
    expectedSignalHash: hashSignal(intentHash),
    connectorURI: request.connectorURI,
    requestId: request.requestId,
    userCode: `${ref.slice(0, 4)}-${ref.slice(4)}`,
    startedAtMs,
    expiresAtMs: s.expiresAt * 1000,
    request,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function fieldEq(a: unknown, b: string): boolean {
  if (typeof a !== "string") return false;
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

/** Checks a World App result against this pending approval, then asks World's verify API. Fails closed. */
export async function verifyApprovalResult(
  deps: HumanApprovalDeps,
  p: PendingApproval,
  result: unknown,
): Promise<VerifyResult> {
  const fail = (error: string): VerifyResult => ({ ok: false, error });
  const now = deps.now ?? Date.now;
  if (now() > p.expiresAtMs) return fail("approval request expired");
  if (!isObj(result)) return fail("result is not an object");

  const legacy = result.protocol_version === "3.0";
  if (result.protocol_version !== "4.0" && !(legacy && deps.cfg.allowLegacyProofs)) {
    return fail(`protocol_version ${JSON.stringify(result.protocol_version)} not accepted`);
  }
  if (result.action !== p.action) return fail("action does not match this intent");
  if (result.nonce !== p.nonce) return fail("nonce does not match this request");
  if (result.environment !== deps.cfg.environment) return fail(`environment ${JSON.stringify(result.environment)} not accepted`);

  const responses = result.responses;
  if (!Array.isArray(responses) || responses.length === 0) return fail("no responses in result");
  const allowed = new Set<string>(deps.cfg.credentials);
  let nullifier: bigint | null = null;
  let credential = "";
  for (const r of responses) {
    if (!isObj(r)) return fail("malformed response item");
    if (typeof r.identifier !== "string" || !allowed.has(r.identifier)) {
      return fail(`credential ${JSON.stringify(r.identifier)} not accepted`);
    }
    if (!fieldEq(r.signal_hash, p.expectedSignalHash)) return fail("signal hash does not match this intent");
    if (nullifier === null) {
      try {
        nullifier = BigInt(String(r.nullifier));
      } catch {
        return fail("malformed nullifier");
      }
      credential = r.identifier;
    }
  }
  if (nullifier === null) return fail("no nullifier in result");

  const fetchFn = deps.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(`${deps.cfg.verifyBaseUrl}/api/v4/verify/${deps.rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result), // forwarded as-is
    });
  } catch (e) {
    return fail(`verify request failed: ${(e as Error).message}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const code = isObj(body) ? String(body.code ?? body.error ?? "") : "";
    return fail(`World verify returned ${res.status} ${code}`.trim());
  }
  if (!isObj(body) || body.success !== true) return fail("World verify did not report success");
  if (body.environment !== undefined && body.environment !== deps.cfg.environment) {
    return fail(`World verify reported environment ${JSON.stringify(body.environment)}`);
  }
  if (body.action !== undefined && body.action !== p.action) return fail("World verify reported another action");

  const hex = nullifier.toString(16);
  if (!(await deps.replay.claim(`${p.action}:${hex}`))) return fail("proof already used for this intent");
  return { ok: true, credential, nullifier: hex };
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

/** Polls the bridge until the human answers, the request expires, or the app cancels. */
export async function waitForHumanApproval(
  deps: HumanApprovalDeps,
  p: PendingApproval,
  opts: { signal?: AbortSignal } = {},
): Promise<HumanDecision> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const isRetryable = deps.isRetryable ?? (() => false);
  const { signal } = opts;

  for (;;) {
    if (signal?.aborted) return { status: "cancelled" };
    if (now() >= p.expiresAtMs) return { status: "expired" };
    await sleep(deps.cfg.pollIntervalMs, signal);
    if (signal?.aborted) return { status: "cancelled" };
    if (now() >= p.expiresAtMs) return { status: "expired" };

    let s: BridgeStatus;
    try {
      s = await p.request.pollOnce({ signal });
    } catch (e) {
      if (signal?.aborted) return { status: "cancelled" };
      if (isRetryable(e)) continue;
      return { status: "failed", error: `bridge poll failed: ${(e as Error).message}` };
    }

    if (s.type === "waiting_for_connection" || s.type === "awaiting_confirmation") continue;
    if (s.type === "confirmed") {
      const v = await verifyApprovalResult(deps, p, s.result);
      return v.ok
        ? { status: "approved", credential: v.credential, nullifier: v.nullifier }
        : { status: "failed", error: v.error };
    }
    if (s.type === "failed") {
      const code = s.error ?? "unknown";
      if (DENY_CODES.has(code)) return { status: "denied", reason: code };
      if (code === "timeout") return { status: "expired" };
      if (code === "cancelled") return { status: "cancelled" };
      return { status: "failed", error: code };
    }
    return { status: "failed", error: `unexpected bridge status ${JSON.stringify(s.type)}` };
  }
}
