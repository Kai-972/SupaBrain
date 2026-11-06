// Lane B finding (live run 2026-11-06): MemoryGraph.walk uses the start node's own `parents` array as its BFS queue
// (`const queue = next(start)`), so `ancestors(key)` drains that node's parents to [] in place. Every `pay` calls
// ancestors() through the GraphView, so lineage (edges, path, memory-target cascades) vanished after P1 until a restart.
// Fixed by Lane B on Srijit's instruction (QA cycle, 2026-11-06): the walk copies its queue, and every node the graph
// hands out carries its own parents/roots arrays, so no caller can change the live graph by mutating a returned node.
import type { MemoryNode } from "@supabrain/shared";
import { describe, expect, it } from "vitest";
import { MemoryGraph } from "./graph";

const node = (key: string, parents: string[]): MemoryNode => ({
  key: key as `0x${string}`, text: key, kind: "fact", folder: "f", trust: 2, agent: "lead-claude", vendor: "claude",
  seq: 0, createdAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, parents, roots: [], status: "active",
});

describe("MemoryGraph traversal is read-only", () => {
  it("ancestors() does not change any node's parents", () => {
    const g = new MemoryGraph();
    g.upsert(node("0xA", []));
    g.upsert(node("0xB", ["0xA"]));
    g.upsert(node("0xC", ["0xB"]));
    expect(g.ancestors("0xC").map((n) => n.key)).toEqual(["0xB", "0xA"]);
    expect(g.get("0xC")?.parents).toEqual(["0xB"]);
    expect(g.ancestors("0xC").map((n) => n.key)).toEqual(["0xB", "0xA"]); // a second walk still sees the lineage
  });

  it("nodes returned by get(), all() and ancestors() are copies: mutating them can't change the graph", () => {
    const g = new MemoryGraph();
    g.upsert({ ...node("0xA", []), roots: ["src:a"] });
    g.upsert({ ...node("0xB", ["0xA"]), roots: ["src:a"] });
    g.get("0xB")!.parents.push("0xEVIL");
    g.get("0xB")!.roots.length = 0;
    g.all().find((n) => n.key === "0xB")!.parents.length = 0;
    g.ancestors("0xB")[0]!.roots.push("src:evil");
    expect(g.get("0xB")?.parents).toEqual(["0xA"]);
    expect(g.get("0xB")?.roots).toEqual(["src:a"]);
    expect(g.get("0xA")?.roots).toEqual(["src:a"]);
    expect(g.lineagePaths("0xB")).toEqual([["0xB", "0xA"]]);
  });
});
