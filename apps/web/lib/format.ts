// Display helpers. Every status gets words, never colour alone (CLAUDE.md §2.4).
import type { PayReason, Vendor, Trust, PayDecision } from "@supabrain/shared";

export const VENDOR: Record<Vendor, { letter: string; name: string; company: string; cls: string }> = {
  claude: { letter: "C", name: "Claude", company: "Anthropic", cls: "v-claude" },
  gemini: { letter: "G", name: "Gemini", company: "Google", cls: "v-gemini" },
  openai: { letter: "O", name: "ChatGPT", company: "OpenAI", cls: "v-openai" },
  human: { letter: "H", name: "Person", company: "Your team", cls: "v-human" },
};
export const vendorOf = (v: string | undefined) => VENDOR[(v as Vendor) in VENDOR ? (v as Vendor) : "human"];

export const TRUST: Record<Trust, { word: string; long: string }> = {
  3: { word: "HUMAN", long: "Set by a person on the dashboard" },
  2: { word: "AGENT", long: "Written by an AI, built only on trusted notes" },
  1: { word: "EVIDENCE", long: "Rests on outside content (email, web, file)" },
};

export const short = (s: string | undefined, head = 6, tail = 4) => {
  if (!s) return "";
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
};
export const shortKey = (k: string) => short(k, 6, 4);

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
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const HARD = new Set(["ENS_MISMATCH", "QUARANTINED_LINEAGE", "PROTECTED_PAYEE", "AGENT_NOT_AUTHORIZED"]);
export const isHard = (r: PayReason) => HARD.has(r.code);
export const sortReasons = (rs: PayReason[]) => [...rs].sort((a, b) => Number(isHard(b)) - Number(isHard(a)));

export function reasonLabel(r: PayReason): string {
  switch (r.code) {
    case "ENS_MISMATCH": return "ENS MISMATCH";
    case "QUARANTINED_LINEAGE": return "RETRACTED SOURCE";
    case "PROTECTED_PAYEE": return "PROTECTED PAYEE";
    case "AGENT_NOT_AUTHORIZED": return "AGENT NOT ALLOWED";
    case "UNKNOWN_PAYEE": return "UNKNOWN PAYEE";
    case "OUTSIDE_CONTENT_PAYEE": return "OUTSIDE CONTENT";
    case "NEW_PAYEE": return "NEW PAYEE";
    case "OVER_CAP": return "OVER CAP";
    case "OVER_DAILY": return "OVER DAILY";
  }
}

export function reasonText(r: PayReason): string {
  switch (r.code) {
    case "ENS_MISMATCH": return `The address ${short(r.claimedAddress)} disagrees with ${r.ensName}'s own ENS record (${short(r.ensAddress)}).`;
    case "QUARANTINED_LINEAGE": return `This payee comes from retracted memory (${r.revoked.length} memor${r.revoked.length === 1 ? "y" : "ies"}).`;
    case "PROTECTED_PAYEE": return `${r.label} is a team-controlled address and can never be paid.`;
    case "AGENT_NOT_AUTHORIZED": return `Agent not allowed: ${r.detail}.`;
    case "UNKNOWN_PAYEE": return "No trusted record for this payee.";
    case "OUTSIDE_CONTENT_PAYEE": return `This address came from outside content (${r.sources.join(", ")}).`;
    case "NEW_PAYEE": return "First payment to this payee.";
    case "OVER_CAP": return `Over the per-payment cap (${r.amount} > ${r.cap} USDC, cap read live from ENS).`;
    case "OVER_DAILY": return `Over the daily limit (${r.spentToday} of ${r.daily} USDC spent today).`;
  }
}

export const DECISION_WORD: Record<PayDecision["status"], string> = {
  paid: "PAID", blocked: "BLOCKED", pending_human: "WAITING FOR A HUMAN", denied: "DENIED",
  expired: "EXPIRED", cancelled: "CANCELLED", failed: "FAILED",
};
export const decisionTone = (s: PayDecision["status"]) =>
  s === "paid" ? "ok" : s === "blocked" || s === "failed" ? "bad" : s === "pending_human" ? "warn" : "muted";

export const SOURCE_ICON: Record<string, string> = { email: "✉", web: "◍", file: "▤", tool: "⚙", chat: "✎", notion: "N", github: "⌥" };

/** Source id from a root string, e.g. "email:acme-0611". Human roots are memory keys (0x…). */
export const isSourceRoot = (r: string) => !r.startsWith("0x");
