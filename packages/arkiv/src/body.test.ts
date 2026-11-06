import { describe, expect, it } from "vitest";
import { decodeBody, encodeBody, MAX_BODY_BYTES } from "./body";

describe("entity body codec (JSON bytes)", () => {
  it("round-trips through bytes and through 0x-hex", () => {
    const v = { text: "Acme moved to a new wallet — see email", parents: ["0x01"], roots: ["email:inv-77"], n: 3 };
    const bytes = encodeBody(v);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(decodeBody(bytes)).toEqual(v);
    const hex = `0x${Buffer.from(bytes).toString("hex")}` as const;
    expect(decodeBody(hex)).toEqual(v);
  });

  it("refuses a body over the 128 KiB per-create budget instead of failing on chain", () => {
    expect(MAX_BODY_BYTES).toBe(128 * 1024);
    expect(() => encodeBody({ text: "x".repeat(MAX_BODY_BYTES) })).toThrow(/128 KiB/);
  });

  it("refuses non-JSON bytes with a clear error", () => {
    expect(() => decodeBody(new TextEncoder().encode("not json"))).toThrow(/not valid JSON/);
  });
});
