// "Disputed by ENS" (docs/research/supermemory-plan.md #2): a memory that claims an address for a team vendor which
// differs from the vendor's live ENS record is flagged, never latest-wins. Pure function; computed on read.
import type { MemoryNode } from "@supabrain/shared";
import { describe, expect, it } from "vitest";
import { claimedAddresses, disputeOf, disputeText, type VendorAddresses } from "./conflict";

const ACME = "acme.supabrain.eth";
const REAL = "0x9F20000000000000000000000000000000000002" as const;
const BAD = "0xBAD0000000000000000000000000000000000001";
const vendors: VendorAddresses = new Map([[ACME, REAL]]);

const node = (extra: Partial<MemoryNode>): MemoryNode => ({
  key: "0xK" as `0x${string}`, text: "", kind: "fact", folder: "research", trust: 1, agent: "gem-research", vendor: "gemini",
  seq: 1, createdAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, parents: [], roots: [], status: "active", ...extra,
});

describe("claimedAddresses", () => {
  it("takes the address field and every exactly-40-hex address in the text, lowercased and unique", () => {
    expect(claimedAddresses(node({ address: BAD as `0x${string}`, text: `wallet ${BAD.toLowerCase()} and ${REAL}` }))).toEqual([BAD.toLowerCase(), REAL.toLowerCase()]);
  });
  it("ignores 64-hex keys and tx hashes", () => {
    expect(claimedAddresses(node({ text: `tx 0x${"ab".repeat(32)} key 0x${"cd".repeat(32)}` }))).toEqual([]);
  });
});

describe("disputeOf", () => {
  it("address field differs from the vendor's ENS record → disputed", () => {
    expect(disputeOf(node({ subject: ACME, kind: "address", address: BAD as `0x${string}` }), vendors))
      .toEqual({ state: "disputed", subject: ACME, ensAddress: REAL, claimed: [BAD.toLowerCase()] });
  });

  it("address only in the text → disputed (live models skip the address field)", () => {
    expect(disputeOf(node({ subject: ACME, kind: "evidence", text: `Acme: our wallet changed to ${BAD}` }), vendors)?.state).toBe("disputed");
  });

  it("matches ENS (any letter case) → no flag", () => {
    expect(disputeOf(node({ subject: ACME, kind: "address", address: REAL.toLowerCase() as `0x${string}` }), vendors)).toBeUndefined();
  });

  it("text naming the real address and another one → disputed for the other one only", () => {
    expect(disputeOf(node({ subject: ACME, text: `old ${REAL}, new ${BAD}` }), vendors)).toMatchObject({ state: "disputed", claimed: [BAD.toLowerCase()] });
  });

  it("subject that is not a team vendor, or no subject, or no address → no flag", () => {
    expect(disputeOf(node({ subject: "attacker.eth", address: BAD as `0x${string}` }), vendors)).toBeUndefined();
    expect(disputeOf(node({ address: BAD as `0x${string}` }), vendors)).toBeUndefined();
    expect(disputeOf(node({ subject: ACME, text: "Acme invoice is 5 USDC" }), vendors)).toBeUndefined();
  });

  it("subject letter case doesn't matter", () => {
    expect(disputeOf(node({ subject: "ACME.supabrain.eth", address: BAD as `0x${string}` }), vendors)?.state).toBe("disputed");
  });

  it("ENS unreadable or no address record → unverified, never an error", () => {
    expect(disputeOf(node({ subject: ACME, address: BAD as `0x${string}` }), new Map([[ACME, "unavailable"]]))).toEqual({ state: "unverified", subject: ACME, reason: "ENS could not be read" });
    expect(disputeOf(node({ subject: ACME, address: BAD as `0x${string}` }), new Map([[ACME, null]]))).toEqual({ state: "unverified", subject: ACME, reason: "no address record on ENS" });
  });

  it("payment memories and expired memories are never flagged", () => {
    expect(disputeOf(node({ subject: ACME, kind: "payment", address: BAD as `0x${string}` }), vendors)).toBeUndefined();
    expect(disputeOf(node({ subject: ACME, address: BAD as `0x${string}`, status: "expired" }), vendors)).toBeUndefined();
  });

  it("is still computed for quarantined memories (callers show QUARANTINED first)", () => {
    expect(disputeOf(node({ subject: ACME, address: BAD as `0x${string}`, status: "quarantined" }), vendors)?.state).toBe("disputed");
  });
});

describe("disputeText", () => {
  it("says what ENS says and that a human decides", () => {
    const t = disputeText({ state: "disputed", subject: ACME, ensAddress: REAL, claimed: [BAD.toLowerCase()] });
    expect(t).toMatch(/DISPUTED by ENS/);
    expect(t).toContain(ACME);
    expect(t).toContain(REAL);
    expect(t).toMatch(/do not pay/i);
    expect(disputeText({ state: "unverified", subject: ACME, reason: "ENS could not be read" })).toMatch(/UNVERIFIED/);
  });
});
