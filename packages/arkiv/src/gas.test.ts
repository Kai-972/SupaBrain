import { describe, expect, it } from "vitest";
import { ArkivWriteError } from "./errors";
import { arkivGas } from "./gas";

// Rule (Arkiv MCP guides/quickstart, CLAUDE.md §5): gas = max(1_000_000 + 400_000×(ops−1), 2×estimate),
// and gas must stay within half the block gas limit.
const BIG_BLOCK = 100_000_000n;

describe("arkivGas", () => {
  it("uses the floor when the estimate is small", () => {
    expect(arkivGas({ ops: 1, estimate: 100_000n, blockGasLimit: BIG_BLOCK })).toBe(1_000_000n);
    expect(arkivGas({ ops: 8, estimate: 100_000n, blockGasLimit: BIG_BLOCK })).toBe(3_800_000n);
  });

  it("uses twice the estimate when that is larger than the floor", () => {
    expect(arkivGas({ ops: 1, estimate: 900_000n, blockGasLimit: BIG_BLOCK })).toBe(1_800_000n);
    expect(arkivGas({ ops: 2, estimate: 1_000_000n, blockGasLimit: BIG_BLOCK })).toBe(2_000_000n);
  });

  it("allows exactly half the block gas limit and refuses anything above", () => {
    expect(arkivGas({ ops: 1, estimate: 1_000_000n, blockGasLimit: 4_000_000n })).toBe(2_000_000n);
    expect(() => arkivGas({ ops: 1, estimate: 1_000_001n, blockGasLimit: 4_000_000n })).toThrowError(ArkivWriteError);
  });

  it("refuses a bad estimate, op count or block limit instead of guessing", () => {
    const code = (fn: () => unknown) => {
      try { fn(); } catch (e) { return (e as ArkivWriteError).code; }
      return undefined;
    };
    expect(code(() => arkivGas({ ops: 1, estimate: 0n, blockGasLimit: BIG_BLOCK }))).toBe("ESTIMATE_INVALID");
    expect(code(() => arkivGas({ ops: 0, estimate: 1n, blockGasLimit: BIG_BLOCK }))).toBe("OPS_INVALID");
    expect(code(() => arkivGas({ ops: 1.5, estimate: 1n, blockGasLimit: BIG_BLOCK }))).toBe("OPS_INVALID");
    expect(code(() => arkivGas({ ops: 1, estimate: 1n, blockGasLimit: 0n }))).toBe("GAS_LIMIT_EXCEEDED");
    expect(code(() => arkivGas({ ops: 40, estimate: 1n, blockGasLimit: 20_000_000n }))).toBe("GAS_LIMIT_EXCEEDED");
  });
});
