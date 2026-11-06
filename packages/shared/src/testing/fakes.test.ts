import { describe, expect, it } from "vitest";
import type { MemoryNode } from "../types";
import { FakeArkivWriter, FakeEns, FakeGraph } from "./index";

const node = (key: string, parents: string[], extra: Partial<MemoryNode> = {}): MemoryNode => ({
  key: key as `0x${string}`, text: key, kind: "fact", folder: "f", trust: 2, agent: "a", vendor: "claude",
  seq: 0, createdAt: 0, expiresAt: 0, parents, roots: [], status: "active", ...extra,
});

describe("FakeGraph", () => {
  // The fixture chain from C-UI.md §5: E1 -> M1 -> M2 (also H1) -> M3
  const g = new FakeGraph([
    node("0xH1", []), node("0xE1", [], { address: "0xBAD0000000000000000000000000000000000001" }),
    node("0xM1", ["0xE1"], { address: "0xbad0000000000000000000000000000000000001", subject: "acme.demo.eth" }),
    node("0xM2", ["0xH1", "0xM1"]), node("0xM3", ["0xM2"]),
  ]);

  it("walks transitive ancestors once each", () => {
    expect(g.ancestors("0xM3").map((n) => n.key).sort()).toEqual(["0xE1", "0xH1", "0xM1", "0xM2"]);
    expect(g.ancestors("0xH1")).toEqual([]);
  });

  it("matches addresses case-insensitively and subjects exactly", () => {
    expect(g.memoriesByAddress("0xbad0000000000000000000000000000000000001").map((n) => n.key)).toEqual(["0xE1", "0xM1"]);
    expect(g.memoriesBySubject("acme.demo.eth").map((n) => n.key)).toEqual(["0xM1"]);
  });

  it("gets one node by key, including quarantined ones", () => {
    g.setStatus("0xM1", "quarantined");
    expect(g.get("0xM1")?.status).toBe("quarantined");
    expect(g.get("0xNOPE")).toBeUndefined();
  });

  it("reports status and treats unknown keys as expired", () => {
    g.setStatus("0xM1", "quarantined");
    expect(g.status("0xM1")).toBe("quarantined");
    expect(g.status("0xNOPE")).toBe("expired");
  });
});

describe("FakeEns", () => {
  it("fails every read when failing (callers must fail closed)", async () => {
    const ens = new FakeEns({ names: { "acme.demo.eth": "0x9F20000000000000000000000000000000000002" }, vendors: ["acme.demo.eth"] });
    expect(await ens.findVendorEns("0x9f20000000000000000000000000000000000002")).toBe("acme.demo.eth");
    ens.failing = true;
    await expect(ens.resolveEns("acme.demo.eth")).rejects.toThrow();
  });
});

describe("FakeArkivWriter", () => {
  it("records payments with deterministic keys", async () => {
    const w = new FakeArkivWriter();
    const r = await w.writePayment({} as never);
    expect(r.key).toMatch(/^0x0{63}1$/);
    expect(w.payments).toHaveLength(1);
  });
});
