// Agent bearer tokens (A-BRAIN S3): base64url("<label>|<exp>|<hmac>"), hmac = HMAC-SHA256(secret, "v1|<label>|<exp>").
// One token names one agent and expires. It authenticates the client to the server; what the agent may DO is still
// decided live by ENS on every call (the kill switch works even if a token leaks).
import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenCheck = { ok: true; label: string; exp: number } | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "unknown_agent" };

const LABEL = /^[a-z0-9-]{1,63}$/;
const MAX_TOKEN_CHARS = 512;

function assertSecret(secret: string) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("TOKEN_SIGNING_SECRET must be at least 32 characters");
}
const mac = (secret: string, label: string, exp: number) => createHmac("sha256", secret).update(`v1|${label}|${exp}`).digest("base64url");

export function issueAgentToken(p: { label: string; ttlSec: number; secret: string; now?: number }): string {
  assertSecret(p.secret);
  if (!LABEL.test(p.label)) throw new Error(`invalid agent label "${p.label}"`);
  if (!Number.isInteger(p.ttlSec) || p.ttlSec <= 0) throw new Error("token ttl must be a positive number of seconds");
  const exp = (p.now ?? Math.floor(Date.now() / 1000)) + p.ttlSec;
  return Buffer.from(`${p.label}|${exp}|${mac(p.secret, p.label, exp)}`).toString("base64url");
}

export function verifyAgentToken(token: string, p: { secret: string; knownLabels: readonly string[]; now?: number }): TokenCheck {
  assertSecret(p.secret);
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_CHARS || !/^[A-Za-z0-9_-]+$/.test(token)) return { ok: false, reason: "malformed" };
  const parts = Buffer.from(token, "base64url").toString("utf8").split("|");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [label, expRaw, sig] = parts as [string, string, string];
  if (!LABEL.test(label) || !/^\d{1,12}$/.test(expRaw) || sig.length === 0) return { ok: false, reason: "malformed" };
  const exp = Number(expRaw);
  const want = Buffer.from(mac(p.secret, label, exp));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "bad_signature" };
  if ((p.now ?? Math.floor(Date.now() / 1000)) > exp) return { ok: false, reason: "expired" };
  if (!p.knownLabels.includes(label)) return { ok: false, reason: "unknown_agent" };
  return { ok: true, label, exp };
}

/** Never log a path token. */
export function redactTokenPath(path: string): string {
  return path.replace(/^(\/mcp\/t\/)[^/?#]+/i, "$1***"); // case-insensitive: Express routes ignore case
}
