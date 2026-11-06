import { describe, expect, it } from "vitest";
import type { MemoryNode } from "@supabrain/shared";
import { MemoryGraph } from "./graph";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
let seq = 0;
const node = (key: string, o: Partial<MemoryNode>): MemoryNode => ({
  key: key as `0x${string}`, text: key, kind: "fact", folder: "finance", trust: 2, agent: "lead-claude", vendor: "claude",
  seq: ++seq, createdAt: NOW - DAY, expiresAt: NOW + DAY, parents: [], roots: [], status: "active", ...o,
});

// The "bank details changed" fixture from docs/lanes/C-UI.md §5.
function fixture() {
  const g = new MemoryGraph(() => NOW);
  g.upsert(node("0xH1", { kind: "plan", trust: 3, agent: "owner", vendor: "human", roots: ["0xH1"], subject: "acme.demo.eth" }));
  g.upsert(node("0xH2", { kind: "decision", trust: 3, agent: "owner", vendor: "human", roots: ["0xH2"] }));
  g.upsert(node("0xR1", { kind: "ref", trust: 1, folder: "design", roots: ["github:demo/specs:brand.md@sha"] }));
  g.upsert(node("0xE1", { kind: "evidence", trust: 1, agent: "gem-research", vendor: "gemini", folder: "research", subject: "acme.demo.eth", address: "0x00000000000000000000000000000000000000ba", source: { type: "email", id: "email:acme-0611" }, roots: ["email:acme-0611"] }));
  g.upsert(node("0xM1", { kind: "address", trust: 1, agent: "gem-research", vendor: "gemini", folder: "research", subject: "acme.demo.eth", address: "0x00000000000000000000000000000000000000ba", parents: ["0xE1"], roots: ["email:acme-0611"] }));
  g.upsert(node("0xM2", { kind: "plan", trust: 1, parents: ["0xH1", "0xM1"], roots: ["0xH1", "email:acme-0611"] }));
  g.upsert(node("0xM3", { kind: "plan", trust: 1, agent: "gpt-writer", vendor: "openai", folder: "comms", parents: ["0xM2"], roots: ["0xH1", "email:acme-0611"] }));
  g.upsert(node("0xM4", { kind: "decision", trust: 2, parents: ["0xH2"], roots: ["0xH2"] }));
  g.upsert(node("0xE2", { kind: "evidence", trust: 1, source: { type: "email", id: "email:acme-0611" }, roots: ["email:acme-0611"] }));
  g.upsert(node("0xM5", { kind: "address", trust: 1, parents: ["0xE2"], roots: ["email:acme-0611"] }));
  return g;
}
const statuses = (g: MemoryGraph) => Object.fromEntries(g.all().map((n) => [n.key, n.status]));

describe("MemoryGraph quarantine (CLAUDE.md §7 rule 3)", () => {
  it("fixture invariant: revoking the email quarantines exactly E1 M1 M2 M3 E2 M5", () => {
    const g = fixture();
    expect(Object.values(statuses(g)).every((s) => s === "active")).toBe(true);
    g.applyRevocation({ type: "source", id: "email:acme-0611" });
    expect(statuses(g)).toEqual({
      "0xH1": "active", "0xH2": "active", "0xR1": "active", "0xM4": "active",
      "0xE1": "quarantined", "0xM1": "quarantined", "0xM2": "quarantined", "0xM3": "quarantined", "0xE2": "quarantined", "0xM5": "quarantined",
    });
  });

  it("explains why, naming the revoked source", () => {
    const g = fixture();
    g.applyRevocation({ type: "source", id: "email:acme-0611" });
    expect(g.why("0xM3")).toMatch(/email:acme-0611/);
    expect(g.why("0xH1")).toBeUndefined();
  });

  it("revoking a memory quarantines it and everything built on it, not its parents", () => {
    const g = fixture();
    g.applyRevocation({ type: "memory", id: "0xM1" });
    const s = statuses(g);
    expect([s["0xM1"], s["0xM2"], s["0xM3"]]).toEqual(["quarantined", "quarantined", "quarantined"]);
    expect([s["0xE1"], s["0xH1"], s["0xE2"], s["0xM5"]]).toEqual(["active", "active", "active", "active"]);
    expect(g.why("0xM3")).toMatch(/0xM1/);
  });

  it("revoking an agent quarantines what it wrote and what others built on it", () => {
    const g = fixture();
    g.applyRevocation({ type: "agent", id: "gem-research" });
    const s = statuses(g);
    expect([s["0xE1"], s["0xM1"], s["0xM2"], s["0xM3"]]).toEqual(["quarantined", "quarantined", "quarantined", "quarantined"]);
    expect([s["0xE2"], s["0xM5"], s["0xM4"]]).toEqual(["active", "active", "active"]);
    expect(g.why("0xE1")).toMatch(/gem-research/);
  });

  it("a kept child whose parent has expired is still caught by the roots in its own body", () => {
    const g = fixture();
    g.remove("0xE1");
    g.remove("0xM1");
    g.applyRevocation({ type: "source", id: "email:acme-0611" });
    expect(g.status("0xM2")).toBe("quarantined");
  });

  it("expired when past expiresAt; unknown keys read as expired (like FakeGraph)", () => {
    const g = fixture();
    g.upsert(node("0xOLD", { expiresAt: NOW - 1 }));
    expect(g.status("0xOLD")).toBe("expired");
    expect(g.status("0xNOPE")).toBe("expired");
  });
});

describe("MemoryGraph views", () => {
  it("implements GraphView for Lane B: get, byAddress, bySubject, ancestors", () => {
    const g = fixture();
    expect(g.get("0xM2")?.key).toBe("0xM2");
    expect(g.get("0xNOPE")).toBeUndefined();
    expect(g.memoriesByAddress("0x00000000000000000000000000000000000000BA").map((n) => n.key).sort()).toEqual(["0xE1", "0xM1"]);
    expect(g.memoriesBySubject("acme.demo.eth").map((n) => n.key).sort()).toEqual(["0xE1", "0xH1", "0xM1"]);
    expect(g.ancestors("0xM3").map((n) => n.key).sort()).toEqual(["0xE1", "0xH1", "0xM1", "0xM2"]);
  });

  it("returns quarantined nodes from GraphView with their status (payments must see them)", () => {
    const g = fixture();
    g.applyRevocation({ type: "source", id: "email:acme-0611" });
    expect(g.memoriesByAddress("0x00000000000000000000000000000000000000ba").every((n) => n.status === "quarantined")).toBe(true);
  });

  it("descendants and lineage paths to the roots", () => {
    const g = fixture();
    expect(g.descendants("0xE1").map((n) => n.key).sort()).toEqual(["0xM1", "0xM2", "0xM3"]);
    expect(g.lineagePaths("0xM3")).toEqual([["0xM3", "0xM2", "0xH1"], ["0xM3", "0xM2", "0xM1", "0xE1"]]);
    expect(g.lineagePaths("0xH2")).toEqual([["0xH2"]]);
  });

  it("serves nodes since a sequence number and tracks the next one", () => {
    const g = fixture();
    const max = Math.max(...g.all().map((n) => n.seq));
    expect(g.maxSeq()).toBe(max);
    expect(g.since(max - 2).map((n) => n.seq)).toEqual([max - 1, max]);
    expect(g.nextSeq()).toBe(max + 1);
  });

  it("counts by status", () => {
    const g = fixture();
    g.applyRevocation({ type: "source", id: "email:acme-0611" });
    expect(g.counts()).toMatchObject({ memories: 10, active: 4, quarantined: 6, expired: 0 });
  });
});
