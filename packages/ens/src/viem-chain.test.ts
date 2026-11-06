// A transient RPC error right after a rule change must not stop an AI; a persistent one still fails closed.
import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { createViemEnsChain } from "./viem-chain";

const REG = "0x0000000000000000000000000000000000000001" as const;

describe("createViemEnsChain retries", () => {
  it("one failed read is retried and succeeds", async () => {
    let calls = 0;
    const client = { getEnsText: async () => { calls++; if (calls === 1) throw new Error("header not found"); return "active"; } } as unknown as PublicClient;
    expect(await createViemEnsChain(client, { retryDelayMs: 1 }).getEnsText("gemini.otter.supabrain.eth", "sb.status")).toBe("active");
    expect(calls).toBe(2);
  });

  it("a read that keeps failing still throws (the authority then fails closed)", async () => {
    let calls = 0;
    const client = { readContract: async () => { calls++; throw new Error("rpc down"); } } as unknown as PublicClient;
    await expect(createViemEnsChain(client, { retryDelayMs: 1 }).getOwner(REG, 1n)).rejects.toThrow(/rpc down/);
    expect(calls).toBe(3);
  });
});
