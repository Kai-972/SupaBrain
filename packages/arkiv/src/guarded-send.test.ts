import { encodeErrorResult, encodeFunctionData, keccak256, parseAbi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { ARKIV_ERRORS_ABI } from "./errors";
import { ArkivWriteError } from "./errors";
import { DryRunStop, guardedSend, type ArkivChainPort, type TxSigner } from "./guarded-send";

const REGISTRY = ("0x" + "44".repeat(20)) as Hex;
const SIGNER = ("0x" + "a1".repeat(20)) as Hex;
const OTHER = ("0x" + "b2".repeat(20)) as Hex;
const CHAIN = 1234;
const executeAbi = parseAbi(["function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)"]);

const dataFor = (ops: number): Hex =>
  encodeFunctionData({ abi: executeAbi, functionName: "execute", args: [Array.from({ length: ops }, () => ({ operation: 1, operationData: "0x01" as Hex }))] });

function setup(over: Partial<ArkivChainPort> = {}) {
  const calls: string[] = [];
  const sent: Hex[] = [];
  const port: ArkivChainPort = {
    chainId: async () => CHAIN,
    nonce: async () => 7,
    blockGasLimit: async () => 100_000_000n,
    balance: async () => 10n ** 18n,
    estimateGas: async () => 300_000n,
    call: async () => undefined,
    sendRaw: async (raw) => { calls.push("sendRaw"); sent.push(raw); return keccak256(raw); },
    ...over,
  };
  const signed: unknown[] = [];
  const signer: TxSigner = {
    address: SIGNER,
    signTransaction: async (tx) => { calls.push("sign"); signed.push(tx); return "0xdeadbeef"; },
  };
  const deps = { port, signer, expectedChainId: CHAIN, registry: REGISTRY };
  const req = { from: SIGNER, to: REGISTRY, data: dataFor(3), nonce: 7, gasPrice: 1_000_000_000n };
  return { port, signer, deps, req, calls, signed, sent };
}

const codeOf = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return (e as ArkivWriteError).code; }
  return "NO_ERROR";
};

