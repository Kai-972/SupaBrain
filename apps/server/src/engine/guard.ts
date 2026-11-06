// v2 Stop (docs/PLAN.md §2.1 step 6): catch content that tries to steer another AI before any other AI receives it.
// This is a prompt-injection tripwire for the hand-off between agents, not a full classifier: it looks for the
// shapes attacks take when they travel through shared memory (override instructions, run a remote script, move money
// to an address, leak secrets, rewrite your own ENS rules, command another agent). A hit is not refused: it is saved
// (signed by the AI that relayed it, so the owner sees exactly what arrived and from whom) and stopped at once.

export type InjectionRule =
  | "instruction-override"
  | "remote-code"
  | "payment-redirect"
  | "secret-exfiltration"
  | "rule-tampering"
  | "agent-to-agent-command";

const RULES: [InjectionRule, RegExp][] = [
  ["instruction-override", /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your|system)\b[^.\n]{0,25}\b(instructions?|rules?|prompts?|guidelines?)\b/i],
  ["remote-code", /\b(curl|wget)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z)?sh\b/i],
  ["remote-code", /\brm\s+-rf\s+(\/|~)(\s|$)|\bchmod\s+777\s+\/|\bbase64\s+-d\b[^\n|]{0,80}\|\s*(ba)?sh\b/i],
  ["payment-redirect", /\b(send|transfer|pay|wire|move)\b[^.\n]{0,60}\b(funds?|eth|usdc|usdt|tokens?|money|payment|invoice)\b[^.\n]{0,60}\b0x[0-9a-fA-F]{40}\b/i],
  ["secret-exfiltration", /\b(paste|send|share|post|leak|exfiltrate|print|reveal|upload|include)\b[^\n]{0,60}?(\bprivate keys?|\bseed phrase|\bmnemonic|\bapi[_ -]?keys?|\bsecrets?|\.env\b|\baccess tokens?|\bpasswords?)/i],
  ["rule-tampering", /\b(set|change|raise|update|edit|remove|disable)\b[^.\n]{0,30}\b(sb\.(scope|status|role|write\.daily|pay\.cap|pay\.daily)|ens (records?|rules?)|your (scope|limits?|caps?|rules?))\b/i],
  ["agent-to-agent-command", /\b(tell|instruct|ask|make|order)\b\s+(claude|gemini|chatgpt|codex|copilot|the other (ai|agent|model)s?)\b[^.\n]{0,40}\b(to\s+)?(ignore|run|execute|pay|send|transfer|delete|push|deploy|commit|reveal|disable)\b/i],
];

export interface InjectionHit {
  rule: InjectionRule;
  /** ≤ 160 characters around the match, for the owner's review notice. */
  excerpt: string;
}

export function scanInjection(text: string): InjectionHit | undefined {
  return scanInjectionAll(text)[0];
}

/** Every check that matches (at most one hit per check), in the order the checks are listed. */
export function scanInjectionAll(text: string): InjectionHit[] {
  const hits: InjectionHit[] = [];
  if (!text) return hits;
  for (const [rule, re] of RULES) {
    if (hits.some((h) => h.rule === rule)) continue;
    const m = re.exec(text);
    if (!m) continue;
    const start = Math.max(0, m.index - 40);
    const end = Math.min(text.length, m.index + m[0].length + 40);
    const excerpt = `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
    hits.push({ rule, excerpt: excerpt.length > 160 ? `${excerpt.slice(0, 159)}…` : excerpt });
  }
  return hits;
}
