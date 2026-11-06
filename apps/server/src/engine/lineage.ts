// Trust and lineage (CLAUDE.md §7 rules 1–2, A-BRAIN S2). Pure functions, no I/O.
import type { MemoryKind, MemoryNode, PrivateRef, SourceRef, Trust } from "@supabrain/shared";

/** Placeholder for "this memory's own key" in a human memory's roots; the store swaps in the real key. */
export const SELF_ROOT = "$self";
const MAX_STR_BYTES = 128; // an Arkiv indexed str (taint.root) holds at most 128 UTF-8 bytes
const SOURCE_TYPES = ["email", "web", "file", "tool", "chat", "notion", "github"] as const;

export interface LineageInput {
  kind: MemoryKind;
  author: "agent" | "human";
  parents: Pick<MemoryNode, "key" | "trust" | "roots">[];
  source?: SourceRef;
  ref?: PrivateRef;
}

const bytes = (s: string) => new TextEncoder().encode(s).length;
const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * - human (dashboard only): trust 3, roots = [itself]
 * - outside content (evidence, a ref pointer): trust 1, roots = [source or ref id] ∪ parents' roots
 * - agent: min(parents) capped at 2 (an agent can never produce 3), or 2 with no parents; roots = ∪ parents' roots
 */
export function computeLineage(i: LineageInput): { trust: Trust; roots: string[] } {
  if (i.author === "human") return { trust: 3, roots: [SELF_ROOT] };
  const parentRoots = i.parents.flatMap((p) => p.roots);
  if (i.kind === "evidence" && !i.source) throw new Error("evidence needs a source ({type, id}): where did this come from?");
  const outside = [...(i.source ? [i.source.id] : []), ...(i.ref ? [refRootId(i.ref)] : [])];
  if (outside.length > 0 || i.kind === "evidence" || i.kind === "ref") {
    return { trust: 1, roots: uniq([...outside, ...parentRoots]) };
  }
  const trust = i.parents.length === 0 ? 2 : (Math.min(2, ...i.parents.map((p) => p.trust)) as Trust);
  return { trust, roots: uniq(parentRoots) };
}

/** The root id a private pointer contributes, so revoking the pointer quarantines everything built on it. */
export function refRootId(ref: PrivateRef): string {
  const id = `${ref.kind}:${ref.locator}${ref.version ? `@${ref.version}` : ""}`;
  if (bytes(id) > MAX_STR_BYTES) throw new Error(`ref id is ${bytes(id)} bytes; keep locator + version under 128 bytes`);
  return id;
}

export function validateRef(ref: PrivateRef, allowedKinds: readonly string[]): void {
  if (!allowedKinds.includes(ref.kind)) throw new Error(`ref kind "${ref.kind}" is not allowed (allowed: ${allowedKinds.join(", ")})`);
  if (!ref.locator || ref.locator.length > 200) throw new Error("ref locator is required (≤ 200 chars)");
  if (!ref.label || ref.label.length > 80) throw new Error("ref label is required and must be ≤ 80 characters (a non-secret label, never the content)");
  if (ref.kind === "github") {
    if (!/^[\w.-]+\/[\w.-]+:.+$/.test(ref.locator)) throw new Error('github ref locator must be "owner/repo:path"');
    if (!ref.version || !/^[0-9a-f]{40}$/.test(ref.version)) throw new Error("github ref needs version = the 40-hex commit SHA it is pinned to");
  }
  refRootId(ref);
}

export function validateSource(s: SourceRef): void {
  if (!SOURCE_TYPES.includes(s.type)) throw new Error(`source type must be one of ${SOURCE_TYPES.join(", ")}`);
  if (!s.id) throw new Error("source id is required (e.g. email:<message-id>, web:<host/path>)");
  if (bytes(s.id) > MAX_STR_BYTES) throw new Error(`source id is ${bytes(s.id)} bytes; the limit is 128`);
}

export function validateFolder(folder: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/.test(folder) || folder.length > 64) {
    throw new Error(`folder "${folder}" must be lowercase words separated by "/" (≤ 64 chars), e.g. "research" or "research/acme"`);
  }
}

/** `sb.scope` from ENS: "*" (lead) writes anywhere; otherwise only that folder and its sub-folders. */
export function scopeAllows(scope: string, folder: string): boolean {
  if (scope === "*") return true;
  if (!scope) return false;
  return folder === scope || folder.startsWith(`${scope}/`);
}
