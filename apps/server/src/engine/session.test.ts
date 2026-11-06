import { describe, expect, it } from "vitest";
import type { MemoryNode } from "@supabrain/shared";
import { NoticeBox, ReadLog, ReadSets } from "./session";
import { searchMemories } from "./search";

describe("ReadSets (CLAUDE.md §7 rule 2)", () => {
  it("parents = the full read-set when there are no cites; reset after the write", () => {
    let now = 0;
    const r = new ReadSets(1800, () => now);
    r.add("gem-research", ["0xA", "0xB"]);
    expect(r.parentsFor("gem-research")).toEqual({ ok: true, parents: ["0xA", "0xB"] });
    r.reset("gem-research");
    expect(r.parentsFor("gem-research")).toEqual({ ok: true, parents: [] });
  });

  it("non-empty cites must all be in the read-set; otherwise a clear error naming them", () => {
    const r = new ReadSets(1800, () => 0);
    r.add("lead-claude", ["0xA", "0xB"]);
    expect(r.parentsFor("lead-claude", ["0xB"])).toEqual({ ok: true, parents: ["0xB"] });
    expect(r.parentsFor("lead-claude", ["0xB", "0xZ"])).toEqual({ ok: false, missing: ["0xZ"] });
  });

  it("read-sets are per agent and expire after the TTL", () => {
    let now = 0;
    const r = new ReadSets(60, () => now);
    r.add("lead-claude", ["0xA"]);
    expect(r.parentsFor("gem-research")).toEqual({ ok: true, parents: [] });
    now = 59_000;
    expect(r.parentsFor("lead-claude")).toEqual({ ok: true, parents: ["0xA"] });
    now = 61_000;
    expect(r.parentsFor("lead-claude")).toEqual({ ok: true, parents: [] });
  });

  it("purge removes revoked keys from every agent's read-set", () => {
    const r = new ReadSets(1800, () => 0);
    r.add("lead-claude", ["0xA", "0xB"]);
    r.add("gem-research", ["0xB"]);
    r.purge(["0xB"]);
    expect(r.parentsFor("lead-claude")).toEqual({ ok: true, parents: ["0xA"] });
    expect(r.parentsFor("gem-research")).toEqual({ ok: true, parents: [] });
  });

  it("cites are deduped and matched case-insensitively", () => {
    const r = new ReadSets(1800, () => 0);
    r.add("lead-claude", ["0xAB"]);
    expect(r.parentsFor("lead-claude", ["0xab", "0xAB"])).toEqual({ ok: true, parents: ["0xAB"] });
  });
});

describe("ReadLog", () => {
  it("records who read which memory and is never reset by a write", () => {
    const l = new ReadLog();
    l.record("lead-claude", ["0xA", "0xB"]);
    l.record("gem-research", ["0xB"]);
    expect(l.readers(["0xB"])).toEqual(["lead-claude", "gem-research"]);
    expect(l.readers(["0xA", "0xC"])).toEqual(["lead-claude"]);
  });
});

describe("NoticeBox", () => {
  it("keeps unread notices per agent until they are marked read", () => {
    const b = new NoticeBox();
    b.add("lead-claude", { revocation: "0xR", text: "email:acme-0611 was retracted", affected: ["0xM2"], at: 1 });
    expect(b.unread("lead-claude")).toHaveLength(1);
    expect(b.unread("lead-claude")).toHaveLength(1);
    expect(b.markRead("lead-claude")).toHaveLength(1);
    expect(b.unread("lead-claude")).toHaveLength(0);
  });
});

const NOW = 1_800_000_000_000;
let seq = 0;
const m = (key: string, text: string, o: Partial<MemoryNode> = {}): MemoryNode => ({
  key: key as `0x${string}`, text, kind: "fact", folder: "research", trust: 2, agent: "gem-research", vendor: "gemini",
  seq: ++seq, createdAt: NOW, expiresAt: NOW + 1, parents: [], roots: [], status: "active", ...o,
});

describe("searchMemories (token overlap + recency + folder, no embeddings)", () => {
  const nodes = [
    m("0x1", "Acme Studio payout wallet is 0x9F2 per their ENS name"),
    m("0x2", "Monthly tools budget is 10 USDC", { folder: "finance" }),
    m("0x3", "Acme changed their wallet by email", { status: "quarantined" }),
    m("0x4", "Logo invoice #12 from Acme Studio, 5 USDC", { folder: "finance" }),
    m("0x5", "Old note about acme", { status: "expired" }),
  ];

  it("ranks by shared words and never returns expired memories", () => {
    const keys = searchMemories(nodes, "acme wallet", {}).map((n) => n.key);
    expect(keys.slice(0, 2).sort()).toEqual(["0x1", "0x3"]);
    expect(keys).not.toContain("0x5");
    expect(keys).not.toContain("0x2");
  });

  it("keeps quarantined matches (the caller flags them)", () => {
    expect(searchMemories(nodes, "changed wallet email", {}).map((n) => n.key)[0]).toBe("0x3");
  });

  it("filters by folder (and sub-folders) and honours the limit", () => {
    expect(searchMemories(nodes, "usdc", { folder: "finance" }).map((n) => n.key).sort()).toEqual(["0x2", "0x4"]);
    expect(searchMemories(nodes, "acme", { limit: 1 })).toHaveLength(1);
  });

  it("an empty query returns the most recent live memories", () => {
    expect(searchMemories(nodes, "", { limit: 2 }).map((n) => n.key)).toEqual(["0x4", "0x3"]);
  });

  it("matches addresses and keys case-insensitively", () => {
    expect(searchMemories(nodes, "0x9f2", {}).map((n) => n.key)).toEqual(["0x1"]);
  });
});
