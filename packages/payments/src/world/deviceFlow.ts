// OAuth 2.0 Device Authorization Grant (RFC 8628) against World ID, client_secret_basic.
// The approval is never inferred from anything client-side: only a validated id_token from the token endpoint counts.
import { z } from "zod";
import { DEVICE_GRANT, type Discovery } from "./discovery";
import type { IdTokenClaims, IdTokenValidator } from "./idToken";

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

export interface DeviceHandle {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  intervalSec: number;
  startedAtMs: number;
  expiresAtMs: number;
}

export type PollResult =
  | { kind: "pending" }
  | { kind: "slow_down" }
  | { kind: "approved"; idToken: string }
  | { kind: "denied" }
  | { kind: "expired" }
  | { kind: "unavailable" }
  | { kind: "error"; error: string };

export type Decision =
  | { status: "approved"; claims: IdTokenClaims }
  | { status: "denied" | "expired" | "cancelled" }
  | { status: "failed"; error: string };

const DEFAULT_INTERVAL_SEC = 5; // RFC 8628 §3.2
const SLOW_DOWN_STEP_SEC = 5; // RFC 8628 §3.5

const DeviceAuthResponse = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  verification_uri_complete: z.string().url().optional(),
  expires_in: z.number().positive(),
  interval: z.number().positive().optional(),
});

function basicAuth({ clientId, clientSecret }: ClientCredentials): string {
  // RFC 6749 §2.3.1: form-urlencode id and secret before base64
  return `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`;
}

function formPost(creds: ClientCredentials, body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: {
      authorization: basicAuth(creds),
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  };
}

async function oauthError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown; error_description?: unknown };
    return typeof j.error === "string" ? j.error : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function startDeviceAuthorization(
  discovery: Discovery,
  creds: ClientCredentials,
  scope: string,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<DeviceHandle> {
  const res = await fetchFn(discovery.deviceAuthorizationEndpoint, formPost(creds, { scope }));
  if (!res.ok) throw new Error(`world device authorization failed: ${await oauthError(res)}`);
  const parsed = DeviceAuthResponse.safeParse(await res.json());
  if (!parsed.success) throw new Error("world device authorization: unexpected response shape");
  const d = parsed.data;
  const startedAtMs = now();
  return {
    deviceCode: d.device_code,
    userCode: d.user_code,
    verificationUri: d.verification_uri,
    verificationUriComplete: d.verification_uri_complete,
    intervalSec: d.interval ?? DEFAULT_INTERVAL_SEC,
    startedAtMs,
    expiresAtMs: startedAtMs + d.expires_in * 1000,
  };
}

export async function pollOnce(
  discovery: Discovery,
  creds: ClientCredentials,
  handle: DeviceHandle,
  fetchFn: typeof fetch = fetch,
): Promise<PollResult> {
  let res: Response;
  try {
    res = await fetchFn(discovery.tokenEndpoint, formPost(creds, { grant_type: DEVICE_GRANT, device_code: handle.deviceCode }));
  } catch (e) {
    return { kind: "unavailable" }; // network blip: keep waiting, never approve
  }
  if (res.status === 503) return { kind: "unavailable" };
  if (res.status === 429) return { kind: "error", error: "rate_limited" };
  if (res.ok) {
    const j = (await res.json().catch(() => ({}))) as { id_token?: unknown };
    if (typeof j.id_token !== "string" || !j.id_token) return { kind: "error", error: "no id_token in token response" };
    return { kind: "approved", idToken: j.id_token };
  }
  const error = await oauthError(res);
  switch (error) {
    case "authorization_pending":
      return { kind: "pending" };
    case "slow_down":
      return { kind: "slow_down" };
    case "access_denied":
      return { kind: "denied" };
    case "expired_token":
      return { kind: "expired" };
    default:
      return { kind: "error", error };
  }
}

export interface WaitOptions {
  discovery: Discovery;
  creds: ClientCredentials;
  handle: DeviceHandle;
  validator: IdTokenValidator;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  /** cap for the polling interval after repeated slow_down (from config) */
  maxIntervalSec?: number;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

/** Poll until World answers, the code expires, or the app cancels. Only a validated id_token is an approval. */
export async function waitForDecision(o: WaitOptions): Promise<Decision> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? defaultSleep;
  let intervalSec = o.handle.intervalSec;

  for (;;) {
    // RFC 8628 §3.4/3.5: wait `interval` before every poll, including the first one.
    await sleep(intervalSec * 1000, o.signal);
    if (o.signal?.aborted) return { status: "cancelled" };
    if (now() >= o.handle.expiresAtMs) return { status: "expired" };

    const r = await pollOnce(o.discovery, o.creds, o.handle, o.fetchFn);
    if (o.signal?.aborted) return { status: "cancelled" };

    switch (r.kind) {
      case "approved":
        try {
          const claims = await o.validator.validate(r.idToken, { startedAtSec: Math.floor(o.handle.startedAtMs / 1000) });
          return { status: "approved", claims };
        } catch (e) {
          return { status: "failed", error: `id_token rejected: ${(e as Error).message}` };
        }
      case "denied":
        return { status: "denied" };
      case "expired":
        return { status: "expired" };
      case "error":
        return { status: "failed", error: r.error };
      case "slow_down":
        intervalSec += SLOW_DOWN_STEP_SEC;
        if (o.maxIntervalSec) intervalSec = Math.min(intervalSec, o.maxIntervalSec);
        break;
      case "pending":
      case "unavailable":
        break;
    }
  }
}
