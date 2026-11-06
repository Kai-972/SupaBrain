import { describe, expect, it } from "vitest";
import { isValidAttributeName } from "@arkiv-network/sdk/schema";
import { ALL_SCHEMAS, Edge, Memory, Notice, Payment, Revocation, Taint } from "./schemas";

describe("Arkiv schemas", () => {
  it("defines the six entity types under the sb.* tags", () => {
    expect(ALL_SCHEMAS.map((s) => s.name)).toEqual(["sb.memory", "sb.edge", "sb.taint", "sb.revocation", "sb.notice", "sb.payment"]);
  });

  it("indexes app and team on every schema (CLAUDE.md §6: every query filters by both)", () => {
    for (const s of ALL_SCHEMAS) {
      expect(s.columns.app?.isIndexed, `${s.name}.app`).toBe(true);
      expect(s.columns.team?.isIndexed, `${s.name}.team`).toBe(true);
    }
  });

  it("only uses legal attribute names (SDK reserves words such as `by`)", () => {
    for (const s of ALL_SCHEMAS) {
      for (const name of Object.keys(s.columns)) expect(isValidAttributeName(name), `${s.name}.${name}`).toBe(true);
    }
  });

  it("keeps the memory body as unindexed bytes and the filter columns indexed", () => {
    expect(Memory.columns.body?.type).toBe("bytes");
    expect(Memory.columns.body?.isIndexed).toBe(false);
    for (const c of ["kind", "folder", "trust", "agent", "vendor", "seq"] as const) expect(Memory.columns[c]?.isIndexed, c).toBe(true);
  });

  it("indexes the lookups the engine needs: edge parent/child, taint root/memory, notice recipient", () => {
    expect([Edge.columns.parent?.isIndexed, Edge.columns.child?.isIndexed]).toEqual([true, true]);
    expect([Taint.columns.root?.isIndexed, Taint.columns.memory?.isIndexed]).toEqual([true, true]);
    expect([Notice.columns.toAgent?.isIndexed, Notice.columns.revocation?.isIndexed]).toEqual([true, true]);
    expect([Revocation.columns.target?.isIndexed, Revocation.columns.targetType?.isIndexed]).toEqual([true, true]);
    expect([Payment.columns.payee?.isIndexed, Payment.columns.status?.isIndexed, Payment.columns.intent?.isIndexed]).toEqual([true, true, true]);
  });

  it("never indexes a bytes column (SDK would throw) and never exceeds 32 attributes", () => {
    for (const s of ALL_SCHEMAS) {
      expect(Object.keys(s.columns).length).toBeLessThanOrEqual(32);
      for (const c of Object.values(s.columns)) if (c.type === "bytes") expect(c.isIndexed).toBe(false);
    }
  });
});