describe("guardedSend", () => {
  it("signs a legacy tx with the gas rule applied and verifies the returned hash", async () => {
    const { deps, req, signed } = setup();
    const r = await guardedSend(deps, req);
    // ops=3 → floor 1.8M; 2×estimate = 0.6M → floor wins
    expect(r.gas).toBe(1_800_000n);
    expect(r).toMatchObject({ ops: 3, estimate: 300_000n, nonce: 7, gasPrice: 1_000_000_000n });
    expect(r.hash).toBe(keccak256("0xdeadbeef"));
    expect(signed).toEqual([{ type: "legacy", chainId: CHAIN, to: REGISTRY, data: req.data, value: 0n, gas: 1_800_000n, gasPrice: 1_000_000_000n, nonce: 7 }]);
  });

  it("uses 2×estimate when the estimate is large", async () => {
    const { deps, req } = setup({ estimateGas: async () => 2_000_000n });
    expect((await guardedSend(deps, req)).gas).toBe(4_000_000n);
  });

  it("refuses a chain mismatch before estimating, signing or sending", async () => {
    const { deps, req, calls } = setup({ chainId: async () => 1 });
    expect(await codeOf(guardedSend(deps, req))).toBe("CHAIN_MISMATCH");
    expect(calls).toEqual([]);
  });

  it("refuses anything that is not a plain execute() to the Arkiv registry from the signer", async () => {
    const { deps, req, calls } = setup();
    expect(await codeOf(guardedSend(deps, { ...req, to: OTHER }))).toBe("UNEXPECTED_TX");
    expect(await codeOf(guardedSend(deps, { ...req, from: OTHER }))).toBe("UNEXPECTED_TX");
    expect(await codeOf(guardedSend(deps, { ...req, data: "0x12345678" }))).toBe("UNEXPECTED_TX");
    expect(await codeOf(guardedSend(deps, { ...req, data: encodeFunctionData({ abi: executeAbi, functionName: "execute", args: [[]] }) }))).toBe("UNEXPECTED_TX");
    expect(calls).toEqual([]);
  });

  it("stops before signing when the estimate reverts, and names the Arkiv error", async () => {
    const data = encodeErrorResult({ abi: ARKIV_ERRORS_ABI, errorName: "ReadOnlyEntity", args: [("0x" + "ab".repeat(32)) as Hex] });
    const { deps, req, calls } = setup({
      estimateGas: async () => { throw Object.assign(new Error("execution reverted"), { data }); },
    });
    const err = (await guardedSend(deps, req).catch((e) => e)) as ArkivWriteError;
    expect(err.code).toBe("ESTIMATE_FAILED");
    expect(err.message).toContain("ReadOnlyEntity");
    expect(calls).toEqual([]);
  });

  it("when estimateGas gives no revert data (Rabdi), asks eth_call for it and names the error", async () => {
    const data = encodeErrorResult({ abi: ARKIV_ERRORS_ABI, errorName: "NotOwner", args: [("0x" + "01".repeat(32)) as Hex, SIGNER, OTHER] });
    const { deps, req, calls } = setup({
      estimateGas: async () => { throw new Error("Execution error without revert data"); },
      call: async () => { throw Object.assign(new Error("reverted"), { data }); },
    });
    const err = (await guardedSend(deps, req).catch((e) => e)) as ArkivWriteError;
    expect(err.code).toBe("ESTIMATE_FAILED");
    expect(err.message).toContain("NotOwner");
    expect(calls).toEqual([]);
  });

  it("keeps the estimate's own message when eth_call has nothing more to say", async () => {
    const { deps, req } = setup({ estimateGas: async () => { throw new Error("Execution error without revert data"); } });
    const err = (await guardedSend(deps, req).catch((e) => e)) as ArkivWriteError;
    expect(err.message).toContain("Execution error without revert data");
  });

  it("finds revert data nested in a cause chain", async () => {
    const data = encodeErrorResult({ abi: ARKIV_ERRORS_ABI, errorName: "NotOwner", args: [("0x" + "01".repeat(32)) as Hex, SIGNER, OTHER] });
    const inner = Object.assign(new Error("inner"), { data });
    const { deps, req } = setup({ estimateGas: async () => { throw Object.assign(new Error("outer"), { cause: inner }); } });
    const err = (await guardedSend(deps, req).catch((e) => e)) as ArkivWriteError;
    expect(err.message).toContain("NotOwner");
  });

  it("never leaks an RPC URL (the access key rides in the path) in any error", async () => {
    const leaky = new Error("request to https://rpc.example.test/ark_live_SECRET123 failed");
    for (const over of [{ estimateGas: async () => { throw leaky; } }, { sendRaw: async () => { throw leaky; } }] as Partial<ArkivChainPort>[]) {
      const { deps, req } = setup(over);
      const err = (await guardedSend(deps, req).catch((e) => e)) as ArkivWriteError;
      expect(err.message).not.toContain("SECRET123");
      expect(err.message).toContain("https://rpc.example.test/***");
    }
  });

  it("refuses gas above half the block limit", async () => {
    const { deps, req, calls } = setup({ blockGasLimit: async () => 3_000_000n });
    expect(await codeOf(guardedSend(deps, req))).toBe("GAS_LIMIT_EXCEEDED");
    expect(calls).toEqual([]);
  });

  it("refuses when the wallet cannot pay the worst case (gas × gasPrice)", async () => {
    const { deps, req, calls } = setup({ balance: async () => 1_800_000n * 1_000_000_000n - 1n });
    expect(await codeOf(guardedSend(deps, req))).toBe("INSUFFICIENT_FUNDS");
    expect(calls).toEqual([]);
  });

  it("refuses when the account nonce moved since the request was built (no blind resend)", async () => {
    const { deps, req, calls } = setup({ nonce: async () => 8 });
    expect(await codeOf(guardedSend(deps, req))).toBe("NONCE_CHANGED");
    expect(calls).toEqual([]);
  });

  it("flags a hash that does not match the signed bytes, and reports send failures without retrying", async () => {
    const wrong = setup({ sendRaw: async () => ("0x" + "00".repeat(32)) as Hex });
    expect(await codeOf(guardedSend(wrong.deps, wrong.req))).toBe("HASH_MISMATCH");

    let attempts = 0;
    const failing = setup({ sendRaw: async () => { attempts++; throw new Error("socket hang up"); } });
    expect(await codeOf(guardedSend(failing.deps, failing.req))).toBe("SEND_FAILED");
    expect(attempts).toBe(1);
  });

  it("dry run: runs every check and the estimate, then stops with the gas plan and signs/sends nothing", async () => {
    const { deps, req, calls } = setup();
    const stop = (await guardedSend({ ...deps, dryRun: true }, req).catch((e) => e)) as DryRunStop;
    expect(stop).toBeInstanceOf(DryRunStop);
    expect(stop.plan).toMatchObject({ gas: 1_800_000n, estimate: 300_000n, ops: 3, nonce: 7, gasPrice: 1_000_000_000n });
    expect(calls).toEqual([]);
  });

  it("dry run still refuses what a real run would refuse (revert, funds, chain)", async () => {
    for (const [over, code] of [
      [{ estimateGas: async () => { throw new Error("execution reverted"); } }, "ESTIMATE_FAILED"],
      [{ balance: async () => 0n }, "INSUFFICIENT_FUNDS"],
      [{ chainId: async () => 1 }, "CHAIN_MISMATCH"],
    ] as [Partial<ArkivChainPort>, string][]) {
      const { deps, req } = setup(over);
      expect(await codeOf(guardedSend({ ...deps, dryRun: true }, req))).toBe(code);
    }
  });
});
