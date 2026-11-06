import { describe, expect, it } from "vitest";
import { computeLineage, refRootId, scopeAllows, validateFolder, validateRef, validateSource } from "./lineage";

const p = (key: string, trust: 1 | 2 | 3, roots: string[]) => ({ key, trust, roots });
const SHA = "a".repeat(40);

describe("computeLineage (CLAUDE.md §7 rule 1)", () => {
  it.each([
    ["agent, no parents → trust 2, no roots", { kind: "fact", author: "agent", parents: [] }, 2, []],
    ["agent on a human memory → 2 (an agent can never reach 3)", { kind: "plan", author: "agent", parents: [p("0xH1", 3, ["0xH1"])] }, 2, ["0xH1"]],
    ["agent on human + evidence-derived → min = 1, roots union", { kind: "plan", author: "agent", parents: [p("0xH1", 3, ["0xH1"]), p("0xM1", 1, ["email:x"])] }, 1, ["0xH1", "email:x"]],
    ["agent on two agent memories → 2", { kind: "fact", author: "agent", parents: [p("0xA", 2, []), p("0xB", 2, ["0xH2"])] }, 2, ["0xH2"]],
    ["evidence → 1 with the source as root", { kind: "evidence", author: "agent", source: { type: "email", id: "email:acme-0611" }, parents: [] }, 1, ["email:acme-0611"]],
    ["evidence citing a parent keeps the parent's roots too", { kind: "evidence", author: "agent", source: { type: "web", id: "web:acme.example" }, parents: [p("0xH1", 3, ["0xH1"])] }, 1, ["web:acme.example", "0xH1"]],
    ["ref pointer → 1 with the ref as root", { kind: "ref", author: "agent", ref: { kind: "github", locator: "demo/specs:brand.md", version: SHA, label: "Brand v3" }, parents: [] }, 1, [`github:demo/specs:brand.md@${SHA}`]],
    ["human → 3, rooted in itself", { kind: "decision", author: "human", parents: [] }, 3, ["$self"]],
  ] as const)("%s", (_name, input, trust, roots) => {
    const out = computeLineage(input as Parameters<typeof computeLineage>[0]);
    expect(out.trust).toBe(trust);
    expect(out.roots).toEqual(roots);
  });

  it("dedupes roots and keeps their first-seen order", () => {
    const out = computeLineage({ kind: "fact", author: "agent", parents: [p("0xA", 1, ["email:x", "0xH1"]), p("0xB", 2, ["0xH1", "email:y"])] });
    expect(out.roots).toEqual(["email:x", "0xH1", "email:y"]);
  });

  it("refuses evidence without a source", () => {
    expect(() => computeLineage({ kind: "evidence", author: "agent", parents: [] })).toThrow(/source/);
  });
});

describe("validation", () => {
  it("folder scope: lead '*' writes anywhere; a worker only inside its folder", () => {
    expect(scopeAllows("*", "finance")).toBe(true);
    expect(scopeAllows("research", "research")).toBe(true);
    expect(scopeAllows("research", "research/acme")).toBe(true);
    expect(scopeAllows("research", "finance")).toBe(false);
    expect(scopeAllows("research", "researchers")).toBe(false);
    expect(scopeAllows("", "research")).toBe(false);
  });

  it("folder names are simple paths", () => {
    expect(() => validateFolder("research/acme")).not.toThrow();
    for (const bad of ["", "Research", "../x", "/abs", "a b", "x".repeat(65)]) expect(() => validateFolder(bad), bad).toThrow();
  });

  it("refs: allowed kinds only, github needs a commit SHA, label ≤ 80, never the content", () => {
    const allowed = ["github", "notion", "url"] as const;
    expect(() => validateRef({ kind: "github", locator: "demo/specs:brand.md", version: SHA, label: "Brand v3" }, allowed)).not.toThrow();
    expect(() => validateRef({ kind: "github", locator: "demo/specs:brand.md", label: "x" }, allowed)).toThrow(/SHA/);
    expect(() => validateRef({ kind: "github", locator: "demo/specs:brand.md", version: "main", label: "x" }, allowed)).toThrow(/SHA/);
    expect(() => validateRef({ kind: "github", locator: "no-colon", version: SHA, label: "x" }, allowed)).toThrow(/owner\/repo:path/);
    expect(() => validateRef({ kind: "notion", locator: "abc123", label: "y".repeat(81) }, allowed)).toThrow(/label/);
    expect(() => validateRef({ kind: "notion", locator: "abc123", label: "Spec" }, ["github"])).toThrow(/not allowed/);
    expect(refRootId({ kind: "notion", locator: "abc123", label: "Spec" })).toBe("notion:abc123");
  });

  it("sources: known type, id fits an Arkiv indexed string (128 bytes)", () => {
    expect(() => validateSource({ type: "email", id: "email:acme-0611" })).not.toThrow();
    expect(() => validateSource({ type: "fax" as never, id: "x" })).toThrow(/type/);
    expect(() => validateSource({ type: "web", id: "" })).toThrow(/id/);
    expect(() => validateSource({ type: "web", id: "é".repeat(65) })).toThrow(/128/);
  });
});
