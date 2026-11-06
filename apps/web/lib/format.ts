// Display helpers. Every status gets words, never colour alone (FRONTEND_V2.md §7).
import type { BlockedEntry, Vendor } from "@supabrain/shared";

export const VENDOR: Record<Vendor, { letter: string; name: string; company: string; cls: string }> = {
  claude: { letter: "C", name: "Claude", company: "Anthropic", cls: "v-claude" },
  gemini: { letter: "G", name: "Gemini", company: "Google", cls: "v-gemini" },
  openai: { letter: "O", name: "OpenAI", company: "OpenAI", cls: "v-openai" },
  human: { letter: "H", name: "Owner", company: "Person", cls: "v-human" },
};
export const vendorOf = (v: string | undefined) => VENDOR[(v as Vendor) in VENDOR ? (v as Vendor) : "human"];

export const short = (s: string | undefined | null, head = 6, tail = 4) => {
  if (!s) return "";
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
};

export function ago(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export function until(ms: number, now = Date.now()) {
  let s = Math.round((ms - now) / 1000);
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const isToday = (ms: number) => new Date(ms).toDateString() === new Date().toDateString();

/** The rule kinds the injection guard reports (apps/server/src/engine/guard.ts), in plain words. */
export const GUARD_RULES: Record<string, string> = {
  "instruction-override": "Tries to override the next AI's instructions",
  "remote-code": "Pipes a remote script into a shell",
  "payment-redirect": "Redirects money to an address",
  "secret-exfiltration": "Asks for secrets (keys, .env, tokens)",
  "rule-tampering": "Tries to rewrite an AI's own ENS rules",
  "agent-to-agent-command": "Orders another AI to act",
};
/** What each content check forbids, as the rulebook says it ("may not pass on …"). */
export const GUARD_PLAIN: Record<string, string> = {
  "instruction-override": "poisoned instructions (“ignore all previous instructions…”)",
  "remote-code": "remote install scripts (curl … | sh)",
  "payment-redirect": "money redirected to an address",
  "secret-exfiltration": "requests for keys, .env files or tokens",
  "rule-tampering": "attempts to change its own ENS rules",
  "agent-to-agent-command": "orders to another AI (“tell Claude to…”)",
};
export const GUARD_IDS = Object.keys(GUARD_PLAIN);
/** sb.guard as the server reads it: absent / "*" → every check; "none" → none; a list → those. */
export function guardList(raw?: string | null): string[] {
  if (!raw || raw.trim() === "*") return GUARD_IDS;
  if (raw.trim() === "none") return [];
  const l = raw.split(",").map((x) => x.trim()).filter(Boolean);
  return l.every((x) => GUARD_IDS.includes(x)) ? l : GUARD_IDS;
}
export const denyList = (raw?: string | null) => (!raw || raw.trim() === "none" ? [] : raw.split(",").map((x) => x.trim()).filter(Boolean));
export const ENS_RULES = ["sb.status", "sb.scope", "sb.deny", "sb.guard", "sb.write.daily", "sb.role"];

export type Klass = "stopped" | "ens" | "identity" | "refused" | "saved";
/** Counting rules from docs/FRONTEND_CONTENT.md §6. */
export function classOf(b: Pick<BlockedEntry, "code" | "rule">): Klass {
  if (b.code === "STOPPED") return "stopped";
  if (b.code === "SCOPE" || b.code === "DENIED" || b.code === "RATE_LIMIT" || (b.code === "NOT_AUTHORIZED" && b.rule === "sb.status")) return "ens";
  if (b.code === "KEY_MISMATCH" || b.code === "AUTHORITY_UNKNOWN" || b.code === "NOT_AUTHORIZED") return "identity";
  return "refused";
}

/** The label for one refusal or stop, from FRONTEND_V2.md §5.3. */
export function blockLabel(code: string, rule?: string): string {
  switch (code) {
    case "STOPPED": return `STOPPED · sb.guard${rule ? ` · ${rule}` : ""}`;
    case "SCOPE": return "BLOCKED BY ENS · sb.scope";
    case "DENIED": return "BLOCKED BY ENS · sb.deny";
    case "RATE_LIMIT": return "BLOCKED BY ENS · sb.write.daily";
    case "NOT_AUTHORIZED":
      if (rule === "sb.status") return "BLOCKED BY ENS · PAUSED";
      if (rule === "revoked") return "BLOCKED · REVOKED";
      return `BLOCKED BY ENS · ${rule ?? "NOT AUTHORIZED"}`;
    case "KEY_MISMATCH": return "BLOCKED · KEY ≠ ENS";
    case "AUTHORITY_UNKNOWN": return "AUTHORITY UNKNOWN";
    case "INVALID": return "REFUSED BEFORE WRITING";
    default: return `${code}${rule ? ` · ${rule}` : ""}`;
  }
}

export const agentStatusLabel = (status: string, authority?: string) =>
  authority === "unavailable" || status === "unknown" ? "AUTHORITY UNKNOWN" : status.toUpperCase();
export const agentStatusTone = (status: string, authority?: string) =>
  authority === "unavailable" || status === "unknown" ? "warn" : status === "active" ? "ok" : "bad";
