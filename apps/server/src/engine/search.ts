// Recall search (A-BRAIN S2 step 4): token overlap + a small recency bonus + folder filter. No embeddings.
import type { MemoryNode } from "@supabrain/shared";

const STOP = new Set(["a", "an", "the", "is", "are", "was", "were", "to", "of", "in", "on", "for", "and", "or", "by", "it", "its", "be", "at", "as", "with", "what", "who", "how", "our", "we", "do", "does", "this", "that", "their", "per"]);

export function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9@._:-]+/).map((t) => t.replace(/^[._:-]+|[._:-]+$/g, "")).filter((t) => t.length >= 2 && !STOP.has(t));
}

function haystack(n: MemoryNode): Set<string> {
  return new Set(tokens([n.text, n.kind, n.folder, n.subject ?? "", n.address ?? "", n.key, n.source?.id ?? "", n.ref?.label ?? ""].join(" ")));
}

export function searchMemories(nodes: MemoryNode[], query: string, o: { folder?: string; limit?: number }): MemoryNode[] {
  const limit = Math.max(1, Math.min(o.limit ?? 8, 25));
  const live = nodes.filter((n) => n.status !== "expired" && (!o.folder || n.folder === o.folder || n.folder.startsWith(`${o.folder}/`)));
  const q = [...new Set(tokens(query))];
  const maxSeq = Math.max(1, ...live.map((n) => n.seq));
  const scored = live.map((n) => {
    const hay = haystack(n);
    const hits = q.filter((t) => hay.has(t) || [...hay].some((h) => h.startsWith(t) && t.length >= 4)).length;
    return { n, hits, score: hits + 0.25 * (n.seq / maxSeq) };
  });
  const matched = q.length === 0 ? scored : scored.filter((x) => x.hits > 0);
  return matched.sort((a, b) => b.score - a.score || b.n.seq - a.n.seq).slice(0, limit).map((x) => x.n);
}
